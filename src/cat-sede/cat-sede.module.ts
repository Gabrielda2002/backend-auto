import { Module } from '@nestjs/common';
import { CatSedeController } from './cat-sede.controller';
import { CatSedeService } from './cat-sede.service';

@Module({
  controllers: [CatSedeController],
  providers: [CatSedeService]
})
export class CatSedeModule {}
