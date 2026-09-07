import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AuthUser } from 'src/auth/types/auth-user.type';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 reseñas por minuto
  @Post()
  @UseGuards(RolesGuard)
  @Roles('CLIENT')
  create(@Body() dto: CreateReviewDto, @GetUser() user: AuthUser) {
    return this.reviewsService.create(dto, user);
  }

  @Public()
  @Get('business/:businessId')
  findByBusiness(@Param('businessId') businessId: string) {
    return this.reviewsService.findByBusiness(businessId);
  }

  @Patch(':id/reply')
  @UseGuards(RolesGuard)
  @Roles('BUSINESS_OWNER', 'ADMIN')
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyReviewDto,
    @GetUser() user: AuthUser,
  ) {
    return this.reviewsService.reply(id, dto.reply, user);
  }
}
