import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatCupsPanaDto } from './dto/create-cat-cups-pana.dto';
import { UpdateCatCupsPanaDto } from './dto/update-cat-cups-pana.dto';

@Injectable()
export class CatCupsPanaService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catCupsPana.findMany();
  }

  async findOne(id: number) {
    const item = await this.prisma.catCupsPana.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`CupsPana #${id} no encontrado`);
    }
    return item;
  }

  async create(dto: CreateCatCupsPanaDto) {
    const existing = await this.prisma.catCupsPana.findUnique({
      where: {
        uk_pana: {
          especialidadCita: dto.especialidadCita,
          esControl: dto.esControl,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `La combinacion especialidadCita "${dto.especialidadCita}" + esControl "${dto.esControl}" ya existe`,
      );
    }
    return this.prisma.catCupsPana.create({ data: dto });
  }

  async update(id: number, dto: UpdateCatCupsPanaDto) {
    await this.findOne(id);
    return this.prisma.catCupsPana.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.catCupsPana.delete({ where: { id } });
  }
}
