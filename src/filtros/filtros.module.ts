import { Module } from '@nestjs/common';
import { FiltrosController } from './filtros.controller';
import { FiltrosService } from './filtros.service';

@Module({
  controllers: [FiltrosController],
  providers: [FiltrosService],
})
export class FiltrosModule {}
