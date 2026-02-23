import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { CreateEmployeeScheduleDto } from './dto/create-employee-schedule.dto';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Business Schedules ───────────────────────────────────────────

  createBusinessSchedule(dto: CreateScheduleDto) {
    return this.prisma.schedule.create({ data: dto });
  }

  getBusinessSchedules(businessId: string) {
    return this.prisma.schedule.findMany({
      where: { businessId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async removeBusinessSchedule(id: string) {
    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException(`Schedule ${id} not found`);
    return this.prisma.schedule.delete({ where: { id } });
  }

  // ─── Employee Schedules ───────────────────────────────────────────

  createEmployeeSchedule(dto: CreateEmployeeScheduleDto) {
    return this.prisma.employeeSchedule.create({ data: dto });
  }

  getEmployeeSchedules(employeeId: string) {
    return this.prisma.employeeSchedule.findMany({
      where: { employeeId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async removeEmployeeSchedule(id: string) {
    const schedule = await this.prisma.employeeSchedule.findUnique({
      where: { id },
    });
    if (!schedule)
      throw new NotFoundException(`EmployeeSchedule ${id} not found`);
    return this.prisma.employeeSchedule.delete({ where: { id } });
  }

  // ─── Availability (usado por Appointments) ────────────────────────

  /**
   * Retorna slots disponibles de 30min para un negocio en una fecha dada,
   * excluyendo los ya ocupados por appointments confirmados/pendientes.
   */
  async getAvailableSlots(businessId: string, date: string): Promise<string[]> {
    const day = new Date(date);
    const dayOfWeek = day.getUTCDay();

    const schedule = await this.prisma.schedule.findFirst({
      where: { businessId, dayOfWeek },
    });

    if (!schedule) return []; // Negocio cerrado ese día

    const slots = this.generateSlots(schedule.openTime, schedule.closeTime, 30);

    // Obtener citas existentes ese día
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        businessId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      select: { startTime: true, endTime: true },
    });

    // Filtrar slots ocupados
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
}
