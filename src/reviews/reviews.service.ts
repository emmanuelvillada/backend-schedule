import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { AuthUser } from 'src/auth/types/auth-user.type';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateReviewDto, user: AuthUser) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }
    if (appointment.clientId !== user.id) {
      throw new ForbiddenException(
        'No puedes calificar una cita que no es tuya',
      );
    }
    if (appointment.status !== 'COMPLETED') {
      throw new BadRequestException('Solo puedes calificar citas completadas');
    }

    try {
      return await this.prisma.review.create({
        data: {
          rating: dto.rating,
          comment: dto.comment,
          appointmentId: dto.appointmentId,
          businessId: appointment.businessId,
          clientId: user.id,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Esta cita ya tiene una reseña');
      }
      throw error;
    }
  }

  findByBusiness(businessId: string) {
    return this.prisma.review.findMany({
      where: { businessId },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
