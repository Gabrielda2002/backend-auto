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
import { CatRegimenService } from './cat-regimen.service';
import { CreateCatRegimenDto } from './dto/create-cat-regimen.dto';
import { UpdateCatRegimenDto } from './dto/update-cat-regimen.dto';

@Controller('cat-regimen')
export class CatRegimenController {
  constructor(private readonly catRegimenService: CatRegimenService) {}

  @Get()
  findAll() {
    return this.catRegimenService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catRegimenService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCatRegimenDto) {
    return this.catRegimenService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatRegimenDto,
  ) {
    return this.catRegimenService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.catRegimenService.remove(id);
  }
}
