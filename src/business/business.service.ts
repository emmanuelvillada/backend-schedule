import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { FindBusinessesQueryDto } from './dto/find-businesses-query.dto';
import { Prisma } from '@prisma/client';
import { AuthUser } from 'src/auth/types/auth-user.type';

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  async create(createBusinessDto: CreateBusinessDto, user: AuthUser) {
    // Un BUSINESS_OWNER solo puede crear negocios para sí mismo; solo ADMIN
    // puede asignar el negocio a otro ownerId.
    const ownerId =
      user.role === 'ADMIN' && createBusinessDto.ownerId
        ? createBusinessDto.ownerId
        : user.id;

    return await this.prisma.business.create({
      data: { ...createBusinessDto, ownerId },
    });
  }

  async findOne(id: string) {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }
    return business;
  }

  async update(
    id: string,
    updateBusinessDto: UpdateBusinessDto,
    user: AuthUser,
  ) {
    await this.ensureOwnership(id, user);
    return await this.prisma.business.update({
      where: { id },
      data: updateBusinessDto,
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.ensureOwnership(id, user);
    return await this.prisma.business.delete({ where: { id } });
  }

  //encontrar todos los negocios por cualqier filtro aplicable
  async findAll(query: FindBusinessesQueryDto) {
    const { search, category, ownerId, page = 1, limit = 10 } = query;

    const where: Prisma.BusinessWhereInput = {
      ...(category && { category }),
      ...(ownerId && { ownerId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.business.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.business.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Verifica que el negocio exista y que el usuario sea su dueño (o ADMIN).
  private async ensureOwnership(id: string, user: AuthUser) {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }
    if (user.role !== 'ADMIN' && business.ownerId !== user.id) {
      throw new ForbiddenException('No tienes permiso sobre este negocio');
    }
    return business;
  }
}
