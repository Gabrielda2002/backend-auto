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
import { CatTipoCitaService } from './cat-tipo-cita.service';
import { CreateCatTipoCitaDto } from './dto/create-cat-tipo-cita.dto';
import { UpdateCatTipoCitaDto } from './dto/update-cat-tipo-cita.dto';

@Controller('cat-tipo-cita')
export class CatTipoCitaController {
  constructor(private readonly catTipoCitaService: CatTipoCitaService) {}

  @Get()
  findAll() {
    return this.catTipoCitaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catTipoCitaService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCatTipoCitaDto) {
    return this.catTipoCitaService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatTipoCitaDto,
  ) {
    return this.catTipoCitaService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.catTipoCitaService.remove(id);
  }
}
