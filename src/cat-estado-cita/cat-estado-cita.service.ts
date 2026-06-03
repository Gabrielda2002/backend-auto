import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatEstadoCitaDto } from './dto/create-cat-estado-cita.dto';
import { UpdateCatEstadoCitaDto } from './dto/update-cat-estado-cita.dto';

@Injectable()
export class CatEstadoCitaService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catEstadoCita.findMany();
  }

  async findOne(id: number) {
    const item = await this.prisma.catEstadoCita.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`EstadoCita #${id} no encontrado`);
    }
    return item;
  }

  async create(dto: CreateCatEstadoCitaDto) {
    const existing = await this.prisma.catEstadoCita.findUnique({
      where: { raw: dto.raw },
    });
    if (existing) {
      throw new ConflictException(
        `El estado cita con raw "${dto.raw}" ya existe`,
      );
    }
    return this.prisma.catEstadoCita.create({ data: dto });
  }

  async update(id: number, dto: UpdateCatEstadoCitaDto) {
    await this.findOne(id);
    return this.prisma.catEstadoCita.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.catEstadoCita.delete({ where: { id } });
  }
}
