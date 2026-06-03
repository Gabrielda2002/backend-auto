import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { RawPlenusService } from './raw-plenus.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Controller('raw-plenus')
export class RawPlenusController {
  constructor(private readonly rawPlenusService: RawPlenusService) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.rawPlenusService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rawPlenusService.findOne(id);
  }
}
