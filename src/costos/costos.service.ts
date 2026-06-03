import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateCostoDto } from './dto/create-costo.dto';
import { UpdateCostoDto } from './dto/update-costo.dto';

@Injectable()
export class CostosService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: PaginationQueryDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.costos.findMany({
        skip,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.prisma.costos.count(),
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

  async findOne(id: number) {
    const item = await this.prisma.costos.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Costo #${id} no encontrado`);
    }
    return item;
  }

  create(dto: CreateCostoDto) {
    return this.prisma.costos.create({ data: dto });
  }

  async update(id: number, dto: UpdateCostoDto) {
    await this.findOne(id);
    return this.prisma.costos.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.costos.delete({ where: { id } });
  }
}
