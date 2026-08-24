import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AuthUser } from 'src/auth/types/auth-user.type';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  create(@Body() dto: CreateServiceDto, @GetUser() user: AuthUser) {
    return this.servicesService.create(dto, user);
  }

  @Public()
  @Get('business/:businessId')
  findAllByBusiness(@Param('businessId') businessId: string) {
    return this.servicesService.findAllByBusiness(businessId);
  }

  @Get('business/:businessId/manage')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  findAllByBusinessForOwner(
    @Param('businessId') businessId: string,
    @GetUser() user: AuthUser,
  ) {
    return this.servicesService.findAllByBusinessForOwner(businessId, user);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @GetUser() user: AuthUser,
  ) {
    return this.servicesService.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  remove(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.servicesService.remove(id, user);
  }
}
