import { Module } from '@nestjs/common';
import { RawPlenusController } from './raw-plenus.controller';
import { RawPlenusService } from './raw-plenus.service';

@Module({
  controllers: [RawPlenusController],
  providers: [RawPlenusService],
})
export class RawPlenusModule {}
