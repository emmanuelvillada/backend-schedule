import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MercadoPagoConfig,
  Preference,
  Payment as MPPayment,
} from 'mercadopago';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthUser } from 'src/auth/types/auth-user.type';
import { MailService } from 'src/mail/mail.service';

const PAYABLE_STATUSES = ['PENDING', 'CONFIRMED'];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly client: MercadoPagoConfig | null;
  private readonly webhookSecret: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {
    const accessToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );
    this.webhookSecret =
      this.configService.get<string>('MERCADOPAGO_WEBHOOK_SECRET') ?? null;

    if (!accessToken) {
      this.logger.warn(
        'MERCADOPAGO_ACCESS_TOKEN no configurada: los pagos en línea no funcionarán hasta que se configure.',
      );
      this.client = null;
      return;
    }

    this.client = new MercadoPagoConfig({ accessToken });
  }

  async createPreference(appointmentId: string, user: AuthUser) {
    const client = this.ensureClient();

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        services: { include: { service: true } },
        business: true,
        payment: true,
      },
    });
    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }
    if (user.role !== 'ADMIN' && appointment.clientId !== user.id) {
      throw new ForbiddenException('No tienes permiso sobre esta cita');
    }
    if (!PAYABLE_STATUSES.includes(appointment.status)) {
      throw new BadRequestException('Esta cita no admite pago en línea');
    }
    if (appointment.payment?.status === 'APPROVED') {
      throw new BadRequestException('Esta cita ya fue pagada');
    }

    const amount = appointment.services.reduce(
      (sum, s) => sum + s.priceAtTime,
      0,
    );
    if (amount <= 0) {
      throw new BadRequestException('Esta cita no tiene un monto a cobrar');
    }

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const notificationUrl = this.configService.get<string>(
      'MERCADOPAGO_NOTIFICATION_URL',
    );

    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [
          {
            id: appointment.id,
            title: `Cita en ${appointment.business.name}`,
            quantity: 1,
            unit_price: amount,
            currency_id: 'COP',
          },
        ],
        external_reference: appointment.id,
        back_urls: {
          success: `${frontendUrl}/dashboard/appointments?payment=success`,
          failure: `${frontendUrl}/dashboard/appointments?payment=failure`,
          pending: `${frontendUrl}/dashboard/appointments?payment=pending`,
        },
        auto_return: 'approved',
        ...(notificationUrl && { notification_url: notificationUrl }),
      },
    });

    if (!result.id || !result.init_point) {
      throw new InternalServerErrorException(
        'No se pudo generar la preferencia de pago',
      );
    }

    const payment = await this.prisma.payment.upsert({
      where: { appointmentId },
      create: {
        appointmentId,
        amount,
        status: 'PENDING',
        preferenceId: result.id,
      },
      update: { preferenceId: result.id, status: 'PENDING', amount },
    });

    return { initPoint: result.init_point, payment };
  }

  async getStatus(appointmentId: string, user: AuthUser) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { payment: true },
    });
    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }
    if (user.role === 'CLIENT' && appointment.clientId !== user.id) {
      throw new ForbiddenException('No tienes permiso sobre esta cita');
    }
    return appointment.payment;
  }

  // El webhook de MercadoPago no lleva JWT: se autentica verificando la
  // firma HMAC de x-signature contra MERCADOPAGO_WEBHOOK_SECRET.
  async handleWebhook(
    dataId: string | undefined,
    xSignature: string | undefined,
    xRequestId: string | undefined,
  ) {
    const client = this.ensureClient();

    if (!dataId) return;

    if (this.webhookSecret) {
      this.verifySignature(dataId, xSignature, xRequestId);
    } else {
      this.logger.warn(
        'MERCADOPAGO_WEBHOOK_SECRET no configurada: se omite la verificación de firma del webhook.',
      );
    }

    const mpPayment = await new MPPayment(client).get({ id: dataId });
    const appointmentId = mpPayment.external_reference;
    if (!appointmentId) return;

    const status = this.mapStatus(mpPayment.status);

    const payment = await this.prisma.payment.upsert({
      where: { appointmentId },
      create: {
        appointmentId,
        amount: mpPayment.transaction_amount ?? 0,
        status,
        mpPaymentId: String(mpPayment.id),
      },
      update: { status, mpPaymentId: String(mpPayment.id) },
    });

    if (status === 'APPROVED') {
      await this.confirmAppointment(appointmentId);
    }

    return payment;
  }

  private verifySignature(
    dataId: string,
    xSignature: string | undefined,
    xRequestId: string | undefined,
  ) {
    if (!xSignature) {
      throw new UnauthorizedException('Falta la firma del webhook');
    }

    const parts = new Map(
      xSignature.split(',').map((part) => {
        const [key, value] = part.split('=');
        return [key?.trim(), value?.trim()];
      }),
    );
    const ts = parts.get('ts');
    const v1 = parts.get('v1');
    if (!ts || !v1) {
      throw new UnauthorizedException('Firma del webhook con formato inválido');
    }

    const manifest =
      `id:${dataId.toLowerCase()};` +
      (xRequestId ? `request-id:${xRequestId};` : '') +
      `ts:${ts};`;

    const expected = createHmac('sha256', this.webhookSecret as string)
      .update(manifest)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(v1, 'hex');
    const valid =
      expectedBuf.length === receivedBuf.length &&
      timingSafeEqual(expectedBuf, receivedBuf);

    if (!valid) {
      throw new UnauthorizedException('Firma del webhook inválida');
    }
  }

  private mapStatus(
    mpStatus: string | undefined,
  ): 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'REFUNDED' {
    switch (mpStatus) {
      case 'approved':
        return 'APPROVED';
      case 'rejected':
        return 'REJECTED';
      case 'cancelled':
        return 'CANCELLED';
      case 'refunded':
      case 'charged_back':
        return 'REFUNDED';
      default:
        return 'PENDING';
    }
  }

  private async confirmAppointment(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: true, business: true },
    });
    if (!appointment || appointment.status !== 'PENDING') return;

    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CONFIRMED' },
    });

    try {
      await this.mailService.sendAppointmentStatusEmail(
        appointment.client.email,
        appointment.client.name,
        appointment.business.name,
        'CONFIRMED',
        appointment.startTime,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar la confirmación por pago: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private ensureClient(): MercadoPagoConfig {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Los pagos en línea no están configurados en el servidor',
      );
    }
    return this.client;
  }
}
