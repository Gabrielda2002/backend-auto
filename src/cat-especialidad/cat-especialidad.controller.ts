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
import { CatEspecialidadService } from './cat-especialidad.service';
import { CreateCatEspecialidadDto } from './dto/create-cat-especialidad.dto';
import { UpdateCatEspecialidadDto } from './dto/update-cat-especialidad.dto';

@Controller('cat-especialidad')
export class CatEspecialidadController {
  constructor(
    private readonly catEspecialidadService: CatEspecialidadService,
  ) {}

  @Get()
  findAll() {
    return this.catEspecialidadService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catEspecialidadService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCatEspecialidadDto) {
    return this.catEspecialidadService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatEspecialidadDto,
  ) {
    return this.catEspecialidadService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.catEspecialidadService.remove(id);
  }
}
