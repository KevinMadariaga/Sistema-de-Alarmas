import { getBatch } from "@/lib/alarmStore";
import { parsePageQuery, queryAlarms } from "@/lib/alarmsQuery";

// GET /api/alarms/page?batchId=&level=ALL|CRITICO|WARN|NORMAL&q=&sort=level|recent|oldest&page=1&size=5
// → AlarmPage: solo las filas de la página, ya clasificadas con la hora del SERVIDOR (size=0 → todas, para Excel).
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const batchId = Number(params.get("batchId"));
  const batch = getBatch(batchId);
  if ("error" in batch) return Response.json({ error: batch.error }, { status: 409 });
  return Response.json(queryAlarms(batch.alarms, Date.now(), parsePageQuery(params)));
}
