import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class RemembersService {
  private readonly logger = new Logger(RemembersService.name);

  constructor(
    private prisma: PrismaService,
    private email: MailService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async enviarRecordatorios() {
    const ahora = new Date();
    const enUnaHora = new Date(ahora.getTime() + 60 * 60_000);

    const candidatas = await this.prisma.appointment.findMany({
      where: {
        notificationSent: false,
        startTime: { gt: ahora, lte: enUnaHora },
      },
    });

    for (const reserva of candidatas) {
      // "Reclamo" atómico: solo una instancia gana, evita duplicados
      const { count } = await this.prisma.appointment.updateMany({
        where: { id: reserva.id, notificationSent: false },
        data: { notificationSent: true },
      });
      if (count === 0) continue;

      try {
        await this.email.enviarRecordatorio(reserva);
      } catch (err) {
        // Si falla el envío, liberamos la reserva para reintentar en el próximo ciclo
        await this.prisma.appointment.update({
          where: { id: reserva.id },
          data: { notificationSent: false },
        });
        this.logger.error(
          `Fallo recordatorio de la reserva ${reserva.id}`,
          err,
        );
      }
    }
  }
}
