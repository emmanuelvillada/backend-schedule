import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BusinessService } from './business.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { FindBusinessesQueryDto } from './dto/find-businesses-query.dto';
import { BusinessRecommendationsQueryDto } from './dto/business-recommendations-query.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { AuthUser } from 'src/auth/types/auth-user.type';

const MAX_IMAGES_PER_UPLOAD = 6;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@Controller('business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  create(
    @Body() createBusinessDto: CreateBusinessDto,
    @GetUser() user: AuthUser,
  ) {
    return this.businessService.create(createBusinessDto, user);
  }

  @Public()
  @Get()
  findAll(@Query() query: FindBusinessesQueryDto) {
    return this.businessService.findAll(query);
  }

  @Public()
  @Get('recommendations')
  getRecommendations(@Query() query: BusinessRecommendationsQueryDto) {
    return this.businessService.getRecommendations(query.lat, query.lng);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.businessService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  update(
    @Param('id') id: string,
    @Body() updateBusinessDto: UpdateBusinessDto,
    @GetUser() user: AuthUser,
  ) {
    return this.businessService.update(id, updateBusinessDto, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  remove(@Param('id') id: string, @GetUser() user: AuthUser) {
    return this.businessService.remove(id, user);
  }

  @Post(':id/images')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  @UseInterceptors(
    FilesInterceptor('files', MAX_IMAGES_PER_UPLOAD, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(new Error('Solo se permiten archivos de imagen'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  uploadImages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @GetUser() user: AuthUser,
  ) {
    return this.businessService.addImages(id, files, user);
  }

  @Delete(':id/images/:imageId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'BUSINESS_OWNER')
  removeImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @GetUser() user: AuthUser,
  ) {
    return this.businessService.removeImage(id, imageId, user);
  }
}
