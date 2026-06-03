import { PartialType } from '@nestjs/mapped-types';
import { CreateCatTipoAgendaDto } from './create-cat-tipo-agenda.dto';

export class UpdateCatTipoAgendaDto extends PartialType(
  CreateCatTipoAgendaDto,
) {}
