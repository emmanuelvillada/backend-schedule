import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { AuthUser } from 'src/auth/types/auth-user.type';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAppointmentDto) {
    // 1. Obtener servicios y calcular duración total
    const services = await this.prisma.service.findMany({
      where: { id: { in: dto.serviceIds }, isActive: true },
    });

    if (services.length !== dto.serviceIds.length) {
      throw new BadRequestException(
        'One or more services are invalid or inactive',
      );
    }

    const totalDuration = services.reduce((sum, s) => sum + s.durationMin, 0);
    const startTime = new Date(dto.startTime);
    const endTime = new Date(startTime.getTime() + totalDuration * 60000);

    // 2. Validar que no haya solapamiento en el negocio
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        businessId: dto.businessId,
        employeeId: dto.employeeId ?? undefined,
        status: { in: ['PENDING', 'CONFIRMED'] },
        OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
      },
    });

    if (conflict) {
      throw new BadRequestException('The selected time slot is not available');
    }

    // 3. Crear appointment con sus servicios
    //const priceAtTime = services.reduce((sum, s) => sum + s.price, 0);

    return this.prisma.appointment.create({
      data: {
        startTime,
        endTime,
        businessId: dto.businessId,
        clientId: dto.clientId,
        employeeId: dto.employeeId,
        services: {
          create: services.map((s) => ({
            serviceId: s.id,
            priceAtTime: s.price,
          })),
        },
      },
      include: {
        services: { include: { service: true } },
        employee: { include: { user: true } },
        client: true,
      },
    });
  }

  async findAllByBusiness(businessId: string, user: AuthUser) {
    await this.ensureBusinessAccess(businessId, user);
    return this.prisma.appointment.findMany({
      where: { businessId },
      include: {
        services: { include: { service: true } },
        client: { select: { id: true, name: true, email: true, phone: true } },
        employee: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  findAllByClient(clientId: string, user: AuthUser) {
    if (user.role !== 'ADMIN' && user.id !== clientId) {
      throw new ForbiddenException('No puedes ver las citas de otro cliente');
    }
    return this.prisma.appointment.findMany({
      where: { clientId },
      include: {
        services: { include: { service: true } },
        business: { select: { id: true, name: true, category: true } },
        employee: { include: { user: { select: { id: true, name: true } } } },
        review: true,
      },
      orderBy: { startTime: 'desc' },
    });
  }

  // Verifica que el usuario (dueño, empleado o admin) tenga permiso sobre
  // las citas de este negocio.
  private async ensureBusinessAccess(businessId: string, user: AuthUser) {
    if (user.role === 'ADMIN') return;

    if (user.role === 'BUSINESS_OWNER') {
      const business = await this.prisma.business.findUnique({
        where: { id: businessId },
      });
      if (!business || business.ownerId !== user.id) {
        throw new ForbiddenException('No tienes permiso sobre este negocio');
      }
      return;
    }

    if (user.role === 'EMPLOYEE') {
      const employee = await this.prisma.employee.findUnique({
        where: { userId: user.id },
      });
      if (!employee || employee.businessId !== businessId) {
        throw new ForbiddenException('No tienes permiso sobre este negocio');
      }
      return;
    }

    throw new ForbiddenException('No tienes permiso sobre este negocio');
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        services: { include: { service: true } },
        client: { select: { id: true, name: true, email: true, phone: true } },
        employee: { include: { user: true } },
        business: true,
      },
    });
    if (!appointment)
      throw new NotFoundException(`Appointment ${id} not found`);
    return appointment;
  }

  async updateStatus(id: string, dto: UpdateAppointmentStatusDto) {
    await this.findOne(id);
    return this.prisma.appointment.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async cancel(id: string) {
    await this.findOne(id);
    return this.prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
