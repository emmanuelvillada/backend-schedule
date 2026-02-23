import { Injectable } from '@nestjs/common';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}
  async create(createBusinessDto: CreateBusinessDto) {
    return await this.prisma.business.create({ data: createBusinessDto });
  }

  findAll() {
    return this.prisma.business.findMany({ orderBy: { createdAt: 'desc' } });
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
}
