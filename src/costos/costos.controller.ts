import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { CostosService } from './costos.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateCostoDto } from './dto/create-costo.dto';
import { UpdateCostoDto } from './dto/update-costo.dto';

@Controller('costos')
export class CostosController {
  constructor(private readonly costosService: CostosService) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.costosService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.costosService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCostoDto) {
    return this.costosService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCostoDto) {
    return this.costosService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.costosService.remove(id);
  }
}
