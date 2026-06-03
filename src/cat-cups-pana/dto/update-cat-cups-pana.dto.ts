import { PartialType } from '@nestjs/mapped-types';
import { CreateCatCupsPanaDto } from './create-cat-cups-pana.dto';

export class UpdateCatCupsPanaDto extends PartialType(CreateCatCupsPanaDto) {}
