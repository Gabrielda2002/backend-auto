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
import { CatCupsPanaService } from './cat-cups-pana.service';
import { CreateCatCupsPanaDto } from './dto/create-cat-cups-pana.dto';
import { UpdateCatCupsPanaDto } from './dto/update-cat-cups-pana.dto';

@Controller('cat-cups-pana')
export class CatCupsPanaController {
  constructor(private readonly catCupsPanaService: CatCupsPanaService) {}

  @Get()
  findAll() {
    return this.catCupsPanaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catCupsPanaService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCatCupsPanaDto) {
    return this.catCupsPanaService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatCupsPanaDto,
  ) {
    return this.catCupsPanaService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.catCupsPanaService.remove(id);
  }
}
