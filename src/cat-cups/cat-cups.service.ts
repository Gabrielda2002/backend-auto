import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatCupsDto } from './dto/create-cat-cups.dto';
import { UpdateCatCupsDto } from './dto/update-cat-cups.dto';

@Injectable()
export class CatCupsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catCups.findMany();
  }

  async findOne(id: number) {
    const item = await this.prisma.catCups.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`CUPS #${id} no encontrado`);
    }
    return item;
  }

  async create(dto: CreateCatCupsDto) {
    const existing = await this.prisma.catCups.findUnique({
      where: { codigo: dto.codigo },
    });
    if (existing) {
      throw new ConflictException(
        `El CUPS con codigo "${dto.codigo}" ya existe`,
      );
    }
    return this.prisma.catCups.create({ data: dto });
  }

  async update(id: number, dto: UpdateCatCupsDto) {
    await this.findOne(id);
    return this.prisma.catCups.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.catCups.delete({ where: { id } });
  }
}
