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
import { CatConvenioSapService } from './cat-convenio-sap.service';
import { CreateCatConvenioSapDto } from './dto/create-cat-convenio-sap.dto';
import { UpdateCatConvenioSapDto } from './dto/update-cat-convenio-sap.dto';

@Controller('cat-convenio-sap')
export class CatConvenioSapController {
  constructor(private readonly catConvenioSapService: CatConvenioSapService) {}

  @Get()
  findAll() {
    return this.catConvenioSapService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catConvenioSapService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCatConvenioSapDto) {
    return this.catConvenioSapService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatConvenioSapDto,
  ) {
    return this.catConvenioSapService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.catConvenioSapService.remove(id);
  }
}
