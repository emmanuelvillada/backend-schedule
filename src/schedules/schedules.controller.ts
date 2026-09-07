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
import { CreateBusinessClosureDto } from './dto/create-business-closure.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AuthUser } from 'src/auth/types/auth-user.type';

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  // ─── Business ────────────────────────────────────────────────────

  @Post('business')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  createBusinessSchedule(
    @Body() dto: CreateScheduleDto,
    @GetUser() user: AuthUser,
  ) {
    return this.schedulesService.createBusinessSchedule(dto, user);
  }

  @Public()
  @Get('business/:businessId')
  getBusinessSchedules(@Param('businessId') businessId: string) {
    return this.schedulesService.getBusinessSchedules(businessId);
  }

  @Delete('business/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  removeBusinessSchedule(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.schedulesService.removeBusinessSchedule(id, user);
  }

  // ─── Closures (vacaciones, festivos) ───────────────────────────────

  @Post('business/:businessId/closures')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  createClosure(
    @Param('businessId') businessId: string,
    @Body() dto: CreateBusinessClosureDto,
    @GetUser() user: AuthUser,
  ) {
    return this.schedulesService.createClosure(businessId, dto, user);
  }

  @Public()
  @Get('business/:businessId/closures')
  getClosures(@Param('businessId') businessId: string) {
    return this.schedulesService.getClosures(businessId);
  }

  @Delete('closures/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  removeClosure(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.schedulesService.removeClosure(id, user);
  }

  // ─── Employee ─────────────────────────────────────────────────────

  @Post('employee')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  createEmployeeSchedule(
    @Body() dto: CreateEmployeeScheduleDto,
    @GetUser() user: AuthUser,
  ) {
    return this.schedulesService.createEmployeeSchedule(dto, user);
  }

  @Public()
  @Get('employee/:employeeId')
  getEmployeeSchedules(@Param('employeeId') employeeId: string) {
    return this.schedulesService.getEmployeeSchedules(employeeId);
  }

  @Delete('employee/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  removeEmployeeSchedule(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.schedulesService.removeEmployeeSchedule(id, user);
  }

  // ─── Availability ─────────────────────────────────────────────────

  @Public()
  @Get('availability/:businessId')
  getAvailableSlots(
    @Param('businessId') businessId: string,
    @Query('date') date: string, // ?date=2025-03-15
    @Query('employeeId') employeeId?: string,
  ) {
    return this.schedulesService.getAvailableSlots(
      businessId,
      date,
      employeeId,
    );
  }
}
