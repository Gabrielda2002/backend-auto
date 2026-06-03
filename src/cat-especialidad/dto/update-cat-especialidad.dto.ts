import { PartialType } from '@nestjs/mapped-types';
import { CreateCatEspecialidadDto } from './create-cat-especialidad.dto';

export class UpdateCatEspecialidadDto extends PartialType(
  CreateCatEspecialidadDto,
) {}
