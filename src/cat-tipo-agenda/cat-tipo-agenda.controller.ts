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
import { CatTipoAgendaService } from './cat-tipo-agenda.service';
import { CreateCatTipoAgendaDto } from './dto/create-cat-tipo-agenda.dto';
import { UpdateCatTipoAgendaDto } from './dto/update-cat-tipo-agenda.dto';

@Controller('cat-tipo-agenda')
export class CatTipoAgendaController {
  constructor(private readonly catTipoAgendaService: CatTipoAgendaService) {}

  @Get()
  findAll() {
    return this.catTipoAgendaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catTipoAgendaService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCatTipoAgendaDto) {
    return this.catTipoAgendaService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatTipoAgendaDto,
  ) {
    return this.catTipoAgendaService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.catTipoAgendaService.remove(id);
  }
}
