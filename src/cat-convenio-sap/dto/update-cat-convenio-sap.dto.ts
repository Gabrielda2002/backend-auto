import { PartialType } from '@nestjs/mapped-types';
import { CreateCatConvenioSapDto } from './create-cat-convenio-sap.dto';

export class UpdateCatConvenioSapDto extends PartialType(
  CreateCatConvenioSapDto,
) {}
