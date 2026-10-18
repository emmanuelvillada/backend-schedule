import { Injectable } from '@nestjs/common';
import { WhatsappService } from 'src/whatsapp/whatsapp.service';
import { MailService } from 'src/mail/mail.service';
import { Logger } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly mail: MailService,
  ) {}

  async enviarRecordatorioReserva(reserva: {
    nombre: string;
    email: string;
    telefono: string | null;
    whatsappOptIn: boolean;
    inicio: Date;
  }) {
    if (reserva.whatsappOptIn && reserva.telefono) {
      try {
        await this.whatsapp.enviarRecordatorio({
          nombre: reserva.nombre,
          telefono: reserva.telefono,
          inicio: reserva.inicio,
        });
        return;
      } catch (err) {
        this.logger.warn('WhatsApp falló, usando email como respaldo', err);
      }
    }
    await this.mail.sendReminder(reserva);
  }
}
