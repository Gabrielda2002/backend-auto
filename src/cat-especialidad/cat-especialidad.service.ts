import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatEspecialidadDto } from './dto/create-cat-especialidad.dto';
import { UpdateCatEspecialidadDto } from './dto/update-cat-especialidad.dto';

@Injectable()
export class CatEspecialidadService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catEspecialidad.findMany();
  }

  async findOne(id: number) {
    const item = await this.prisma.catEspecialidad.findUnique({
      where: { id },
    });
    if (!item) {
      throw new NotFoundException(`Especialidad #${id} no encontrada`);
    }
    return item;
  }

  async create(dto: CreateCatEspecialidadDto) {
    const existing = await this.prisma.catEspecialidad.findUnique({
      where: { raw: dto.raw },
    });
    if (existing) {
      throw new ConflictException(
        `La especialidad con raw "${dto.raw}" ya existe`,
      );
    }
    return this.prisma.catEspecialidad.create({ data: dto });
  }

  async update(id: number, dto: UpdateCatEspecialidadDto) {
    await this.findOne(id);
    return this.prisma.catEspecialidad.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.catEspecialidad.delete({ where: { id } });
  }
}
