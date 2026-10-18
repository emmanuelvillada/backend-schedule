import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { CreateEmployeeScheduleDto } from './dto/create-employee-schedule.dto';
import { CreateBusinessClosureDto } from './dto/create-business-closure.dto';
import { AuthUser } from 'src/auth/types/auth-user.type';

// Los slots candidatos siguen alineados a una grilla de 30 min (mejor UX
// que ofrecer horas sueltas); lo que cambia es que ahora se exige que la
// duración completa del servicio quepa libre a partir de ahí.
const SLOT_STEP_MIN = 30;
const DEFAULT_SLOT_DURATION_MIN = 30;

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

  // ─── Closures (días puntuales sin servicio: festivos, vacaciones) ──

  async createClosure(
    businessId: string,
    dto: CreateBusinessClosureDto,
    user: AuthUser,
  ) {
    await this.ensureBusinessOwnership(businessId, user);
    try {
      return await this.prisma.businessClosure.create({
        data: { businessId, date: dto.date, reason: dto.reason },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ese día ya está bloqueado');
      }
      throw error;
    }
  }

  getClosures(businessId: string) {
    return this.prisma.businessClosure.findMany({
      where: { businessId },
      orderBy: { date: 'asc' },
    });
  }

  async removeClosure(id: string, user: AuthUser) {
    const closure = await this.prisma.businessClosure.findUnique({
      where: { id },
    });
    if (!closure) throw new NotFoundException('Día bloqueado no encontrado');
    await this.ensureBusinessOwnership(closure.businessId, user);
    return this.prisma.businessClosure.delete({ where: { id } });
  }

  // Usado tanto por getAvailableSlots como por AppointmentsService (para
  // que un cliente no pueda reservar mandando la fecha directo a la API).
  async isClosed(businessId: string, date: string): Promise<boolean> {
    const closure = await this.prisma.businessClosure.findUnique({
      where: { businessId_date: { businessId, date } },
    });
    return !!closure;
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
    durationMin: number = DEFAULT_SLOT_DURATION_MIN,
  ): Promise<string[]> {
    if (await this.isClosed(businessId, date)) return [];

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
        durationMin,
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
        durationMin,
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
          durationMin,
        ),
      ),
    );

    return Array.from(new Set(perEmployee.flat())).sort();
  }

  // Único lugar donde se resuelve qué horario aplica un día dado: el propio
  // del trabajador si tiene uno configurado, si no el general del negocio.
  // Lo usa tanto la disponibilidad (abajo) como AppointmentsService, para
  // rechazar en el servidor una cita que se saldría del horario de atención
  // aunque el cliente la mande directo a la API sin pasar por estos slots.
  async getOpenHours(
    businessId: string,
    employeeId: string | null,
    dayOfWeek: number,
  ): Promise<{ openTime: string; closeTime: string } | null> {
    if (employeeId) {
      const employeeSchedule = await this.prisma.employeeSchedule.findFirst({
        where: { employeeId, dayOfWeek },
      });
      if (employeeSchedule) {
        return {
          openTime: employeeSchedule.startTime,
          closeTime: employeeSchedule.endTime,
        };
      }
    }

    const businessSchedule = await this.prisma.schedule.findFirst({
      where: { businessId, dayOfWeek },
    });
    return businessSchedule
      ? {
          openTime: businessSchedule.openTime,
          closeTime: businessSchedule.closeTime,
        }
      : null;
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
    durationMin: number,
  ): Promise<string[]> {
    const hours = await this.getOpenHours(businessId, employeeId, dayOfWeek);
    if (!hours) return []; // Ni el trabajador ni el negocio abren ese día

    const slots = this.generateSlots(
      hours.openTime,
      hours.closeTime,
      SLOT_STEP_MIN,
    );

    const appointments = await this.prisma.appointment.findMany({
      where: {
        employeeId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      select: { startTime: true, endTime: true },
    });

    return this.filterAvailable(
      slots,
      date,
      hours.closeTime,
      durationMin,
      appointments,
    );
  }

  private async getBusinessLevelSlots(
    businessId: string,
    dayOfWeek: number,
    date: string,
    startOfDay: Date,
    endOfDay: Date,
    durationMin: number,
  ): Promise<string[]> {
    const hours = await this.getOpenHours(businessId, null, dayOfWeek);
    if (!hours) return [];

    const slots = this.generateSlots(
      hours.openTime,
      hours.closeTime,
      SLOT_STEP_MIN,
    );

    const appointments = await this.prisma.appointment.findMany({
      where: {
        businessId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      select: { startTime: true, endTime: true },
    });

    return this.filterAvailable(
      slots,
      date,
      hours.closeTime,
      durationMin,
      appointments,
    );
  }

  // Un slot solo cuenta como disponible si TODO el rango que ocuparía el
  // servicio (no solo su instante de inicio) está libre de otras citas y
  // cabe antes del cierre — no solo si el propio inicio cae fuera de un
  // rango ocupado, que es lo que hacía antes y podía ofrecer horas que en
  // realidad se solapaban con la cita siguiente o se pasaban del cierre.
  private filterAvailable(
    slots: string[],
    date: string,
    closeTime: string,
    durationMin: number,
    appointments: { startTime: Date; endTime: Date }[],
  ): string[] {
    const [closeH, closeM] = closeTime.split(':').map(Number);
    const closesAt = new Date(`${date}T00:00:00.000Z`);
    closesAt.setUTCHours(closeH, closeM, 0, 0);

    return slots.filter((slot) => {
      const slotStart = new Date(`${date}T${slot}:00.000Z`);
      const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);

      if (slotEnd > closesAt) return false;

      return !appointments.some(
        (apt) => slotStart < apt.endTime && slotEnd > apt.startTime,
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
