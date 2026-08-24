import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { CreateEmployeeScheduleDto } from './dto/create-employee-schedule.dto';
import { AuthUser } from 'src/auth/types/auth-user.type';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Business Schedules ───────────────────────────────────────────

  async createBusinessSchedule(dto: CreateScheduleDto, user: AuthUser) {
    await this.ensureBusinessOwnership(dto.businessId, user);
    return this.prisma.schedule.create({ data: dto });
  }

  getBusinessSchedules(businessId: string) {
    return this.prisma.schedule.findMany({
      where: { businessId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async removeBusinessSchedule(id: string, user: AuthUser) {
    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException(`Schedule ${id} not found`);
    await this.ensureBusinessOwnership(schedule.businessId, user);
    return this.prisma.schedule.delete({ where: { id } });
  }

  // ─── Employee Schedules ───────────────────────────────────────────

  async createEmployeeSchedule(dto: CreateEmployeeScheduleDto, user: AuthUser) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');
    await this.ensureBusinessOwnership(employee.businessId, user);
    return this.prisma.employeeSchedule.create({ data: dto });
  }

  getEmployeeSchedules(employeeId: string) {
    return this.prisma.employeeSchedule.findMany({
      where: { employeeId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async removeEmployeeSchedule(id: string, user: AuthUser) {
    const schedule = await this.prisma.employeeSchedule.findUnique({
      where: { id },
    });
    if (!schedule)
      throw new NotFoundException(`EmployeeSchedule ${id} not found`);

    const employee = await this.prisma.employee.findUnique({
      where: { id: schedule.employeeId },
    });
    if (employee) {
      await this.ensureBusinessOwnership(employee.businessId, user);
    }
    return this.prisma.employeeSchedule.delete({ where: { id } });
  }

  // ─── Availability (usado por Appointments) ────────────────────────

  /**
   * Slots de 30min disponibles para un negocio en una fecha dada.
   * - Si se pasa `employeeId`: usa el horario propio de ese trabajador
   *   (o el del negocio si no configuró uno para ese día) y solo excluye
   *   sus propias citas.
   * - Si no se pasa `employeeId` y el negocio tiene trabajadores: un slot
   *   está disponible si AL MENOS UN trabajador está libre (unión).
   * - Si el negocio no tiene trabajadores: comportamiento original,
   *   horario del negocio menos todas sus citas.
   */
  async getAvailableSlots(
    businessId: string,
    date: string,
    employeeId?: string,
  ): Promise<string[]> {
    const dayOfWeek = new Date(date).getUTCDay();
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    if (employeeId) {
      return this.getEmployeeAvailableSlots(
        businessId,
        employeeId,
        dayOfWeek,
        date,
        startOfDay,
        endOfDay,
      );
    }

    const employees = await this.prisma.employee.findMany({
      where: { businessId },
    });

    if (employees.length === 0) {
      return this.getBusinessLevelSlots(
        businessId,
        dayOfWeek,
        date,
        startOfDay,
        endOfDay,
      );
    }

    const perEmployee = await Promise.all(
      employees.map((e) =>
        this.getEmployeeAvailableSlots(
          businessId,
          e.id,
          dayOfWeek,
          date,
          startOfDay,
          endOfDay,
        ),
      ),
    );

    return Array.from(new Set(perEmployee.flat())).sort();
  }

  /**
   * Busca un trabajador libre para ese rango horario. Lo usa
   * AppointmentsService cuando el cliente reserva sin elegir con quién.
   */
  async findAvailableEmployee(
    businessId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<string | null> {
    const employees = await this.prisma.employee.findMany({
      where: { businessId },
    });

    for (const employee of employees) {
      const conflict = await this.prisma.appointment.findFirst({
        where: {
          employeeId: employee.id,
          status: { in: ['PENDING', 'CONFIRMED'] },
          OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
        },
      });
      if (!conflict) return employee.id;
    }

    return null;
  }

  private async getEmployeeAvailableSlots(
    businessId: string,
    employeeId: string,
    dayOfWeek: number,
    date: string,
    startOfDay: Date,
    endOfDay: Date,
  ): Promise<string[]> {
    const employeeSchedule = await this.prisma.employeeSchedule.findFirst({
      where: { employeeId, dayOfWeek },
    });

    let openTime: string;
    let closeTime: string;

    if (employeeSchedule) {
      openTime = employeeSchedule.startTime;
      closeTime = employeeSchedule.endTime;
    } else {
      const businessSchedule = await this.prisma.schedule.findFirst({
        where: { businessId, dayOfWeek },
      });
      if (!businessSchedule) return []; // Ni el trabajador ni el negocio abren ese día
      openTime = businessSchedule.openTime;
      closeTime = businessSchedule.closeTime;
    }

    const slots = this.generateSlots(openTime, closeTime, 30);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        employeeId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      select: { startTime: true, endTime: true },
    });

    return this.filterAvailable(slots, date, appointments);
  }

  private async getBusinessLevelSlots(
    businessId: string,
    dayOfWeek: number,
    date: string,
    startOfDay: Date,
    endOfDay: Date,
  ): Promise<string[]> {
    const schedule = await this.prisma.schedule.findFirst({
      where: { businessId, dayOfWeek },
    });
    if (!schedule) return [];

    const slots = this.generateSlots(schedule.openTime, schedule.closeTime, 30);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        businessId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      select: { startTime: true, endTime: true },
    });

    return this.filterAvailable(slots, date, appointments);
  }

  private filterAvailable(
    slots: string[],
    date: string,
    appointments: { startTime: Date; endTime: Date }[],
  ): string[] {
    return slots.filter((slot) => {
      const slotStart = new Date(`${date}T${slot}:00.000Z`);
      return !appointments.some(
        (apt) => slotStart >= apt.startTime && slotStart < apt.endTime,
      );
    });
  }

  private generateSlots(
    open: string,
    close: string,
    stepMin: number,
  ): string[] {
    const slots: string[] = [];
    const [openH, openM] = open.split(':').map(Number);
    const [closeH, closeM] = close.split(':').map(Number);
    let current = openH * 60 + openM;
    const end = closeH * 60 + closeM;

    while (current < end) {
      const h = String(Math.floor(current / 60)).padStart(2, '0');
      const m = String(current % 60).padStart(2, '0');
      slots.push(`${h}:${m}`);
      current += stepMin;
    }

    return slots;
  }

  private async ensureBusinessOwnership(businessId: string, user: AuthUser) {
    if (user.role === 'ADMIN') return;

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business || business.ownerId !== user.id) {
      throw new ForbiddenException('No tienes permiso sobre este negocio');
    }
  }
}
