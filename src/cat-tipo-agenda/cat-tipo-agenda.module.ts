import { Module } from '@nestjs/common';
import { CatTipoAgendaController } from './cat-tipo-agenda.controller';
import { CatTipoAgendaService } from './cat-tipo-agenda.service';

@Module({
  controllers: [CatTipoAgendaController],
  providers: [CatTipoAgendaService],
})
export class CatTipoAgendaModule {}
