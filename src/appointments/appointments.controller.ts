import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { GetStatsQueryDto } from './dto/get-stats-query.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AuthUser } from 'src/auth/types/auth-user.type';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 reservas por minuto
  @Post()
  @UseGuards(RolesGuard)
  @Roles('CLIENT', 'BUSINESS_OWNER', 'ADMIN')
  create(@Body() dto: CreateAppointmentDto, @GetUser() user: AuthUser) {
    return this.appointmentsService.create(dto, user);
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

  @Get('business/:businessId/stats')
  @UseGuards(RolesGuard)
  @Roles('BUSINESS_OWNER', 'ADMIN')
  getStats(
    @Param('businessId') businessId: string,
    @Query() query: GetStatsQueryDto,
    @GetUser() user: AuthUser,
  ) {
    return this.appointmentsService.getStats(businessId, user, query);
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
  findOne(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.appointmentsService.findOne(id, user);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('BUSINESS_OWNER', 'EMPLOYEE', 'ADMIN')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
    @GetUser() user: AuthUser,
  ) {
    return this.appointmentsService.updateStatus(id, dto, user);
  }

  @Patch(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles('CLIENT', 'BUSINESS_OWNER', 'ADMIN')
  cancel(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.appointmentsService.cancel(id, user);
  }
}
