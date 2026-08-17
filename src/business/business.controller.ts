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
} from '@nestjs/common';
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
}
