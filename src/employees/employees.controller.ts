import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AuthUser } from 'src/auth/types/auth-user.type';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@Controller('employees')
@UseGuards(RolesGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles('BUSINESS_OWNER')
  create(@Body() dto: CreateEmployeeDto, @GetUser() user: AuthUser) {
    return this.employeesService.create(dto, user);
  }

  @Get('business/:businessId')
  @Roles('BUSINESS_OWNER', 'ADMIN')
  findAllByBusiness(
    @Param('businessId') businessId: string,
    @GetUser() user: AuthUser,
  ) {
    return this.employeesService.findAllByBusiness(businessId, user);
  }

  @Public()
  @Get('business/:businessId/public')
  findPublicByBusiness(@Param('businessId') businessId: string) {
    return this.employeesService.findPublicByBusiness(businessId);
  }

  @Delete(':id')
  @Roles('BUSINESS_OWNER', 'ADMIN')
  remove(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.employeesService.remove(id, user);
  }

  @Post(':id/avatar')
  @Roles('BUSINESS_OWNER', 'ADMIN', 'EMPLOYEE')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AVATAR_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(new Error('Solo se permiten archivos de imagen'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: AuthUser,
  ) {
    return this.employeesService.setAvatar(id, file, user);
  }

  @Delete(':id/avatar')
  @Roles('BUSINESS_OWNER', 'ADMIN', 'EMPLOYEE')
  removeAvatar(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.employeesService.removeAvatar(id, user);
  }
}
