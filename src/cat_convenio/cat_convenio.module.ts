import { Module } from '@nestjs/common';
import { CatConvenioController } from './cat_convenio.controller';
import { CatConvenioService } from './cat_convenio.service';

@Module({
  controllers: [CatConvenioController],
  providers: [CatConvenioService],
})
export class CatConvenioModule {}
