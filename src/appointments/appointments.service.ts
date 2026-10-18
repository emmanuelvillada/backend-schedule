import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { AuthUser } from 'src/auth/types/auth-user.type';
import { SchedulesService } from 'src/schedules/schedules.service';
import { MailService } from 'src/mail/mail.service';
import { GetStatsQueryDto } from './dto/get-stats-query.dto';

const BUSINESS_WITH_OWNER = { business: { include: { owner: true } } };

const STATS_TIMEZONE = 'America/Bogota';
const STATUS_ORDER = [
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
] as const;
const TOP_SERVICES_LIMIT = 5;

// El servidor corre en UTC (Cloud Run); los negocios operan en hora de
// Colombia, así que agrupar "por día" o "por hora" en UTC les mostraría
// estadísticas desfasadas varias horas respecto a su reloj real.
function bogotaDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TIMEZONE }).format(
    date,
  );
}

function bogotaHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: STATS_TIMEZONE,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(date),
  );
}

// Include completo usado por cualquier endpoint que devuelva una cita ya
// creada (findOne, cancel, updateStatus): el frontend necesita servicios,
// negocio, cliente, empleado y pago en la misma respuesta para poder pintar
// la tarjeta de la cita sin pedir datos adicionales.
const FULL_APPOINTMENT_INCLUDE = {
  services: { include: { service: true } },
  client: { select: { id: true, name: true, email: true, phone: true } },
  employee: { include: { user: true } },
  payment: true,
  ...BUSINESS_WITH_OWNER,
};

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulesService: SchedulesService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateAppointmentDto, user: AuthUser) {
    // 0. Un CLIENT solo puede reservar para sí mismo; solo el negocio (dueño
    // o empleado) o un admin pueden reservar a nombre de otro cliente
    // (ej. un walk-in que no tiene cuenta y llama por teléfono).
    const clientId = user.role === 'CLIENT' ? user.id : dto.clientId;

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

    // 2. Rechazar si el negocio marcó ese día como cerrado (vacaciones,
    // festivos, etc.) — no solo confiar en que el frontend deshabilitó la
    // fecha, un cliente podría mandar la reserva directo a la API.
    const dateStr = startTime.toISOString().slice(0, 10);
    if (await this.schedulesService.isClosed(dto.businessId, dateStr)) {
      throw new BadRequestException('El negocio no atiende ese día');
    }

    // 3. Resolver con qué trabajador queda la cita (o ninguno, si el
    // negocio no tiene trabajadores) validando disponibilidad real.
    const employeeId = await this.resolveEmployee(dto, startTime, endTime);

    // 3.5. Rechazar si la cita completa (con la duración real de los
    // servicios elegidos) no cabe dentro del horario de atención — no solo
    // confiar en que el listado de horarios disponibles ya la haya filtrado,
    // un cliente podría mandar cualquier hora directo a la API.
    const hours = await this.schedulesService.getOpenHours(
      dto.businessId,
      employeeId,
      startTime.getUTCDay(),
    );
    if (!hours || !this.isWithinHours(startTime, endTime, hours)) {
      throw new BadRequestException(
        'El horario seleccionado está fuera del horario de atención',
      );
    }

    // 4. Crear appointment con sus servicios
    const appointment = await this.prisma.appointment.create({
      data: {
        startTime,
        endTime,
        businessId: dto.businessId,
        clientId,
        employeeId,
        services: {
          create: services.map((s) => ({
            serviceId: s.id,
            priceAtTime: s.price,
          })),
        },
      },
      include: FULL_APPOINTMENT_INCLUDE,
    });

    await this.notifyBooked(appointment);

    return appointment;
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

  private isWithinHours(
    startTime: Date,
    endTime: Date,
    hours: { openTime: string; closeTime: string },
  ): boolean {
    const [openH, openM] = hours.openTime.split(':').map(Number);
    const [closeH, closeM] = hours.closeTime.split(':').map(Number);

    const opensAt = new Date(startTime);
    opensAt.setUTCHours(openH, openM, 0, 0);
    const closesAt = new Date(startTime);
    closesAt.setUTCHours(closeH, closeM, 0, 0);

    return startTime >= opensAt && endTime <= closesAt;
  }

  async findAllByBusiness(businessId: string, user: AuthUser) {
    await this.ensureBusinessAccess(businessId, user);

    // Un EMPLOYEE ve solo sus propias citas; dueño/admin ven todas.
    const employeeScope = await this.getEmployeeScope(businessId, user);

    return this.prisma.appointment.findMany({
      where: { businessId, ...employeeScope },
      include: {
        services: { include: { service: true } },
        client: { select: { id: true, name: true, email: true, phone: true } },
        employee: { include: { user: { select: { id: true, name: true } } } },
        payment: true,
      },
      orderBy: { startTime: 'asc' },
    });
  }

  // Estadísticas para el panel del negocio: ingresos por día, citas por
  // estado, servicios más rentables y horas más ocupadas. Solo el dueño y un
  // admin la ven — un empleado normalmente no debería ver los ingresos
  // totales del negocio.
  async getStats(businessId: string, user: AuthUser, query: GetStatsQueryDto) {
    await this.ensureBusinessAccess(businessId, user);

    const days = query.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const appointments = await this.prisma.appointment.findMany({
      where: { businessId, startTime: { gte: since } },
      select: {
        status: true,
        startTime: true,
        services: {
          select: {
            serviceId: true,
            priceAtTime: true,
            service: { select: { name: true } },
          },
        },
      },
    });

    const byStatus = new Map<string, number>(
      STATUS_ORDER.map((status) => [status, 0]),
    );
    const revenueByDayMap = new Map<
      string,
      { revenue: number; appointments: number }
    >();
    const byHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: 0,
    }));
    const serviceStats = new Map<
      string,
      { name: string; count: number; revenue: number }
    >();

    let totalRevenue = 0;
    let completedAppointments = 0;
    let cancelledAppointments = 0;

    for (const apt of appointments) {
      byStatus.set(apt.status, (byStatus.get(apt.status) ?? 0) + 1);
      if (apt.status === 'COMPLETED') completedAppointments++;
      if (apt.status === 'CANCELLED') cancelledAppointments++;

      // Las citas canceladas no cuentan como ingreso ni ocupan horario real.
      if (apt.status === 'CANCELLED') continue;

      const aptRevenue = apt.services.reduce(
        (sum, s) => sum + s.priceAtTime,
        0,
      );
      totalRevenue += aptRevenue;

      const dateKey = bogotaDateKey(apt.startTime);
      const dayEntry = revenueByDayMap.get(dateKey) ?? {
        revenue: 0,
        appointments: 0,
      };
      dayEntry.revenue += aptRevenue;
      dayEntry.appointments += 1;
      revenueByDayMap.set(dateKey, dayEntry);

      byHour[bogotaHour(apt.startTime)].count++;

      for (const s of apt.services) {
        const entry = serviceStats.get(s.serviceId) ?? {
          name: s.service.name,
          count: 0,
          revenue: 0,
        };
        entry.count++;
        entry.revenue += s.priceAtTime;
        serviceStats.set(s.serviceId, entry);
      }
    }

    // Serie continua día por día (sin huecos) para que el gráfico no salte.
    const revenueByDay: {
      date: string;
      revenue: number;
      appointments: number;
    }[] = [];
    for (let i = 0; i < days; i++) {
      const day = new Date(since);
      day.setDate(day.getDate() + i);
      const key = bogotaDateKey(day);
      const entry = revenueByDayMap.get(key);
      revenueByDay.push({
        date: key,
        revenue: entry?.revenue ?? 0,
        appointments: entry?.appointments ?? 0,
      });
    }

    const topServices = Array.from(serviceStats.entries())
      .map(([serviceId, s]) => ({ serviceId, ...s }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, TOP_SERVICES_LIMIT);

    const totalAppointments = appointments.length;
    const paidAppointments = totalAppointments - cancelledAppointments;

    return {
      summary: {
        totalAppointments,
        totalRevenue,
        completedAppointments,
        cancelledAppointments,
        averageTicket:
          paidAppointments > 0 ? totalRevenue / paidAppointments : 0,
      },
      byStatus: STATUS_ORDER.map((status) => ({
        status,
        count: byStatus.get(status) ?? 0,
      })),
      revenueByDay,
      topServices,
      byHour,
    };
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
        payment: true,
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

  // Si quien pide la lista es un EMPLOYEE, devuelve el filtro para que solo
  // vea sus propias citas (no toda la agenda del negocio).
  private async getEmployeeScope(businessId: string, user: AuthUser) {
    if (user.role !== 'EMPLOYEE') return {};

    const employee = await this.prisma.employee.findUnique({
      where: { userId: user.id },
    });
    return employee ? { employeeId: employee.id } : {};
  }

  async findOne(id: string, user: AuthUser) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: FULL_APPOINTMENT_INCLUDE,
    });
    if (!appointment)
      throw new NotFoundException(`Appointment ${id} not found`);
    await this.ensureAppointmentAccess(appointment, user);
    return appointment;
  }

  async updateStatus(
    id: string,
    dto: UpdateAppointmentStatusDto,
    user: AuthUser,
  ) {
    const appointment = await this.findOne(id, user);
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: dto.status },
      include: FULL_APPOINTMENT_INCLUDE,
    });

    if (dto.status === 'CONFIRMED' || dto.status === 'COMPLETED') {
      await this.notifyStatus(appointment, dto.status);
    }

    return updated;
  }

  async cancel(id: string, user: AuthUser) {
    const appointment = await this.findOne(id, user);
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: FULL_APPOINTMENT_INCLUDE,
    });

    await this.notifyStatus(appointment, 'CANCELLED');

    return updated;
  }

  // Cliente dueño de la cita, o dueño/empleado del negocio, o admin.
  private async ensureAppointmentAccess(
    appointment: { clientId: string; businessId: string },
    user: AuthUser,
  ) {
    if (user.role === 'ADMIN') return;

    if (user.role === 'CLIENT') {
      if (appointment.clientId !== user.id) {
        throw new ForbiddenException('No tienes permiso sobre esta cita');
      }
      return;
    }

    await this.ensureBusinessAccess(appointment.businessId, user);
  }

  // Los correos nunca deben tumbar una operación que ya tuvo éxito en la
  // base de datos — si Resend falla, solo lo logueamos.
  private async notifyBooked(appointment: {
    startTime: Date;
    client: { email: string; name: string };
    business: { name: string; owner: { email: string; name: string } };
  }) {
    try {
      await this.mailService.sendAppointmentConfirmationEmail(
        appointment.client.email,
        appointment.client.name,
        appointment.business.name,
        appointment.startTime,
      );
      await this.mailService.sendNewBookingOwnerEmail(
        appointment.business.owner.email,
        appointment.business.owner.name,
        appointment.business.name,
        appointment.client.name,
        appointment.startTime,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar la nueva cita: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async notifyStatus(
    appointment: {
      startTime: Date;
      client: { email: string; name: string };
      business: { name: string };
    },
    status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED',
  ) {
    try {
      await this.mailService.sendAppointmentStatusEmail(
        appointment.client.email,
        appointment.client.name,
        appointment.business.name,
        status,
        appointment.startTime,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar el cambio de estado: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
