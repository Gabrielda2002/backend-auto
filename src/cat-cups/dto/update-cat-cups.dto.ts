import { PartialType } from '@nestjs/mapped-types';
import { CreateCatCupsDto } from './create-cat-cups.dto';

export class UpdateCatCupsDto extends PartialType(CreateCatCupsDto) {}
