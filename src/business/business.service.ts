import { Injectable } from '@nestjs/common';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { FindBusinessesQueryDto } from './dto/find-businesses-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}
  async create(createBusinessDto: CreateBusinessDto) {
    return await this.prisma.business.create({ data: createBusinessDto });
  }

  async findOne(id: string) {
    return await this.prisma.business.findUnique({ where: { id } });
  }

  async update(id: string, updateBusinessDto: UpdateBusinessDto) {
    return await this.prisma.business.update({
      where: { id },
      data: updateBusinessDto,
    });
  }

  async remove(id: string) {
    return await this.prisma.business.delete({ where: { id } });
  }

  //encontrar todos los negocios por cualqier filtro aplicable
  async findAll(query: FindBusinessesQueryDto) {
    const { search, category, city, page = 1, limit = 10 } = query;

    const where: Prisma.BusinessWhereInput = {
      ...(category && { category }),
      ...(city && { city: { equals: city, mode: 'insensitive' } }),
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
      }),
      this.prisma.business.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
