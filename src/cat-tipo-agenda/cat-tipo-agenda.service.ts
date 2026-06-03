import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatTipoAgendaDto } from './dto/create-cat-tipo-agenda.dto';
import { UpdateCatTipoAgendaDto } from './dto/update-cat-tipo-agenda.dto';

@Injectable()
export class CatTipoAgendaService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catTipoAgenda.findMany();
  }

  async findOne(id: number) {
    const item = await this.prisma.catTipoAgenda.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`TipoAgenda #${id} no encontrado`);
    }
    return item;
  }

  async create(dto: CreateCatTipoAgendaDto) {
    const existing = await this.prisma.catTipoAgenda.findUnique({
      where: { raw: dto.raw },
    });
    if (existing) {
      throw new ConflictException(
        `El tipo agenda con raw "${dto.raw}" ya existe`,
      );
    }
    return this.prisma.catTipoAgenda.create({ data: dto });
  }

  async update(id: number, dto: UpdateCatTipoAgendaDto) {
    await this.findOne(id);
    return this.prisma.catTipoAgenda.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.catTipoAgenda.delete({ where: { id } });
  }
}
