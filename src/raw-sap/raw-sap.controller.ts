import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { RawSapService } from './raw-sap.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Controller('raw-sap')
export class RawSapController {
  constructor(private readonly rawSapService: RawSapService) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.rawSapService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rawSapService.findOne(id);
  }
}
