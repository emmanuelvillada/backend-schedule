// whatsapp/whatsapp.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatDateEs } from '../common/utils/date'; // extrae aquí tu formatDateEs para compartirlo con el mail

export interface WhatsappReminderData {
  to: string; // teléfono en formato internacional, ej. 573001234567
  name: string;
  businessName: string;
  startTime: Date;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly url: string;
  private readonly token: string;

  constructor(private readonly config: ConfigService) {
    const version = this.config.getOrThrow<string>('WHATSAPP_API_VERSION');
    const phoneNumberId = this.config.getOrThrow<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    this.url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    this.token = this.config.getOrThrow<string>('WHATSAPP_TOKEN');
  }

  async sendReminder({
    to,
    name,
    businessName,
    startTime,
  }: WhatsappReminderData) {
    // Variables de la plantilla, en orden: {{1}} nombre, {{2}} negocio, {{3}} fecha
    return this.sendTemplate(to, 'appointment_reminder', 'es', [
      name,
      businessName,
      formatDateEs(startTime),
    ]);
  }

  private async sendTemplate(
    to: string,
    template: string,
    language: string,
    params: string[],
  ) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: this.normalizePhone(to),
        type: 'template',
        template: {
          name: template,
          language: { code: language },
          components: [
            {
              type: 'body',
              parameters: params.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(10_000), // no dejes colgado el cron si Meta no responde
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      const detail = body?.error?.message ?? res.statusText;
      this.logger.error(`WhatsApp ${res.status}: ${detail}`);
      throw new Error(`WhatsApp respondió ${res.status}: ${detail}`);
    }

    return body; // incluye el id del mensaje (messages[0].id)
  }

  private normalizePhone(phone: string) {
    return phone.replace(/\D/g, ''); // quita '+', espacios y guiones
  }
}
