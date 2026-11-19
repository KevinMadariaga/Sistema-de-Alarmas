import { getBatch } from "@/lib/alarmStore";
import { isValidTimeZone, summarizeToday } from "@/lib/summary";

// GET /api/summary?batchId=&timeZone=America/Bogota → DailySummary del lote cargado.
// Respaldo interno: se usa solo si NEXT_PUBLIC_API_URL no está definida (si no, responde backend/main.py).
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const timeZone = params.get("timeZone") ?? "";
  if (!isValidTimeZone(timeZone)) return Response.json({ error: "Zona horaria inválida" }, { status: 400 });
  const batch = getBatch(Number(params.get("batchId")));
  if ("error" in batch) return Response.json({ error: batch.error }, { status: 409 });
  return Response.json(summarizeToday(batch.alarms.map((a) => a.createdAt), timeZone));
}
