import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { SupabaseStorageService } from 'src/storage/supabase-storage.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { AuthUser } from 'src/auth/types/auth-user.type';

const SALT_ROUNDS = 10;
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

const EMPLOYEE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatarUrl: true,
};

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private storage: SupabaseStorageService,
  ) {}

  async create(dto: CreateEmployeeDto, user: AuthUser) {
    const business = await this.prisma.business.findUnique({
      where: { ownerId: user.id },
    });
    if (!business) {
      throw new BadRequestException(
        'Debes crear tu negocio antes de agregar trabajadores',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }

    // Contraseña temporal e inutilizable: el empleado define la suya desde
    // el enlace que le llega por correo, nunca inicia sesión con esta.
    const temporaryPassword = randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    const employee = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          name: dto.name,
          phone: dto.phone,
          role: 'EMPLOYEE',
        },
      });

      return tx.employee.create({
        data: { userId: newUser.id, businessId: business.id },
        include: {
          user: { select: EMPLOYEE_USER_SELECT },
        },
      });
    });

    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: employee.user.id,
        token: hashedToken,
        expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
      },
    });

    // El trabajador y su token de invitación ya quedaron guardados; que el
    // correo falle (ej. proveedor en modo sandbox) no debe tumbar la
    // creación ni ocultar al dueño que el trabajador sí se creó.
    try {
      await this.mailService.sendEmployeeInviteEmail(
        employee.user.email,
        employee.user.name,
        business.name,
        rawToken,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo enviar la invitación al trabajador: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return employee;
  }

  async findAllByBusiness(businessId: string, user: AuthUser) {
    await this.ensureOwnership(businessId, user);
    return this.prisma.employee.findMany({
      where: { businessId },
      include: {
        user: { select: EMPLOYEE_USER_SELECT },
      },
    });
  }

  // Lista pública mínima, usada por el cliente para elegir con quién
  // reservar (sin exponer email/teléfono). La foto sí se expone: es
  // justamente lo que le facilita al cliente identificar a cada trabajador.
  findPublicByBusiness(businessId: string) {
    return this.prisma.employee.findMany({
      where: { businessId },
      select: {
        id: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    });
  }

  async setAvatar(id: string, file: Express.Multer.File, user: AuthUser) {
    const employee = await this.findEmployeeWithAccess(id, user);

    if (employee.user.avatarPath) {
      await this.storage.deleteAvatar(employee.user.avatarPath);
    }

    const { url, path } = await this.storage.uploadAvatar(
      employee.userId,
      file,
    );

    const updatedUser = await this.prisma.user.update({
      where: { id: employee.userId },
      data: { avatarUrl: url, avatarPath: path },
      select: EMPLOYEE_USER_SELECT,
    });

    return { ...employee, user: updatedUser };
  }

  async removeAvatar(id: string, user: AuthUser) {
    const employee = await this.findEmployeeWithAccess(id, user);

    if (employee.user.avatarPath) {
      await this.storage.deleteAvatar(employee.user.avatarPath);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: employee.userId },
      data: { avatarUrl: null, avatarPath: null },
      select: EMPLOYEE_USER_SELECT,
    });

    return { ...employee, user: updatedUser };
  }

  // Dueño/admin del negocio, o el propio trabajador gestionando su foto.
  private async findEmployeeWithAccess(id: string, user: AuthUser) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: { select: { ...EMPLOYEE_USER_SELECT, avatarPath: true } },
      },
    });
    if (!employee) {
      throw new NotFoundException('Trabajador no encontrado');
    }

    if (employee.userId !== user.id) {
      await this.ensureOwnership(employee.businessId, user);
    }

    return employee;
  }

  async remove(id: string, user: AuthUser) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { user: { select: { avatarPath: true } } },
    });
    if (!employee) {
      throw new NotFoundException('Trabajador no encontrado');
    }
    await this.ensureOwnership(employee.businessId, user);

    await this.prisma.$transaction([
      this.prisma.employeeSchedule.deleteMany({ where: { employeeId: id } }),
      this.prisma.employee.delete({ where: { id } }),
      this.prisma.user.delete({ where: { id: employee.userId } }),
    ]);

    if (employee.user.avatarPath) {
      await this.storage.deleteAvatar(employee.user.avatarPath);
    }

    return { message: 'Trabajador eliminado' };
  }

  private async ensureOwnership(businessId: string, user: AuthUser) {
    if (user.role === 'ADMIN') return;

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business || business.ownerId !== user.id) {
      throw new ForbiddenException('No tienes permiso sobre este negocio');
    }
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
