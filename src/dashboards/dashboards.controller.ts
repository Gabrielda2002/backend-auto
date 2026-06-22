import { Controller, Get, Post, Query, HttpCode } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { UseInterceptors } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';

/**
 * Endpoints agregados para los 5 dashboards.
 * Cache TTL 5 min por endpoint (compartido con TanStack Query en el front).
 */
@Controller('dashboards')
@UseInterceptors(CacheInterceptor)
@CacheTTL(300_000) // 5 minutos en ms
export class DashboardsController {
  constructor(private readonly service: DashboardsService) {}

  @Get('resumen')
  resumen(@Query() filters: DashboardFiltersDto) {
    return this.service.getResumen(filters);
  }

  @Get('ejecucion-nt')
  ejecucionNt(@Query() filters: DashboardFiltersDto) {
    return this.service.getEjecucionNt(filters);
  }

  @Get('financiero')
  financiero(@Query() filters: DashboardFiltersDto) {
    return this.service.getFinanciero(filters);
  }

  @Get('calidad')
  calidad(@Query() filters: DashboardFiltersDto) {
    return this.service.getCalidad(filters);
  }

  @Get('pym')
  pym(@Query() filters: DashboardFiltersDto) {
    return this.service.getPym(filters);
  }

  /**
   * Endpoint admin para reconstruir la tabla puente nt_map.
   * Llamar despues de cargar notas_tecnicas nuevas. No cacheado.
   */
  @Post('admin/rebuild-nt-map')
  @HttpCode(200)
  rebuildNtMap() {
    return this.service.rebuildNtMap();
  }
}
