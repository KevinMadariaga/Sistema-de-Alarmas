import { wallClockAt } from "./datetime";

// Resumen del día: agrupa por hora las alarmas creadas HOY en la zona horaria indicada.
// Lógica pura: la usa la ruta /api/summary (el backend Python replica la misma lógica en backend/services/).

export interface HourBucket {
  hour: number; // 0..23
  count: number;
}

export interface DailySummary {
  date: string; // YYYY-MM-DD en la zona horaria pedida
  timeZone: string;
  total: number;
  hours: HourBucket[];
  generatedAt: string;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function summarizeToday(timestamps: number[], timeZone: string, now = Date.now()): DailySummary {
  // wallClockAt reutiliza un formateador por zona (lib/datetime.ts).
  const partsIn = (ms: number) => {
    const w = wallClockAt(ms, timeZone);
    return { date: `${w.y}-${String(w.mo).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`, hour: w.h };
  };
  const today = partsIn(now).date;
  const hours: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  let total = 0;
  for (const ms of timestamps) {
    const p = partsIn(ms);
    if (p.date !== today) continue;
    hours[p.hour].count++;
    total++;
  }
  return { date: today, timeZone, total, hours, generatedAt: new Date(now).toISOString() };
}
