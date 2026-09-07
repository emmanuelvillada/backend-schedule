import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthUser } from 'src/auth/types/auth-user.type';
import { FindAdminBusinessesQueryDto } from './dto/find-admin-businesses-query.dto';
import { FindAdminUsersQueryDto } from './dto/find-admin-users-query.dto';

const USER_LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  emailVerified: true,
  isActive: true,
  createdAt: true,
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listBusinesses(query: FindAdminBusinessesQueryDto) {
    const { search, page = 1, limit = 20 } = query;

    const where: Prisma.BusinessWhereInput = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { owner: { email: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.business.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.business.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async setBusinessActive(id: string, isActive: boolean) {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }
    return this.prisma.business.update({ where: { id }, data: { isActive } });
  }

  async listUsers(query: FindAdminUsersQueryDto) {
    const { search, role, page = 1, limit = 20 } = query;

    const where: Prisma.UserWhereInput = {
      ...(role && { role }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: USER_LIST_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async setUserActive(id: string, isActive: boolean, admin: AuthUser) {
    if (id === admin.id) {
      throw new BadRequestException(
        'No puedes suspender tu propia cuenta de administrador',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: USER_LIST_SELECT,
    });
  }
}
