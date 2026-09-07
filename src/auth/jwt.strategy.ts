import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      // Lee primero la cookie, si no existe intenta el header Bearer
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null => {
          const cookies = req?.cookies as Record<string, string> | undefined;
          return cookies?.token ?? null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  // Se consulta la BD en cada request (en vez de confiar ciegamente en el
  // payload del JWT) para que una cuenta suspendida por un admin pierda el
  // acceso de inmediato y no siga siendo válida hasta que expire el token
  // (hasta 7 días).
  async validate(payload: { sub: string; email: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Cuenta suspendida o inexistente');
    }
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
