import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AuthUser } from 'src/auth/types/auth-user.type';
import { FindAdminBusinessesQueryDto } from './dto/find-admin-businesses-query.dto';
import { FindAdminUsersQueryDto } from './dto/find-admin-users-query.dto';
import { UpdateActiveStatusDto } from './dto/update-active-status.dto';

@Controller('admin')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('businesses')
  listBusinesses(@Query() query: FindAdminBusinessesQueryDto) {
    return this.adminService.listBusinesses(query);
  }

  @Patch('businesses/:id/status')
  setBusinessActive(
    @Param('id') id: string,
    @Body() dto: UpdateActiveStatusDto,
  ) {
    return this.adminService.setBusinessActive(id, dto.isActive);
  }

  @Get('users')
  listUsers(@Query() query: FindAdminUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id/status')
  setUserActive(
    @Param('id') id: string,
    @Body() dto: UpdateActiveStatusDto,
    @GetUser() admin: AuthUser,
  ) {
    return this.adminService.setUserActive(id, dto.isActive, admin);
  }
}
