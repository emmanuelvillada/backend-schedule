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

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;

  constructor(private readonly configService: ConfigService) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
  }

  async sendEmail(options: SendEmailOptions) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: 'Mi Aplicación <noreply@tudominio.com>',
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      if (error) {
        this.logger.error(error);
        throw new InternalServerErrorException(
          'No fue posible enviar el correo.',
        );
      }

      this.logger.log(`Correo enviado correctamente a ${options.to}`);

      return data;
    } catch (error) {
      this.logger.error(error);

      throw new InternalServerErrorException(
        'Ocurrió un error al enviar el correo.',
      );
    }
  }

  async sendVerificationEmail(email: string, token: string) {
    const url = `${this.configService.get(
      'FRONTEND_URL',
    )}/verify-email?token=${token}`;

    return this.sendEmail({
      to: email,
      subject: 'Verifica tu cuenta',
      html: `
        <h2>Bienvenido</h2>

        <p>Gracias por registrarte.</p>

        <p>
          Haz clic en el siguiente enlace para verificar tu cuenta:
        </p>

        <a href="${url}">
          Verificar cuenta
        </a>
      `,
    });
  }

  async sendResetPasswordEmail(email: string, token: string) {
    const url = `${this.configService.get(
      'FRONTEND_URL',
    )}/reset-password?token=${token}`;

    return this.sendEmail({
      to: email,
      subject: 'Recuperación de contraseña',
      html: `
        <h2>Recuperación de contraseña</h2>

        <p>
          Haz clic en el siguiente enlace para cambiar tu contraseña:
        </p>

        <a href="${url}">
          Cambiar contraseña
        </a>
      `,
    });
  }

  async sendWelcomeEmail(email: string, name: string) {
    return this.sendEmail({
      to: email,
      subject: 'Bienvenido',
      html: `
        <h2>Hola ${name}</h2>

        <p>
          Tu cuenta fue creada correctamente.
        </p>

        <p>
          Esperamos que disfrutes la aplicación.
        </p>
      `,
    });
  }
}
