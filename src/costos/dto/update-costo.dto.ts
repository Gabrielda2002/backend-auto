import { PartialType } from '@nestjs/mapped-types';
import { CreateCostoDto } from './create-costo.dto';

export class UpdateCostoDto extends PartialType(CreateCostoDto) {}
