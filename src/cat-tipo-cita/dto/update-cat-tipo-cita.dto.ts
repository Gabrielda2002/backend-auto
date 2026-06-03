import { PartialType } from '@nestjs/mapped-types';
import { CreateCatTipoCitaDto } from './create-cat-tipo-cita.dto';

export class UpdateCatTipoCitaDto extends PartialType(CreateCatTipoCitaDto) {}
