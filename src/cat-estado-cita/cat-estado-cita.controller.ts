import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { CatEstadoCitaService } from './cat-estado-cita.service';
import { CreateCatEstadoCitaDto } from './dto/create-cat-estado-cita.dto';
import { UpdateCatEstadoCitaDto } from './dto/update-cat-estado-cita.dto';

@Controller('cat-estado-cita')
export class CatEstadoCitaController {
  constructor(private readonly catEstadoCitaService: CatEstadoCitaService) {}

  @Get()
  findAll() {
    return this.catEstadoCitaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catEstadoCitaService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCatEstadoCitaDto) {
    return this.catEstadoCitaService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatEstadoCitaDto,
  ) {
    return this.catEstadoCitaService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.catEstadoCitaService.remove(id);
  }
}
