import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailService } from 'src/mail/mail.service';
import { GoogleProfile } from './google.strategy';

const SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.role === 'BUSINESS_OWNER' && !dto.business) {
      throw new BadRequestException(
        'Debes completar la información del negocio',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          name: dto.name,
          role: dto.role,
        },
      });

      if (dto.role === 'BUSINESS_OWNER' && dto.business) {
        await tx.business.create({
          data: {
            name: dto.business.name,
            description: dto.business.description,
            category: dto.business.category,
            latitude: dto.business.latitude,
            longitude: dto.business.longitude,
            ownerId: newUser.id,
          },
        });
      }

      return newUser;
    });

    // No verificar el correo no debe impedir que la cuenta quede creada; si
    // el envío falla, el usuario puede reenviarlo después.
    await this.sendVerificationEmail(user).catch((error: unknown) => {
      this.logger.warn(
        `No se pudo enviar el correo de verificación: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    return this.signToken(user.id, user.email, user.role);
  }

  private async sendVerificationEmail(user: { id: string; email: string }) {
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      },
    });

    await this.mailService.sendVerificationEmail(user.email, rawToken);
  }

  async verifyEmail(token: string) {
    const hashedToken = this.hashToken(token);

    const verificationToken =
      await this.prisma.emailVerificationToken.findUnique({
        where: { token: hashedToken },
      });

    if (
      !verificationToken ||
      verificationToken.usedAt ||
      verificationToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerified: true },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Correo verificado correctamente.' };
  }

  async resendVerificationEmail(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (user.emailVerified) {
      return { message: 'Tu correo ya está verificado.' };
    }

    await this.sendVerificationEmail(user);
    return { message: 'Correo de verificación reenviado.' };
  }

  // Si ya existe una cuenta con ese correo (creada con contraseña o con
  // Google antes), inicia sesión ahí. Si no, crea una cuenta CLIENT nueva
  // — "Continuar con Google" siempre es para clientes; un dueño de negocio
  // sigue necesitando el registro completo (para cargar los datos del negocio).
  async loginWithGoogle(profile: GoogleProfile) {
    let user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (!user) {
      // Contraseña aleatoria e inutilizable: esta cuenta solo se accede vía
      // Google, salvo que después pase por "olvidé mi contraseña".
      const randomPassword = randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, SALT_ROUNDS);

      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          password: hashedPassword,
          role: 'CLIENT',
          emailVerified: true, // Google ya verificó este correo
        },
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Tu cuenta ha sido suspendida');
    }

    return this.signToken(user.id, user.email, user.role);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Tu cuenta ha sido suspendida');
    }

    return this.signToken(user.id, user.email, user.role);
  }

  private signToken(id: string, email: string, role: string) {
    const payload = { sub: id, email, role };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Respuesta genérica siempre, exista o no el usuario,
    // para evitar enumeración de correos registrados.
    const genericResponse = {
      message:
        'Si el correo existe en nuestro sistema, recibirás instrucciones para recuperar tu contraseña.',
    };

    if (!user) {
      this.logger.warn(
        `Intento de reset de contraseña para correo no registrado: ${email}`,
      );
      return genericResponse;
    }

    // Invalida cualquier token anterior sin usar del mismo usuario
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    // El token en texto plano solo se envía por correo, nunca se guarda así en BD
    await this.mailService.sendResetPasswordEmail(user.email, rawToken);

    return genericResponse;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const hashedToken = this.hashToken(dto.token);

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Contraseña actualizada correctamente.' };
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
