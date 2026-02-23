import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { CreateEmployeeScheduleDto } from './dto/create-employee-schedule.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  // ─── Business ────────────────────────────────────────────────────

  @Post('business')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  createBusinessSchedule(@Body() dto: CreateScheduleDto) {
    return this.schedulesService.createBusinessSchedule(dto);
  }

  @Get('business/:businessId')
  getBusinessSchedules(@Param('businessId') businessId: string) {
    return this.schedulesService.getBusinessSchedules(businessId);
  }

  @Delete('business/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  removeBusinessSchedule(@Param('id') id: string) {
    return this.schedulesService.removeBusinessSchedule(id);
  }

  // ─── Employee ─────────────────────────────────────────────────────

  @Post('employee')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  createEmployeeSchedule(@Body() dto: CreateEmployeeScheduleDto) {
    return this.schedulesService.createEmployeeSchedule(dto);
  }

  @Get('employee/:employeeId')
  getEmployeeSchedules(@Param('employeeId') employeeId: string) {
    return this.schedulesService.getEmployeeSchedules(employeeId);
  }

  @Delete('employee/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  removeEmployeeSchedule(@Param('id') id: string) {
    return this.schedulesService.removeEmployeeSchedule(id);
  }

  // ─── Availability ─────────────────────────────────────────────────

  @Get('availability/:businessId')
  getAvailableSlots(
    @Param('businessId') businessId: string,
    @Query('date') date: string, // ?date=2025-03-15
  ) {
    return this.schedulesService.getAvailableSlots(businessId, date);
  }
}
