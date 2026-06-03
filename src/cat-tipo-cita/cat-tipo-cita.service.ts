import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatTipoCitaDto } from './dto/create-cat-tipo-cita.dto';
import { UpdateCatTipoCitaDto } from './dto/update-cat-tipo-cita.dto';

@Injectable()
export class CatTipoCitaService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catTipoCita.findMany();
  }

  async findOne(id: number) {
    const item = await this.prisma.catTipoCita.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`TipoCita #${id} no encontrado`);
    }
    return item;
  }

  async create(dto: CreateCatTipoCitaDto) {
    const existing = await this.prisma.catTipoCita.findUnique({
      where: { raw: dto.raw },
    });
    if (existing) {
      throw new ConflictException(
        `El tipo cita con raw "${dto.raw}" ya existe`,
      );
    }
    return this.prisma.catTipoCita.create({ data: dto });
  }

  async update(id: number, dto: UpdateCatTipoCitaDto) {
    await this.findOne(id);
    return this.prisma.catTipoCita.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.catTipoCita.delete({ where: { id } });
  }
}
