import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCatConvenioDto } from './dto/create-cat-convenio.dto';
import { UpdateCatConvenioDto } from './dto/update-cat-convenio.dto';

@Injectable()
export class CatConvenioService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catConvenio.findMany();
  }

  async findOne(id: number) {
    const convenio = await this.prisma.catConvenio.findUnique({
      where: { id },
    });
    if (!convenio) {
      throw new NotFoundException(`Convenio #${id} no encontrado`);
    }
    return convenio;
  }

  async create(dto: CreateCatConvenioDto) {
    const existing = await this.prisma.catConvenio.findUnique({
      where: { nombreConvenio: dto.nombreConvenio },
    });
    if (existing) {
      throw new ConflictException(
        `El convenio "${dto.nombreConvenio}" ya existe`,
      );
    }
    return this.prisma.catConvenio.create({ data: dto });
  }

  async update(id: number, dto: UpdateCatConvenioDto) {
    await this.findOne(id);
    return this.prisma.catConvenio.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.catConvenio.delete({ where: { id } });
  }
}
