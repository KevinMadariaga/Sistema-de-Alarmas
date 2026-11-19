import { MAX_ALARMS } from "@/lib/alarms";
import { saveBatch, toAlarm } from "@/lib/alarmStore";

// POST /api/alarms/upload  { alarms: [{ id, g2, g3, g4, createdAt: ISO, createdRaw, municipio, departamento, notificada }] }
// → { batchId, total, rejected, stored }   Se sube UNA vez por archivo; `batchId` (asignado aquí) identifica el lote.
// Respaldo interno: se usa solo si NEXT_PUBLIC_API_URL no está definida (si no, responde backend/main.py).
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { alarms } = (body ?? {}) as { alarms?: unknown };
  if (!Array.isArray(alarms) || alarms.length > MAX_ALARMS) {
    return Response.json({ error: `'alarms' debe ser un arreglo de máximo ${MAX_ALARMS} elementos` }, { status: 400 });
  }
  const valid = alarms.map(toAlarm).filter((a) => a !== null);
  const batchId = saveBatch(valid);
  return Response.json({ batchId, total: valid.length, rejected: alarms.length - valid.length, stored: true });
}
