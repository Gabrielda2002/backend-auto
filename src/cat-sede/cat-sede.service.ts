import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatSedeService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catSede.findMany();
  }

  findOne(id: number) {
    return this.prisma.catSede.findUnique({ where: { id } });
  }
}