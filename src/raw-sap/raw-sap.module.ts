import { Module } from '@nestjs/common';
import { RawSapController } from './raw-sap.controller';
import { RawSapService } from './raw-sap.service';

@Module({
  controllers: [RawSapController],
  providers: [RawSapService],
})
export class RawSapModule {}
