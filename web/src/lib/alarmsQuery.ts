// Consulta paginada sobre el lote de alarmas (lado servidor): clasifica con la hora actual, filtra por distintivo
// y búsqueda, ordena y devuelve SOLO la página pedida. La usa la ruta interna /api/alarms/page;
// backend/main.py implementa el mismo contrato con SQL.
import { LEVELS, MAX_ALARMS, classify, matchesQuery, sortAlarms, type Alarm, type ClassifiedAlarm, type Level, type SortDir, type SortKey } from "./alarms";

export type LevelFilter = "ALL" | Level;
export type SortPreset = "level" | "recent" | "oldest";

export const PAGE_SIZE = 10;

/** Orden de cada preset. Menor duración = creada más recientemente. */
export const SORTS: Record<SortPreset, { key: SortKey; dir: SortDir }> = {
  level: { key: "level", dir: "desc" }, // Crítico → Normal; empate: mayor duración primero
  recent: { key: "duration", dir: "asc" },
  oldest: { key: "duration", dir: "desc" },
};

export interface PageQuery {
  level: LevelFilter;
  q: string;
  sort: SortPreset;
  page: number; // desde 1
  size: number; // 0 = todas las filas filtradas (exportar a Excel)
}

export interface AlarmPage {
  classifiedAt: string;
  total: number; // filas que cumplen filtro + búsqueda
  page: number;
  size: number;
  counts: Record<LevelFilter, number>; // conteo por distintivo de TODO el lote (tarjetas)
  rows: ClassifiedAlarm[];
}

const PRESETS = Object.keys(SORTS) as SortPreset[];
const FILTERS: LevelFilter[] = ["ALL", ...LEVELS];

/** Lee y acota los parámetros de la URL (frontera de confianza). */
export function parsePageQuery(params: URLSearchParams): PageQuery {
  const level = params.get("level") ?? "ALL";
  const sort = params.get("sort") ?? "level";
  const int = (v: string | null, def: number) => (v !== null && /^\d+$/.test(v) ? Number(v) : def);
  return {
    level: (FILTERS as string[]).includes(level) ? (level as LevelFilter) : "ALL",
    q: (params.get("q") ?? "").slice(0, 100),
    sort: (PRESETS as string[]).includes(sort) ? (sort as SortPreset) : "level",
    page: Math.max(1, int(params.get("page"), 1)),
    size: Math.min(MAX_ALARMS, int(params.get("size"), PAGE_SIZE)),
  };
}

// ponytail: la ruta interna clasifica y ordena todo el lote por consulta (O(n log n)); el backend FastAPI lo hace en SQL.
export function queryAlarms(alarms: (Alarm & { search?: string[] })[], now: number, q: PageQuery): AlarmPage {
  const all = alarms.map((a) => classify(a, now)); // classify conserva `search` (viene en `a`)
  const counts = { ALL: all.length, NORMAL: 0, WARN: 0, CRITICO: 0 } as Record<LevelFilter, number>;
  for (const r of all) counts[r.level]++;

  const filtered = all.filter((r) => (q.level === "ALL" || r.level === q.level) && matchesQuery(r, q.q));
  const { key, dir } = SORTS[q.sort];
  const sorted = sortAlarms(filtered, key, dir);
  const pageRows = q.size === 0 ? sorted : sorted.slice((q.page - 1) * q.size, q.page * q.size);
  const rows = pageRows.map((r) => ({ ...r, search: undefined })); // `search` es interno: JSON lo omite
  return { classifiedAt: new Date(now).toISOString(), total: filtered.length, page: q.page, size: q.size, counts, rows };
}
