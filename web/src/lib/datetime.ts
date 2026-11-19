// Fechas: parseo de formatos militar (24 h), estándar (12 h AM/PM), Oracle (09-OCT-26 10.12.56.000000000 PM)
// e ISO con zona; formateo 12 h / 24 h para la tabla y el Excel.
// Todo se maneja en hora estándar de Colombia (DATA_TIME_ZONE), nunca en la del navegador:
// - fechas SIN zona del documento se interpretan como hora de Colombia (igual que el backend);
// - "ahora", el resumen del día y la hora de exportación se muestran en hora de Colombia;
// - la duración acumulada la calcula el servidor: su reloj (instante absoluto) − instante de creación.

export type TimeFormat = "12h" | "24h";

/** Zona horaria en la que está escrita FECHA_CREACION cuando no trae zona (= COLOMBIA_TZ del backend). */
export const DATA_TIME_ZONE = "America/Bogota";

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

/** Fecha y hora de pared de un instante en la zona `tz` (por defecto Colombia), sin depender del navegador. */
export function wallClockAt(epoch: number, tz: string = DATA_TIME_ZONE) {
  let fmt = zoneFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    zoneFormatters.set(tz, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(epoch).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** Diferencia (ms) entre la hora de pared en `tz` y UTC para un instante dado. */
function tzOffsetMs(epoch: number, tz: string): number {
  const w = wallClockAt(epoch, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(epoch / 1000) * 1000;
}

/** Hora de pared (año, mes 1-12, …) en `tz` → epoch ms. Dos pasadas para cubrir cambios de horario. */
function zonedToEpoch(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let epoch = wall - tzOffsetMs(wall, tz);
  epoch = wall - tzOffsetMs(epoch, tz);
  return epoch;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// Zona al final de una fecha ISO: "Z", "-05", "-0500", "-05:00" (con o sin espacio antes).
const ISO_WITH_ZONE = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(Z|[+-]\d{2}(?::?\d{2})?)$/i;
const TIME = String.raw`(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp]\.?\s?[Mm]\.?)?)?`;
const YMD = new RegExp(String.raw`^(\d{4})[-/](\d{1,2})[-/](\d{1,2})${TIME}$`);
// dd/mm/yyyy (formato regional Colombia/LatAm)
const DMY = new RegExp(String.raw`^(\d{1,2})[-/](\d{1,2})[-/](\d{4})${TIME}$`);
// Formato Oracle (TIMESTAMP): "09-OCT-26 10.12.56.000000000 PM"
const ORACLE = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})(?:\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?(?:[.,]\d+)?\s*([AaPp]\.?\s?[Mm]\.?)?)?$/;
// Abreviaturas en inglés (Oracle por defecto) y español.
const MONTHS: Record<string, number> = {
  JAN: 1, ENE: 1, FEB: 2, MAR: 3, APR: 4, ABR: 4, MAY: 5, JUN: 6, JUL: 7,
  AUG: 8, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DEC: 12, DIC: 12,
};

/** Fecha y hora "de pared" tal como están escritas en el documento (sin convertir de zona). */
export interface WallClock {
  y: number;
  mo: number; // 1-12
  d: number;
  h: number; // 0-23
  mi: number;
  s: number;
}

/** Lee la fecha del documento: hora de pared + desfase (minutos) si el texto trae zona; null si es inválida. */
function parseWall(raw: string): { wall: WallClock; offsetMin: number | null; ms: number } | null {
  const s = raw.trim();
  if (!s) return null;

  let y: string, mo: string, d: string, h: string | undefined, mi: string | undefined, se: string | undefined, ap: string | undefined;
  let offsetMin: number | null = null;
  let ms = 0; // fracción de segundo (solo ISO)

  // Solo fechas año-mes-día CON hora pueden traer zona: así "09-ENE-2026" (Oracle) no se confunde con "-2026".
  const iso = ISO_WITH_ZONE.exec(s);
  let m: RegExpExecArray | null;
  if (iso) {
    const [, date, time, zone] = iso;
    [y, mo, d] = date.split("-");
    [h, mi, se] = time.split(":");
    const [whole, frac] = (se ?? "").split(".");
    se = whole || undefined;
    if (frac) ms = Number((frac + "00").slice(0, 3));
    if (zone.toUpperCase() === "Z") offsetMin = 0;
    else {
      const digits = zone.replace(":", "");
      const sign = digits[0] === "-" ? -1 : 1;
      const [oh, om] = [Number(digits.slice(1, 3)), Number(digits.slice(3, 5) || 0)];
      if (oh > 14 || om > 59) return null; // no existen zonas fuera de −12…+14 h
      offsetMin = sign * (oh * 60 + om);
    }
  } else if ((m = YMD.exec(s))) [, y, mo, d, h, mi, se, ap] = m;
  else if ((m = DMY.exec(s))) [, d, mo, y, h, mi, se, ap] = m;
  else if ((m = ORACLE.exec(s))) {
    [, d, mo, y, h, mi, se, ap] = m;
    const month = MONTHS[mo.toUpperCase()];
    if (!month) return null;
    mo = String(month);
    // Año de 2 dígitos estilo Oracle RR: 00–49 → 20xx, 50–99 → 19xx.
    if (y.length === 2) y = String((Number(y) < 50 ? 2000 : 1900) + Number(y));
  } else return null;

  let hour = Number(h ?? 0);
  const min = Number(mi ?? 0);
  const sec = Number(se ?? 0);
  if (ap) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (/^p/i.test(ap) ? 12 : 0);
  }
  if (hour > 23 || min > 59 || sec > 59) return null;

  // Rechaza fechas que JS "corrige" (ej. 31/02).
  const check = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (check.getUTCMonth() !== Number(mo) - 1 || check.getUTCDate() !== Number(d)) return null;
  return { wall: { y: Number(y), mo: Number(mo), d: Number(d), h: hour, mi: min, s: sec }, offsetMin, ms };
}

/**
 * Instante real (epoch ms) de la fecha del documento, o null si es inválida. Acepta 24 h, 12 h (AM/PM, a. m./p. m.),
 * Oracle e ISO. Sirve para calcular la DURACIÓN y el nivel; para MOSTRAR la fecha se usa docDate/docTime.
 */
export function parseDate(raw: string): number | null {
  const p = parseWall(raw);
  if (!p) return null;
  const { y, mo, d, h, mi, s } = p.wall;
  if (p.offsetMin !== null) return Date.UTC(y, mo - 1, d, h, mi, s, p.ms) - p.offsetMin * MINUTE;
  return zonedToEpoch(y, mo, d, h, mi, s, DATA_TIME_ZONE);
}

/** Cómo viene escrita la hora en el documento (antes de convertirla). */
export function detectDateFormat(raw: string): string {
  const s = raw.trim();
  if (ISO_WITH_ZONE.test(s)) return "ISO con zona horaria";
  const o = ORACLE.exec(s);
  if (o) return !o[4] ? "Oracle, solo fecha" : o[7] ? "Oracle 12 h (AM/PM)" : "Oracle 24 h (militar)";
  const m = YMD.exec(s) ?? DMY.exec(s);
  if (m) return !m[4] ? "Solo fecha" : m[7] ? "Estándar 12 h (AM/PM)" : "Militar 24 h";
  return "Desconocido";
}

export interface FormatGroup {
  format: string;
  count: number;
  example: string; // primer valor del documento con ese formato
}

/** Agrupa las fechas del documento por formato detectado (el más frecuente primero). */
export function summarizeFormats<T extends { createdRaw: string }>(rows: T[]): FormatGroup[] {
  const groups = new Map<string, FormatGroup>();
  for (const r of rows) {
    const format = detectDateFormat(r.createdRaw);
    const g = groups.get(format);
    if (g) g.count++;
    else groups.set(format, { format, count: 1, example: r.createdRaw });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha de un instante en hora de Colombia (dd/mm/aaaa). */
export function formatDate(ms: number): string {
  const w = wallClockAt(ms);
  return `${pad(w.d)}/${pad(w.mo)}/${w.y}`;
}

function formatClock(h: number, mi: number, s: number, fmt: TimeFormat, withSeconds = true): string {
  const tail = `${pad(mi)}${withSeconds ? `:${pad(s)}` : ""}`;
  if (fmt === "24h") return `${pad(h)}:${tail}`;
  return `${pad(h % 12 || 12)}:${tail} ${h < 12 ? "AM" : "PM"}`;
}

/** Hora de un instante en hora de Colombia (para "ahora"; las fechas del documento usan docTime). */
export function formatTime(ms: number, fmt: TimeFormat, withSeconds = true): string {
  const w = wallClockAt(ms);
  return formatClock(w.h, w.mi, w.s, fmt, withSeconds);
}

/** Fecha del documento tal cual (dd/mm/aaaa), sin sumar ni restar horas por zona horaria. */
export function docDate(raw: string): string {
  const w = parseWall(raw)?.wall;
  return w ? `${pad(w.d)}/${pad(w.mo)}/${w.y}` : "—";
}

/** Hora del documento tal cual, solo cambiando el formato (12 h AM/PM ↔ 24 h). */
export function docTime(raw: string, fmt: TimeFormat): string {
  const w = parseWall(raw)?.wall;
  return w ? formatClock(w.h, w.mi, w.s, fmt) : "—";
}

const unit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Duración acumulada en UNA sola unidad (la mayor completa): "23 Días" · "22 Horas" · "24 Minutos". */
export function formatDuration(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe >= DAY) return unit(Math.floor(safe / DAY), "Día", "Días");
  if (safe >= HOUR) return unit(Math.floor(safe / HOUR), "Hora", "Horas");
  return unit(Math.floor(safe / MINUTE), "Minuto", "Minutos");
}

/** Etiqueta de franja horaria: "08:00" o "8:00 AM". */
export function formatHourLabel(hour: number, fmt: TimeFormat): string {
  if (fmt === "24h") return `${pad(hour)}:00`;
  return `${hour % 12 || 12}:00 ${hour < 12 ? "AM" : "PM"}`;
}

