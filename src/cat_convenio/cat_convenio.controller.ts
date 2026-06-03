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
import { CatConvenioService } from './cat_convenio.service';
import { CreateCatConvenioDto } from './dto/create-cat-convenio.dto';
import { UpdateCatConvenioDto } from './dto/update-cat-convenio.dto';

@Controller('cat-convenio')
export class CatConvenioController {
  constructor(private readonly catConvenioService: CatConvenioService) {}

  @Get()
  findAll() {
    return this.catConvenioService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catConvenioService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCatConvenioDto) {
    return this.catConvenioService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatConvenioDto,
  ) {
    return this.catConvenioService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.catConvenioService.remove(id);
  }
}
