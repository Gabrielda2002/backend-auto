import { Module } from '@nestjs/common';
import { CatEstadoCitaController } from './cat-estado-cita.controller';
import { CatEstadoCitaService } from './cat-estado-cita.service';

@Module({
  controllers: [CatEstadoCitaController],
  providers: [CatEstadoCitaService],
})
export class CatEstadoCitaModule {}
