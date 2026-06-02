import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { CatSedeService } from './cat-sede.service';

@Controller('cat-sede')
export class CatSedeController {
  constructor(private catSedeService: CatSedeService) {}

  @Get()
  findAll() {
    return  this.catSedeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catSedeService.findOne(id);
  }
}