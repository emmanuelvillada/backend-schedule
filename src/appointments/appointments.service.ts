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
import { SchedulesService } from 'src/schedules/schedules.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulesService: SchedulesService,
  ) {}

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

    // 2. Resolver con qué trabajador queda la cita (o ninguno, si el
    // negocio no tiene trabajadores) validando disponibilidad real.
    const employeeId = await this.resolveEmployee(dto, startTime, endTime);

    // 3. Crear appointment con sus servicios
    return this.prisma.appointment.create({
      data: {
        startTime,
        endTime,
        businessId: dto.businessId,
        clientId: dto.clientId,
        employeeId,
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

  // Si el cliente eligió un trabajador, valida que sea de ese negocio y que
  // esté libre. Si no eligió y el negocio tiene trabajadores, le asigna
  // automáticamente uno disponible. Si el negocio no tiene trabajadores,
  // conserva el comportamiento original (chequeo a nivel de todo el negocio).
  private async resolveEmployee(
    dto: CreateAppointmentDto,
    startTime: Date,
    endTime: Date,
  ): Promise<string | null> {
    if (dto.employeeId) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: dto.employeeId },
      });
      if (!employee || employee.businessId !== dto.businessId) {
        throw new BadRequestException(
          'El trabajador seleccionado no pertenece a este negocio',
        );
      }

      const conflict = await this.prisma.appointment.findFirst({
        where: {
          employeeId: dto.employeeId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
        },
      });
      if (conflict) {
        throw new BadRequestException(
          'The selected time slot is not available',
        );
      }
      return dto.employeeId;
    }

    const employeeCount = await this.prisma.employee.count({
      where: { businessId: dto.businessId },
    });

    if (employeeCount === 0) {
      const conflict = await this.prisma.appointment.findFirst({
        where: {
          businessId: dto.businessId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
        },
      });
      if (conflict) {
        throw new BadRequestException(
          'The selected time slot is not available',
        );
      }
      return null;
    }

    const availableEmployeeId =
      await this.schedulesService.findAvailableEmployee(
        dto.businessId,
        startTime,
        endTime,
      );
    if (!availableEmployeeId) {
      throw new BadRequestException('The selected time slot is not available');
    }
    return availableEmployeeId;
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
