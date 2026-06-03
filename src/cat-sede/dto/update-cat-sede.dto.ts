import { PartialType } from '@nestjs/mapped-types';
import { CreateCatSedeDto } from './create-cat-sede.dto';

export class UpdateCatSedeDto extends PartialType(CreateCatSedeDto) {}
