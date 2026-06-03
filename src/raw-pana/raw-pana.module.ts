import { Module } from '@nestjs/common';
import { RawPanaController } from './raw-pana.controller';
import { RawPanaService } from './raw-pana.service';

@Module({
  controllers: [RawPanaController],
  providers: [RawPanaService],
})
export class RawPanaModule {}
