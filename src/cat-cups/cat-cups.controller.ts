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
import { CatCupsService } from './cat-cups.service';
import { CreateCatCupsDto } from './dto/create-cat-cups.dto';
import { UpdateCatCupsDto } from './dto/update-cat-cups.dto';

@Controller('cat-cups')
export class CatCupsController {
  constructor(private readonly catCupsService: CatCupsService) {}

  @Get()
  findAll() {
    return this.catCupsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catCupsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCatCupsDto) {
    return this.catCupsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCatCupsDto) {
    return this.catCupsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.catCupsService.remove(id);
  }
}
