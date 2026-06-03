import { PartialType } from '@nestjs/mapped-types';
import { CreateCatConvenioDto } from './create-cat-convenio.dto';

export class UpdateCatConvenioDto extends PartialType(CreateCatConvenioDto) {}
