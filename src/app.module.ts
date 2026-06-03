import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CatSedeModule } from './cat-sede/cat-sede.module';
import { CatRegimenModule } from './cat-regimen/cat-regimen.module';
import { CatTipoAgendaModule } from './cat-tipo-agenda/cat-tipo-agenda.module';
import { CatTipoCitaModule } from './cat-tipo-cita/cat-tipo-cita.module';
import { CatEstadoCitaModule } from './cat-estado-cita/cat-estado-cita.module';
import { CatEspecialidadModule } from './cat-especialidad/cat-especialidad.module';
import { CatCupsModule } from './cat-cups/cat-cups.module';
import { CatCupsPanaModule } from './cat-cups-pana/cat-cups-pana.module';
import { CatConvenioModule } from './cat_convenio/cat_convenio.module';
import { CatConvenioSapModule } from './cat-convenio-sap/cat-convenio-sap.module';
import { RawPlenusModule } from './raw-plenus/raw-plenus.module';
import { RawPanaModule } from './raw-pana/raw-pana.module';
import { RawSapModule } from './raw-sap/raw-sap.module';
import { CostosModule } from './costos/costos.module';
import { HttpLoggerMiddleware } from './common/middleware/http-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    CatSedeModule,
    CatRegimenModule,
    CatTipoAgendaModule,
    CatTipoCitaModule,
    CatEstadoCitaModule,
    CatEspecialidadModule,
    CatCupsModule,
    CatCupsPanaModule,
    CatConvenioModule,
    CatConvenioSapModule,
    RawPlenusModule,
    RawPanaModule,
    RawSapModule,
    CostosModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*path');
  }
}
