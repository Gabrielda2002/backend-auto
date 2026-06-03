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
import { CatSedeService } from './cat-sede.service';
import { CreateCatSedeDto } from './dto/create-cat-sede.dto';
import { UpdateCatSedeDto } from './dto/update-cat-sede.dto';

@Controller('cat-sede')
export class CatSedeController {
  constructor(private readonly catSedeService: CatSedeService) {}

  @Get()
  findAll() {
    return this.catSedeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catSedeService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCatSedeDto) {
    return this.catSedeService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCatSedeDto) {
    return this.catSedeService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.catSedeService.remove(id);
  }
}
