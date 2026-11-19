// Cliente HTTP. Único punto de conexión con el backend.
// Sin NEXT_PUBLIC_API_URL usa las rutas internas de Next (/api/...).
// Con NEXT_PUBLIC_API_URL=http://localhost:8000 apunta al backend FastAPI (backend/main.py).
import type { Alarm } from "./alarms";
import type { AlarmPage, PageQuery } from "./alarmsQuery";
import type { DailySummary } from "./summary";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `El servidor respondió ${res.status}`);
  }
  return res.json();
}

export interface UploadResponse {
  batchId: number;
  total: number;
  rejected: number;
  stored: boolean;
}

/** Sube el lote UNA vez por archivo. El servidor asigna `batchId`, que luego identifica el lote en cada página. */
export function uploadAlarms(alarms: Alarm[], signal?: AbortSignal) {
  return request<UploadResponse>("/api/alarms/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alarms: alarms.map((a) => ({ ...a, createdAt: new Date(a.createdAt).toISOString() })) }),
    signal,
  });
}

/** Una página ya clasificada, filtrada y ordenada por el servidor (size 0 = todas las filas filtradas). */
export function fetchAlarmPage(batchId: number, q: PageQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({ batchId: String(batchId), level: q.level, q: q.q, sort: q.sort, page: String(q.page), size: String(q.size) });
  return request<AlarmPage>(`/api/alarms/page?${params}`, { signal });
}

export function fetchDailySummary(batchId: number, timeZone: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ batchId: String(batchId), timeZone });
  return request<DailySummary>(`/api/summary?${params}`, { signal });
}
