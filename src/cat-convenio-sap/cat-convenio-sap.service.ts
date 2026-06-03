import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatConvenioSapDto } from './dto/create-cat-convenio-sap.dto';
import { UpdateCatConvenioSapDto } from './dto/update-cat-convenio-sap.dto';

@Injectable()
export class CatConvenioSapService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.catConvenioSap.findMany();
  }

  async findOne(id: number) {
    const item = await this.prisma.catConvenioSap.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`ConvenioSap #${id} no encontrado`);
    }
    return item;
  }

  async create(dto: CreateCatConvenioSapDto) {
    const existing = await this.prisma.catConvenioSap.findUnique({
      where: {
        uk_sap: {
          sedeUo: dto.sedeUo,
          codAseguradora: dto.codAseguradora,
          interlocutorComercial: dto.interlocutorComercial,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `La combinacion sedeUo "${dto.sedeUo}" + codAseguradora "${dto.codAseguradora}" + interlocutorComercial "${dto.interlocutorComercial}" ya existe`,
      );
    }
    return this.prisma.catConvenioSap.create({ data: dto });
  }

  async update(id: number, dto: UpdateCatConvenioSapDto) {
    await this.findOne(id);
    return this.prisma.catConvenioSap.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.catConvenioSap.delete({ where: { id } });
  }
}
