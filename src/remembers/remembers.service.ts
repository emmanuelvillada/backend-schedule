import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
@Injectable()
export class RemembersService {
  private readonly logger = new Logger(RemembersService.name);

  constructor(
    private prisma: PrismaService,
    private email: MailService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendReminders() {
    const ahora = new Date();
    const enUnaHora = new Date(ahora.getTime() + 60 * 60_000);

    const candidatas = await this.prisma.appointment.findMany({
      where: {
        notificationSent: false,
        status: { not: 'CANCELLED' }, // ajusta al valor real de tu enum AppointmentStatus
        startTime: { gt: ahora, lte: enUnaHora },
      },
      include: {
        client: {
          select: { name: true, email: true, phone: true, whatsappOptIn: true },
        },
        employee: { select: { user: { select: { name: true } } } },
        business: { select: { name: true } },
      },
    });

    for (const cita of candidatas) {
      // "Reclamo" atómico: solo una instancia gana, evita duplicados
      const { count } = await this.prisma.appointment.updateMany({
        where: {
          id: cita.id,
          notificationSent: false,
          status: { not: 'CANCELLED' }, // por si se canceló entre la consulta y el reclamo
        },
        data: { notificationSent: true },
      });
      if (count === 0) continue;

      try {
        await this.notifications.sendAppointmentReminder({
          name: cita.client.name ?? 'cliente',
          email: cita.client.email,
          phone: cita.client.phone,
          whatsappOptIn: cita.client.whatsappOptIn,
          businessName: cita.business.name,
          employeeName: cita.employee?.user.name,
          startTime: cita.startTime,
        });
      } catch (err) {
        // Si falla el envío, liberamos la cita para reintentar en el próximo ciclo
        await this.prisma.appointment.update({
          where: { id: cita.id },
          data: { notificationSent: false },
        });
        this.logger.error(`Fallo recordatorio de la cita ${cita.id}`, err);
      }
    }
  }
}
