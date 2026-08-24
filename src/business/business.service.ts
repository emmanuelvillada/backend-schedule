import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { FindBusinessesQueryDto } from './dto/find-businesses-query.dto';
import { Business, BusinessImage, Prisma } from '@prisma/client';
import { AuthUser } from 'src/auth/types/auth-user.type';
import { SupabaseStorageService } from 'src/storage/supabase-storage.service';

const IMAGES_ORDER = { images: { orderBy: { position: 'asc' as const } } };

const NEARBY_LIMIT = 6;
const TOP_RATED_LIMIT = 6;
const EARTH_RADIUS_KM = 6371;

@Injectable()
export class BusinessService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
  ) {}

  async create(createBusinessDto: CreateBusinessDto, user: AuthUser) {
    // Un BUSINESS_OWNER solo puede crear negocios para sí mismo; solo ADMIN
    // puede asignar el negocio a otro ownerId.
    const ownerId =
      user.role === 'ADMIN' && createBusinessDto.ownerId
        ? createBusinessDto.ownerId
        : user.id;

    const existing = await this.prisma.business.findUnique({
      where: { ownerId },
    });
    if (existing) {
      throw new ConflictException(
        'Este usuario ya tiene un negocio registrado',
      );
    }

    try {
      return await this.prisma.business.create({
        data: { ...createBusinessDto, ownerId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Este usuario ya tiene un negocio registrado',
        );
      }
      throw error;
    }
  }

  async findOne(id: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
      include: IMAGES_ORDER,
    });
    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }
    const [withRating] = await this.attachRatings([business]);
    return withRating;
  }

  async update(
    id: string,
    updateBusinessDto: UpdateBusinessDto,
    user: AuthUser,
  ) {
    await this.ensureOwnership(id, user);
    return await this.prisma.business.update({
      where: { id },
      data: updateBusinessDto,
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.ensureOwnership(id, user);
    return await this.prisma.business.delete({ where: { id } });
  }

  //encontrar todos los negocios por cualqier filtro aplicable
  async findAll(query: FindBusinessesQueryDto) {
    const { search, category, ownerId, page = 1, limit = 10 } = query;

    const where: Prisma.BusinessWhereInput = {
      ...(category && { category }),
      ...(ownerId && { ownerId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.business.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: IMAGES_ORDER,
      }),
      this.prisma.business.count({ where }),
    ]);

    return {
      data: await this.attachRatings(data),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Sugerencias para el dashboard del cliente: negocios más cercanos (si se
  // da la ubicación) y negocios mejor puntuados (con al menos una reseña).
  async getRecommendations(lat?: number, lng?: number) {
    const businesses = await this.prisma.business.findMany({
      include: IMAGES_ORDER,
    });
    const withRatings = await this.attachRatings(businesses);

    const nearby =
      lat !== undefined && lng !== undefined
        ? withRatings
            .filter((b) => b.latitude !== null && b.longitude !== null)
            .map((b) => ({
              ...b,
              distanceKm: this.haversineKm(
                lat,
                lng,
                b.latitude as number,
                b.longitude as number,
              ),
            }))
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, NEARBY_LIMIT)
        : [];

    const topRated = withRatings
      .filter((b) => b.reviewCount > 0)
      .sort(
        (a, b) =>
          b.averageRating - a.averageRating || b.reviewCount - a.reviewCount,
      )
      .slice(0, TOP_RATED_LIMIT);

    return { nearby, topRated };
  }

  async addImages(
    businessId: string,
    files: Express.Multer.File[],
    user: AuthUser,
  ) {
    await this.ensureOwnership(businessId, user);

    const existingCount = await this.prisma.businessImage.count({
      where: { businessId },
    });

    const images: BusinessImage[] = [];
    for (const [index, file] of files.entries()) {
      const { url, path } = await this.storage.uploadBusinessPhoto(
        businessId,
        file,
      );
      images.push(
        await this.prisma.businessImage.create({
          data: { businessId, url, path, position: existingCount + index },
        }),
      );
    }

    return images;
  }

  async removeImage(businessId: string, imageId: string, user: AuthUser) {
    await this.ensureOwnership(businessId, user);

    const image = await this.prisma.businessImage.findUnique({
      where: { id: imageId },
    });
    if (!image || image.businessId !== businessId) {
      throw new NotFoundException('Imagen no encontrada');
    }

    await this.prisma.businessImage.delete({ where: { id: imageId } });
    await this.storage.deleteBusinessPhoto(image.path);

    return { message: 'Imagen eliminada' };
  }

  // Verifica que el negocio exista y que el usuario sea su dueño (o ADMIN).
  private async ensureOwnership(id: string, user: AuthUser) {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) {
      throw new NotFoundException('Negocio no encontrado');
    }
    if (user.role !== 'ADMIN' && business.ownerId !== user.id) {
      throw new ForbiddenException('No tienes permiso sobre este negocio');
    }
    return business;
  }

  private async attachRatings<T extends Business>(businesses: T[]) {
    const ids = businesses.map((b) => b.id);
    const stats =
      ids.length > 0
        ? await this.prisma.review.groupBy({
            by: ['businessId'],
            where: { businessId: { in: ids } },
            _avg: { rating: true },
            _count: { rating: true },
          })
        : [];

    const statsById = new Map(stats.map((s) => [s.businessId, s] as const));

    return businesses.map((business) => {
      const stat = statsById.get(business.id);
      return {
        ...business,
        averageRating: stat?._avg.rating ?? 0,
        reviewCount: stat?._count.rating ?? 0,
      };
    });
  }

  private haversineKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
