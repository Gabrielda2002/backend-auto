import { Module } from '@nestjs/common';
import { CatTipoCitaController } from './cat-tipo-cita.controller';
import { CatTipoCitaService } from './cat-tipo-cita.service';

@Module({
  controllers: [CatTipoCitaController],
  providers: [CatTipoCitaService],
})
export class CatTipoCitaModule {}
