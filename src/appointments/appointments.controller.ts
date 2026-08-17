import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AuthUser } from 'src/auth/types/auth-user.type';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CLIENT', 'BUSINESS_OWNER', 'ADMIN')
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(dto);
  }

  @Get('business/:businessId')
  @UseGuards(RolesGuard)
  @Roles('BUSINESS_OWNER', 'EMPLOYEE', 'ADMIN')
  findAllByBusiness(
    @Param('businessId') businessId: string,
    @GetUser() user: AuthUser,
  ) {
    return this.appointmentsService.findAllByBusiness(businessId, user);
  }

  @Get('client/:clientId')
  @UseGuards(RolesGuard)
  @Roles('CLIENT', 'ADMIN')
  findAllByClient(
    @Param('clientId') clientId: string,
    @GetUser() user: AuthUser,
  ) {
    return this.appointmentsService.findAllByClient(clientId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('BUSINESS_OWNER', 'EMPLOYEE', 'ADMIN')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateStatus(id, dto);
  }

  @Patch(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles('CLIENT', 'BUSINESS_OWNER', 'ADMIN')
  cancel(@Param('id') id: string) {
    return this.appointmentsService.cancel(id);
  }
}
