import { Module } from '@nestjs/common';
import { CatCupsPanaController } from './cat-cups-pana.controller';
import { CatCupsPanaService } from './cat-cups-pana.service';

@Module({
  controllers: [CatCupsPanaController],
  providers: [CatCupsPanaService],
})
export class CatCupsPanaModule {}
