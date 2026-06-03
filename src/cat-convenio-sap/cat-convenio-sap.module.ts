import { Module } from '@nestjs/common';
import { CatConvenioSapController } from './cat-convenio-sap.controller';
import { CatConvenioSapService } from './cat-convenio-sap.service';

@Module({
  controllers: [CatConvenioSapController],
  providers: [CatConvenioSapService],
})
export class CatConvenioSapModule {}
