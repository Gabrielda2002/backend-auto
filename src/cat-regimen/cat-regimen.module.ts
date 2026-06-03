import { Module } from '@nestjs/common';
import { CatRegimenController } from './cat-regimen.controller';
import { CatRegimenService } from './cat-regimen.service';

@Module({
  controllers: [CatRegimenController],
  providers: [CatRegimenService],
})
export class CatRegimenModule {}
