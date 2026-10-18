// notifications/notifications.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

export interface AppointmentReminderData {
  name: string;
  email: string;
  phone?: string | null;
  whatsappOptIn: boolean;
  businessName: string;
  employeeName?: string;
  startTime: Date;
}

export type ReminderChannel = 'whatsapp' | 'email';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly mail: MailService,
  ) {}

  async sendAppointmentReminder(
    data: AppointmentReminderData,
  ): Promise<ReminderChannel> {
    // 1. WhatsApp, solo si el usuario dio su consentimiento y tenemos su teléfono
    if (data.whatsappOptIn && data.phone) {
      try {
        await this.whatsapp.sendReminder({
          to: data.phone,
          name: data.name,
          businessName: data.businessName,
          startTime: data.startTime,
        });
        return 'whatsapp';
      } catch (err) {
        this.logger.warn(
          `WhatsApp falló para ${data.email}, se usará email como respaldo: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // 2. Email: canal por defecto o respaldo. Si falla, el error sube al cron
    await this.mail.sendReminder({
      to: data.email,
      name: data.name,
      startTime: data.startTime,
      employeeName: data.employeeName,
      businessName: data.businessName,
    });
    return 'email';
  }
}
