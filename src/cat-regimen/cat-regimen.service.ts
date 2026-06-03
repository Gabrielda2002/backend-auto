import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatRegimenDto } from './dto/create-cat-regimen.dto';
import { UpdateCatRegimenDto } from './dto/update-cat-regimen.dto';

@Injectable()
export class CatRegimenService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catRegimen.findMany();
  }

  async findOne(id: number) {
    const item = await this.prisma.catRegimen.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Regimen #${id} no encontrado`);
    }
    return item;
  }

  async create(dto: CreateCatRegimenDto) {
    const existing = await this.prisma.catRegimen.findUnique({
      where: { raw: dto.raw },
    });
    if (existing) {
      throw new ConflictException(`El regimen con raw "${dto.raw}" ya existe`);
    }
    return this.prisma.catRegimen.create({ data: dto });
  }

  async update(id: number, dto: UpdateCatRegimenDto) {
    await this.findOne(id);
    return this.prisma.catRegimen.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.catRegimen.delete({ where: { id } });
  }
}
