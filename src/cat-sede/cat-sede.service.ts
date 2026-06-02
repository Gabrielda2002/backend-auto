import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatSedeService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catSede.findMany();
  }

  async findOne(id: number) {
    const sede = await this.prisma.catSede.findUnique({ where: { id } });

    if (!sede) {
      throw new NotFoundException(`Sede with ID ${id} not found`);
    }

    return sede;
  }
}