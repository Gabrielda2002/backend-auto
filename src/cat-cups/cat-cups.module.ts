import { Module } from '@nestjs/common';
import { CatCupsController } from './cat-cups.controller';
import { CatCupsService } from './cat-cups.service';

@Module({
  controllers: [CatCupsController],
  providers: [CatCupsService],
})
export class CatCupsModule {}
