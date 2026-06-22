import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { FiltrosService } from './filtros.service';
import { DashboardFiltersDto } from '../dashboards/dto/dashboard-filters.dto';

/**
 * Catalogos dinamicos para selects del frontend.
 * Cache 5 min: los valores cambian solo cuando corre el ETL.
 */
@Controller('filtros')
@UseInterceptors(CacheInterceptor)
@CacheTTL(300_000)
export class FiltrosController {
  constructor(private readonly service: FiltrosService) {}

  @Get('sedes')
  sedes() {
    return this.service.getSedes();
  }

  @Get('convenios')
  convenios() {
    return this.service.getConvenios();
  }

  @Get('grupos-especialidad')
  gruposEspecialidad(@Query() filters: DashboardFiltersDto, @Query('soloNt') soloNt?: string) {
    return this.service.getGruposEspecialidad(filters, soloNt === 'true' || soloNt === '1');
  }

  @Get('rango-fechas')
  rangoFechas() {
    return this.service.getRangoFechas();
  }

  @Get('convenios-grupo')
  conveniosGrupo(@Query() filters: DashboardFiltersDto, @Query('soloNt') soloNt?: string) {
    return this.service.getConveniosGrupo(filters, soloNt === 'true' || soloNt === '1');
  }

  @Get('sedes-grupo')
  sedesGrupo(@Query() filters: DashboardFiltersDto, @Query('soloNt') soloNt?: string) {
    return this.service.getSedesGrupo(filters, soloNt === 'true' || soloNt === '1');
  }

  @Get('sedes-jerarquia')
  sedesJerarquia(@Query() filters: DashboardFiltersDto, @Query('soloNt') soloNt?: string) {
    return this.service.getSedesJerarquia(filters, soloNt === 'true' || soloNt === '1');
  }

  @Get('modalidades')
  modalidades(@Query() filters: DashboardFiltersDto, @Query('soloNt') soloNt?: string) {
    return this.service.getModalidades(filters, soloNt === 'true' || soloNt === '1');
  }

  @Get('regimenes')
  regimenes(@Query() filters: DashboardFiltersDto, @Query('soloNt') soloNt?: string) {
    return this.service.getRegimenes(filters, soloNt === 'true' || soloNt === '1');
  }
}
