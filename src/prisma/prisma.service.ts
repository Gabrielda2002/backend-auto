import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const adapter = new PrismaMariaDb({
      host: configService.get<string>('DB_HOST', 'localhost'),
      port: configService.get<number>('DB_PORT', 3306),
      user: configService.get<string>('DB_USER', 'root'),
      // Acepta DB_PASS (legado ETL) o DB_PASSWORD
      password:
        configService.get<string>('DB_PASS') ??
        configService.get<string>('DB_PASSWORD', ''),
      database: configService.get<string>('DB_NAME', 'citas_db'),
      // Cada endpoint de dashboards dispara sus consultas en Promise.all
      // (resumen 9, ejecucion-nt 7, financiero 7) y el frontend ademas pide
      // varios /filtros/* a la vez. Con un pool de 10 una sola carga de pagina
      // lo saturaba y el resto quedaba encolado: de ahi los 35 s observados en
      // produccion y el 500 por timeout del proxy a los 10 s.
      connectionLimit: configService.get<number>('DB_POOL_SIZE', 25),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
