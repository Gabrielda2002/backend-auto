import { z } from 'zod';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/**
 * Cliente fetch tipado: hace GET, valida la respuesta con un schema Zod y
 * devuelve el dato parseado. Los params vacios, undefined o 'all' se omiten.
 */
export async function get<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  params?: Record<string, string | undefined>,
): Promise<z.output<S>> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && v !== 'all') url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error('Zod parse failed for', path, parsed.error.format());
    throw new Error(`Schema invalido en ${path}`);
  }
  return parsed.data;
}

// ═══════════════════════════════════════════════════════════════
//  Schemas/primitivas comunes
// ═══════════════════════════════════════════════════════════════

/**
 * MariaDB/Prisma adapter devuelve DECIMAL como string ("3.4").
 * Coerce a number | null para evitar romper formatters.
 */
export const NumericOrNull = z
  .union([z.number(), z.string(), z.null()])
  .transform((v): number | null => (v == null || v === '' ? null : typeof v === 'string' ? Number(v) : v));

/** Para BIGINT que viene serializado como number, pero a veces null cuando el filtro no retorna nada. */
export const IntegerOrNull = z.union([z.number(), z.null()]).transform((v): number => v ?? 0);

export const StringOrNull = z.union([z.string(), z.null()]);

/** Filtros globales compartidos por todos los endpoints de dashboards. */
export interface DashboardFilters {
  [k: string]: string | undefined;
  desde?: string;
  hasta?: string;
  sede?: string;
  /** Agrupador comercial (costos.convenio_grupo). */
  convenio?: string;
  /** Agrupador de sede (costos.sede_grupo). */
  sedeGrupo?: string;
  /** Modalidad contractual (costos.modalidad). */
  modalidad?: string;
  /** Regimen agrupado (costos.regimen_grupo). */
  regimen?: string;
  /** Especialidad medica (costos.especialidad). */
  especialidad?: string;
  /** Grupo de especialidad homologado (costos.grupo_especialidad). */
  grupoEspecialidad?: string;
}
