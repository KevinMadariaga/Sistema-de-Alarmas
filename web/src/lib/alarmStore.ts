// Lote de alarmas en memoria del servidor de Next (respaldo cuando NO hay NEXT_PUBLIC_API_URL).
// ponytail: memoria de un solo proceso; se pierde al reiniciar y no se comparte entre instancias.
// El backend FastAPI (backend/main.py) usa SQLite para lo mismo.
import { fold, type Alarm } from "./alarms";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Valida un elemento del body (frontera de confianza): null si no es una alarma válida. */
export function toAlarm(raw: unknown): Alarm | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = str(r.id);
  const createdAt = Date.parse(str(r.createdAt));
  if (!/^\d+$/.test(id) || !Number.isFinite(createdAt)) return null;
  return {
    id,
    g2: num(r.g2),
    g3: num(r.g3),
    g4: num(r.g4),
    createdAt,
    createdRaw: str(r.createdRaw),
    municipio: str(r.municipio),
    departamento: str(r.departamento),
    notificada: str(r.notificada).trim().toUpperCase(), // igual que el backend FastAPI
  };
}

/** Alarma guardada + texto de búsqueda ya normalizado (id, municipio, departamento) para no repetirlo por consulta. */
export type StoredAlarm = Alarm & { search: string[] };

interface Batch {
  batchId: number;
  alarms: StoredAlarm[];
}

// globalThis: cada ruta de Next se empaqueta aparte; así todas comparten el mismo lote en el proceso.
const g = globalThis as { __alarmBatch?: Batch; __alarmBatchSeq?: number };

/** Guarda el lote y devuelve su número, asignado por el SERVIDOR (no por el reloj del navegador). */
export function saveBatch(alarms: Alarm[]): number {
  const batchId = (g.__alarmBatchSeq ?? 0) + 1;
  g.__alarmBatchSeq = batchId;
  g.__alarmBatch = { batchId, alarms: alarms.map((a) => ({ ...a, search: [a.id, fold(a.municipio), fold(a.departamento)] })) };
  return batchId;
}

/** Lote vigente si coincide con `batchId`; si no, el mensaje para el usuario. */
export function getBatch(batchId: number): { alarms: StoredAlarm[] } | { error: string } {
  const b = g.__alarmBatch;
  if (!b) return { error: "El servidor no tiene el archivo (se reinició). Vuelve a cargarlo." };
  if (b.batchId !== batchId) return { error: "El archivo fue reemplazado por otra carga. Vuelve a cargarlo." };
  return { alarms: b.alarms };
}
