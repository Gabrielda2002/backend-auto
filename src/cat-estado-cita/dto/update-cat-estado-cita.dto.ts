import { PartialType } from '@nestjs/mapped-types';
import { CreateCatEstadoCitaDto } from './create-cat-estado-cita.dto';

export class UpdateCatEstadoCitaDto extends PartialType(
  CreateCatEstadoCitaDto,
) {}
