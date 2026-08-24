import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { AuthUser } from 'src/auth/types/auth-user.type';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateServiceDto, user: AuthUser) {
    await this.ensureOwnership(dto.businessId, user);
    return this.prisma.service.create({ data: dto });
  }

  findAllByBusiness(businessId: string) {
    return this.prisma.service.findMany({
      where: { businessId, isActive: true },
    });
  }

  // Vista del dueño: incluye también los servicios desactivados, para que
  // los pueda reactivar.
  async findAllByBusinessForOwner(businessId: string, user: AuthUser) {
    await this.ensureOwnership(businessId, user);
    return this.prisma.service.findMany({ where: { businessId } });
  }

  async findOne(id: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException(`Service ${id} not found`);
    return service;
  }

  async update(id: string, dto: UpdateServiceDto, user: AuthUser) {
    const service = await this.findOne(id);
    await this.ensureOwnership(service.businessId, user);
    return this.prisma.service.update({ where: { id }, data: dto });
  }

  async remove(id: string, user: AuthUser) {
    const service = await this.findOne(id);
    await this.ensureOwnership(service.businessId, user);
    // Soft delete: solo desactiva
    return this.prisma.service.update({
      where: { id },
      data: { isActive: false },
    });
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
}
