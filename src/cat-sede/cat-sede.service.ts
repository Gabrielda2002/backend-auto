import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatSedeDto } from './dto/create-cat-sede.dto';
import { UpdateCatSedeDto } from './dto/update-cat-sede.dto';

@Injectable()
export class CatSedeService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catSede.findMany();
  }

  async findOne(id: number) {
    const sede = await this.prisma.catSede.findUnique({ where: { id } });
    if (!sede) {
      throw new NotFoundException(`Sede #${id} no encontrada`);
    }
    return sede;
  }

  async create(dto: CreateCatSedeDto) {
    const existing = await this.prisma.catSede.findUnique({
      where: { raw: dto.raw },
    });
    if (existing) {
      throw new ConflictException(`La sede con raw "${dto.raw}" ya existe`);
    }
    return this.prisma.catSede.create({ data: dto });
  }

  async update(id: number, dto: UpdateCatSedeDto) {
    await this.findOne(id);
    return this.prisma.catSede.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.catSede.delete({ where: { id } });
  }
}
