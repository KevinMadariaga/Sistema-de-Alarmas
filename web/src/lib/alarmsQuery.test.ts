// Paginación del lado servidor: consulta (filtro, búsqueda, orden, página) y rutas internas upload/page/summary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY, HOUR } from "./datetime";
import { PAGE_SIZE, parsePageQuery, queryAlarms } from "./alarmsQuery";
import type { Alarm } from "./alarms";

// Zona fija para los tests que comparan con fechas locales (multiplataforma: no depende de "TZ=…" en el script).
process.env.TZ = "America/Bogota";

const now = Date.UTC(2026, 10, 18, 17, 0, 0);
const mk = (id: number, agoMs: number, extra: Partial<Alarm> = {}): Alarm => ({
  id: String(id), g2: 100, g3: 100, g4: 100, createdAt: now - agoMs, createdRaw: "", municipio: "Cali", departamento: "Valle", notificada: "N", ...extra,
});
// 12 alarmas: 4 CRÍTICO, 4 WARN, 4 NORMAL
const lote = [
  ...[1, 2, 3, 4].map((i) => mk(i, DAY * (1 + i))),
  ...[5, 6, 7, 8].map((i) => mk(i, HOUR * (1 + i))),
  ...[9, 10, 11, 12].map((i) => mk(i, 60_000 * i, i === 12 ? { municipio: "Cubará", departamento: "Boyacá" } : {})),
];

test("queryAlarms: devuelve solo la página pedida, con conteos de todo el lote", () => {
  assert.equal(PAGE_SIZE, 10);
  const p1 = queryAlarms(lote, now, { level: "ALL", q: "", sort: "level", page: 1, size: 5 });
  assert.equal(p1.rows.length, 5);
  assert.equal(p1.total, 12);
  assert.deepEqual(p1.counts, { ALL: 12, CRITICO: 4, WARN: 4, NORMAL: 4 });
  assert.deepEqual(p1.rows.map((r) => r.level), ["CRITICO", "CRITICO", "CRITICO", "CRITICO", "WARN"]);
  assert.equal(p1.rows[0].id, "4"); // dentro del nivel: mayor duración primero

  const p3 = queryAlarms(lote, now, { level: "ALL", q: "", sort: "level", page: 3, size: 5 });
  assert.equal(p3.rows.length, 2); // 5 + 5 + 2

  const warn = queryAlarms(lote, now, { level: "WARN", q: "", sort: "recent", page: 1, size: PAGE_SIZE });
  assert.equal(warn.total, 4);
  assert.deepEqual(warn.rows.map((r) => r.id), ["5", "6", "7", "8"]);
  assert.deepEqual(warn.counts, { ALL: 12, CRITICO: 4, WARN: 4, NORMAL: 4 }); // las tarjetas no cambian con el filtro

  const busqueda = queryAlarms(lote, now, { level: "ALL", q: "cubara", sort: "level", page: 1, size: PAGE_SIZE });
  assert.deepEqual(busqueda.rows.map((r) => r.id), ["12"]);

  const todo = queryAlarms(lote, now, { level: "ALL", q: "", sort: "oldest", page: 1, size: 0 }); // exportar
  assert.equal(todo.rows.length, 12);
});

test("parsePageQuery: valores fuera de rango se acotan", () => {
  const q = parsePageQuery(new URLSearchParams("level=X&sort=Y&page=-3&size=999999999&q=" + "a".repeat(500)));
  assert.equal(q.level, "ALL");
  assert.equal(q.sort, "level");
  assert.equal(q.page, 1);
  assert.equal(q.size, 200_000);
  assert.equal(q.q.length, 100);
});

test("rutas internas: el servidor asigna el lote; subir una vez y pedir páginas", async () => {
  const { POST: upload } = await import("../app/api/alarms/upload/route");
  const { GET: page } = await import("../app/api/alarms/page/route");
  const body = (alarms: unknown[]) => new Request("http://x", { method: "POST", body: JSON.stringify({ alarms }) });
  const wire = (a: Alarm) => ({ ...a, createdAt: new Date(a.createdAt).toISOString() });

  const r1 = await (await upload(body(lote.map(wire)))).json();
  assert.deepEqual([r1.total, r1.rejected, r1.stored], [12, 0, true]);
  const p = await (await page(new Request(`http://x/api/alarms/page?batchId=${r1.batchId}&size=5`))).json();
  assert.equal(p.total, 12);
  assert.equal(p.rows.length, 5);
  assert.equal(p.rows[0].search, undefined); // el texto de búsqueda interno no viaja a la web
  const sinTildes = await (await page(new Request(`http://x/api/alarms/page?batchId=${r1.batchId}&q=CUBARA`))).json();
  assert.deepEqual(sinTildes.rows.map((r: Alarm) => r.id), ["12"]);

  const r2 = await (await upload(body([wire(mk(99, 0))]))).json();
  assert.equal(r2.batchId, r1.batchId + 1); // número asignado por el servidor, no por el reloj del navegador
  assert.equal((await page(new Request(`http://x/api/alarms/page?batchId=${r1.batchId}`))).status, 409); // el anterior ya no vale
});

test("paginación: números en bloques de 10", async () => {
  const { pageList } = await import("../components/AlarmTable");
  assert.deepEqual(pageList(1, 3), [1, 2, 3]);
  assert.deepEqual(pageList(1, 25), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "…", 25]);
  assert.deepEqual(pageList(12, 25), [1, "…", 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, "…", 25]);
  assert.deepEqual(pageList(23, 25), [1, "…", 21, 22, 23, 24, 25]);
});
