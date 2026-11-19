// Dominio de alarmas: parseo del documento (navegador), condiciones base y clasificación
// (las usa la ruta interna /api/alarms/page; backend/services/alarmas_service.py replica la misma regla) y orden.
import { SEPARATOR, detectSeparator, looksBinary, splitLine, toRecords } from "./csv";
import { DAY, HOUR, parseDate } from "./datetime";

export const COLUMNS = ["ID_ALARMA", "2G", "3G", "4G", "FECHA_CREACION", "MUNICIPIO", "DEPARTAMENTO", "NOTIFICADA"] as const;

/** Orden de severidad: menor → mayor. */
export const LEVELS = ["NORMAL", "WARN", "CRITICO"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABEL: Record<Level, string> = {
  NORMAL: "Normal",
  WARN: "WARN",
  CRITICO: "CRÍTICO",
};

export interface Alarm {
  id: string;
  g2: number | null;
  g3: number | null;
  g4: number | null;
  createdAt: number; // epoch ms
  createdRaw: string; // FECHA_CREACION tal como viene en el documento
  municipio: string;
  departamento: string;
  notificada: string; // "S" | "N"
}

export interface ClassifiedAlarm extends Alarm {
  durationMs: number;
  level: Level;
  meetsBase: boolean;
  reason: string; // por qué cumple / no cumple la condición base
}

export type LoadIssue =
  | { kind: "fileType"; extension: string } // extensión distinta de .csv
  | { kind: "binary" } // extensión .csv pero contenido binario (ej. Excel renombrado)
  | { kind: "empty" }
  | { kind: "tooMany"; count: number; max: number } // más filas de las que acepta el backend
  | { kind: "separator"; detected: string | null }
  | { kind: "columns"; missing: string[]; found: string[] };

export interface SkippedRow {
  line: number; // número de línea en el archivo (1 = cabecera)
  reason: string;
  raw: string; // línea original del documento
}

export type ParseResult =
  | { ok: true; alarms: Alarm[]; skipped: SkippedRow[] }
  | { ok: false; issue: LoadIssue };

/** Solo decimales simples ("100", "-1", "85.5", "85,5"); rechaza "0x64", "1e2", "1,000.5". */
const toNumber = (v: string): number | null => (/^-?\d+(?:[.,]\d+)?$/.test(v) ? Number(v.replace(",", ".")) : null);

/** Límite de alarmas por petición, compartido por las rutas /api. */
export const MAX_ALARMS = 200_000;

export function parseAlarms(text: string): ParseResult {
  if (looksBinary(text)) return { ok: false, issue: { kind: "binary" } };
  const records = toRecords(text);
  const lines = records.map((r) => r.text);
  if (lines.length === 0) return { ok: false, issue: { kind: "empty" } };

  const detected = detectSeparator(lines[0]);
  if (detected !== SEPARATOR) return { ok: false, issue: { kind: "separator", detected } };

  const header = splitLine(lines[0], SEPARATOR).map((h) => h.toUpperCase());
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { ok: false, issue: { kind: "columns", missing, found: header } };
  if (lines.length === 1) return { ok: false, issue: { kind: "empty" } }; // solo cabecera, sin filas
  if (lines.length - 1 > MAX_ALARMS) return { ok: false, issue: { kind: "tooMany", count: lines.length - 1, max: MAX_ALARMS } };

  const idx = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<(typeof COLUMNS)[number], number>;
  const alarms: Alarm[] = [];
  const skipped: SkippedRow[] = [];

  records.slice(1).forEach(({ line: lineNo, text: line }) => {
    const f = splitLine(line, SEPARATOR);
    // Una comilla mal cerrada o un separador de más corren las columnas: la fila se omite, no se adivina.
    if (f.length !== header.length) {
      skipped.push({ line: lineNo, reason: `Tiene ${f.length} columnas y la cabecera ${header.length} (revisa comillas o separadores)`, raw: line });
      return;
    }
    const id = f[idx.ID_ALARMA] ?? "";
    if (!/^\d+$/.test(id)) {
      skipped.push({ line: lineNo, reason: `ID_ALARMA debe ser numérico: "${id}"`, raw: line });
      return;
    }
    const createdAt = parseDate(f[idx.FECHA_CREACION] ?? "");
    if (createdAt === null) {
      skipped.push({ line: lineNo, reason: `FECHA_CREACION inválida: "${f[idx.FECHA_CREACION] ?? ""}"`, raw: line });
      return;
    }
    alarms.push({
      id, // string de dígitos: evita perder precisión en IDs largos
      g2: toNumber(f[idx["2G"]] ?? ""),
      g3: toNumber(f[idx["3G"]] ?? ""),
      g4: toNumber(f[idx["4G"]] ?? ""),
      createdAt,
      createdRaw: f[idx.FECHA_CREACION] ?? "",
      municipio: f[idx.MUNICIPIO] ?? "",
      departamento: f[idx.DEPARTAMENTO] ?? "",
      notificada: (f[idx.NOTIFICADA] ?? "").toUpperCase(),
    });
  });

  return { ok: true, alarms, skipped };
}

/** Tecnología con valor válido = número >= 0. Negativo o vacío → la alarma no cumple la condición base. */
export const isAvailable = (v: number | null): v is number => v !== null && v >= 0;

/**
 * Condición base (mismo orden que la regla de negocio). Si falla → NORMAL.
 *  1. NOTIFICADA = 'N'.
 *  2. Las TRES tecnologías (2G/3G/4G) tienen valor >= 0; un negativo o vacío ya no cumple.
 *  3. AL MENOS UNA vale exactamente 100.
 */
export function checkBase(a: Alarm): { ok: boolean; reason: string } {
  if (a.notificada !== "N") return { ok: false, reason: `Ya notificada (NOTIFICADA = '${a.notificada || "vacío"}')` };
  const techs = [a.g2, a.g3, a.g4];
  if (!techs.every(isAvailable)) return { ok: false, reason: "Alguna tecnología con valor negativo o vacío" };
  if (!techs.some((v) => v === 100)) return { ok: false, reason: "Ninguna tecnología está al 100" };
  return { ok: true, reason: "Cumple condición base" };
}

export function classify(a: Alarm, now: number): ClassifiedAlarm {
  const durationMs = Math.max(0, now - a.createdAt);
  const base = checkBase(a);
  let level: Level = "NORMAL"; // todo lo que no entra en CRÍTICO ni WARN
  if (base.ok) level = durationMs > DAY ? "CRITICO" : durationMs > HOUR ? "WARN" : "NORMAL";
  return { ...a, durationMs, level, meetsBase: base.ok, reason: base.reason };
}

/** Minúsculas y sin tildes: "Bogotá" y "BOGOTA" coinciden con "bogota". */
export const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Búsqueda libre: el texto aparece en el ID, el municipio o el departamento. */
export function matchesQuery(a: Alarm & { search?: string[] }, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  // `search` (precalculado al subir el lote) evita normalizar los textos en cada consulta.
  const campos = a.search ?? [a.id, fold(a.municipio), fold(a.departamento)];
  return campos.some((c) => c.includes(q));
}

export type SortKey = "level" | "duration";
export type SortDir = "asc" | "desc";

const levelRank = (l: Level) => LEVELS.indexOf(l);

/** Orden por defecto: nivel (Normal → WARN → CRÍTICO) y, dentro del nivel, mayor duración primero. */
export function sortAlarms<T extends ClassifiedAlarm>(rows: T[], key: SortKey, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const cmp = (a: ClassifiedAlarm, b: ClassifiedAlarm): number => {
    switch (key) {
      case "level":
        return levelRank(a.level) - levelRank(b.level);
      case "duration":
        return a.durationMs - b.durationMs;
    }
  };
  return [...rows].sort((a, b) => sign * cmp(a, b) || b.durationMs - a.durationMs);
}
