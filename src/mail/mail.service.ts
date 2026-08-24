import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Escapa caracteres especiales de HTML para evitar HTML/Script injection
// cuando interpolamos datos del usuario dentro de las plantillas.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly mailFrom: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    if (!apiKey) {
      throw new Error('RESEND_API_KEY no está configurada.');
    }

    this.mailFrom =
      this.configService.get<string>('MAIL_FROM') ??
      'Mi Aplicación <noreply@tudominio.com>';

    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? '';

    if (!this.frontendUrl) {
      this.logger.warn(
        'FRONTEND_URL no está configurada, los enlaces de los correos quedarán incompletos.',
      );
    }

    this.resend = new Resend(apiKey);
  }

  async sendEmail(options: SendEmailOptions) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.mailFrom,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      if (error) {
        this.logger.error(
          `Error de Resend al enviar a ${options.to}: ${error.message}`,
          error,
        );
        throw new InternalServerErrorException(
          'No fue posible enviar el correo.',
        );
      }

      this.logger.log(`Correo enviado correctamente a ${options.to}`);

      return data;
    } catch (error) {
      // Si ya es la excepción que lanzamos arriba, la dejamos pasar tal cual
      // para no perder el mensaje ni envolverla dos veces.
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      this.logger.error(
        `Error inesperado al enviar correo a ${options.to}`,
        error instanceof Error ? error.stack : error,
      );

      throw new InternalServerErrorException(
        'Ocurrió un error al enviar el correo.',
      );
    }
  }

  async sendVerificationEmail(email: string, token: string) {
    const url = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(
      token,
    )}`;

    return this.sendEmail({
      to: email,
      subject: 'Verifica tu cuenta',
      html: this.buildLayout(`
        <h2>Bienvenido</h2>
        <p>Gracias por registrarte.</p>
        <p>Haz clic en el siguiente enlace para verificar tu cuenta:</p>
        <p><a href="${url}">Verificar cuenta</a></p>
      `),
      text: `Bienvenido. Verifica tu cuenta en el siguiente enlace: ${url}`,
    });
  }

  async sendResetPasswordEmail(email: string, token: string) {
    const url = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(
      token,
    )}`;

    return this.sendEmail({
      to: email,
      subject: 'Recuperación de contraseña',
      html: this.buildLayout(`
        <h2>Recuperación de contraseña</h2>
        <p>Haz clic en el siguiente enlace para cambiar tu contraseña:</p>
        <p><a href="${url}">Cambiar contraseña</a></p>
      `),
      text: `Recuperación de contraseña. Cambia tu contraseña en el siguiente enlace: ${url}`,
    });
  }

  async sendEmployeeInviteEmail(
    email: string,
    name: string,
    businessName: string,
    token: string,
  ) {
    const safeName = escapeHtml(name);
    const safeBusinessName = escapeHtml(businessName);
    const url = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(
      token,
    )}`;

    return this.sendEmail({
      to: email,
      subject: `Te sumaron como empleado de ${businessName}`,
      html: this.buildLayout(`
        <h2>Hola ${safeName}</h2>
        <p>Te agregaron como empleado de <strong>${safeBusinessName}</strong> en Schedule.</p>
        <p>Haz clic en el siguiente enlace para definir tu contraseña y acceder a tu cuenta:</p>
        <p><a href="${url}">Definir contraseña</a></p>
      `),
      text: `Hola ${name}. Te agregaron como empleado de ${businessName} en Schedule. Define tu contraseña en el siguiente enlace: ${url}`,
    });
  }

  async sendWelcomeEmail(email: string, name: string) {
    const safeName = escapeHtml(name);

    return this.sendEmail({
      to: email,
      subject: 'Bienvenido',
      html: this.buildLayout(`
        <h2>Hola ${safeName}</h2>
        <p>Tu cuenta fue creada correctamente.</p>
        <p>Esperamos que disfrutes la aplicación.</p>
      `),
      text: `Hola ${safeName}. Tu cuenta fue creada correctamente. Esperamos que disfrutes la aplicación.`,
    });
  }

  // Punto único para envolver el contenido de cada correo.
  // Si luego quieres agregar header/footer/estilos comunes, solo tocas aquí.
  private buildLayout(content: string): string {
    return `
      <div style="font-family: sans-serif; line-height: 1.5; color: #222;">
        ${content}
      </div>
    `;
  }
}
