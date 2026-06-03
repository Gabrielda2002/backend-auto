import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { RawPanaService } from './raw-pana.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Controller('raw-pana')
export class RawPanaController {
  constructor(private readonly rawPanaService: RawPanaService) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.rawPanaService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rawPanaService.findOne(id);
  }
}
