import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Filtros globales compartidos por los 5 endpoints de dashboards.
 * Todas las propiedades son opcionales; si no se envian, los servicios
 * usan el rango completo de datos disponibles en `costos`.
 *
 * Convencion: enviar `'all'` o omitir la prop equivale a "sin filtro".
 */
export class DashboardFiltersDto {
  /** Fecha inicial ISO (YYYY-MM-DD). Filtra por costos.fecha_cita >= */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe ser YYYY-MM-DD' })
  desde?: string;

  /** Fecha final ISO (YYYY-MM-DD). Filtra por costos.fecha_cita <= */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe ser YYYY-MM-DD' })
  hasta?: string;

  /** Sede detallada (costos.nombre_sede). 'all' = todas. */
  @IsOptional()
  @IsString()
  sede?: string;

  /** Agrupador de convenio (costos.convenio_grupo). Ej: COMPENSAR, NUEVA EPS. */
  @IsOptional()
  @IsString()
  convenio?: string;

  /** Agrupador de sede (costos.sede_grupo). Ej: CAJICA, CHIA, GENERAL. */
  @IsOptional()
  @IsString()
  sedeGrupo?: string;

  /** Modalidad contractual (costos.modalidad). Ej: PGP, CAPITA, EVENTO. */
  @IsOptional()
  @IsString()
  modalidad?: string;

  /** Regimen agrupado (costos.regimen_grupo). CONTRIBUTIVO / SUBSIDIADO. */
  @IsOptional()
  @IsString()
  regimen?: string;

  /** Especialidad medica (costos.especialidad). */
  @IsOptional()
  @IsString()
  especialidad?: string;

  /** Grupo de especialidad homologado (costos.grupo_especialidad). */
  @IsOptional()
  @IsString()
  grupoEspecialidad?: string;

  /** Solo convenios con nota tecnica vigente (filtro de Ejecucion vs NT). */
  @IsOptional()
  @IsString()
  soloNt?: string;
}
