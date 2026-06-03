import { PartialType } from '@nestjs/mapped-types';
import { CreateCatRegimenDto } from './create-cat-regimen.dto';

export class UpdateCatRegimenDto extends PartialType(CreateCatRegimenDto) {}
