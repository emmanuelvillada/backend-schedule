import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AuthUser } from 'src/auth/types/auth-user.type';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':appointmentId/preference')
  @UseGuards(RolesGuard)
  @Roles('CLIENT', 'ADMIN')
  createPreference(
    @Param('appointmentId') appointmentId: string,
    @GetUser() user: AuthUser,
  ) {
    return this.paymentsService.createPreference(appointmentId, user);
  }

  @Get(':appointmentId')
  getStatus(
    @Param('appointmentId') appointmentId: string,
    @GetUser() user: AuthUser,
  ) {
    return this.paymentsService.getStatus(appointmentId, user);
  }

  // MercadoPago llama a esta URL sin JWT; se autentica verificando la firma
  // HMAC de x-signature (ver PaymentsService.handleWebhook).
  @Public()
  @Post('webhook')
  handleWebhook(
    @Query('data.id') dataId: string | undefined,
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
  ) {
    return this.paymentsService.handleWebhook(dataId, xSignature, xRequestId);
  }
}
