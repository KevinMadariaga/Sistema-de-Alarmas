// Ejecutar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, parseAlarms, sortAlarms, type Alarm } from "./alarms";
import { convertSeparator, detectSeparator, isAllowedFile } from "./csv";
import { HOUR, DAY, parseDate, formatDuration } from "./datetime";
import { summarizeToday } from "./summary";

// Zona fija para los tests que comparan con fechas locales (multiplataforma: no depende de "TZ=…" en el script).
process.env.TZ = "America/Bogota";

const HEADER = 'ID_ALARMA|"2G"|"3G"|"4G"|"FECHA_CREACION"|"MUNICIPIO"|"DEPARTAMENTO"|"NOTIFICADA"';
const now = new Date(2026, 10, 18, 12, 0, 0).getTime();
const base: Alarm = { id: "1", g2: 100, g3: 100, g4: 100, createdAt: now, createdRaw: "", municipio: "Cali", departamento: "Valle", notificada: "N" };

test("separador: detecta y convierte a |", () => {
  assert.equal(detectSeparator(HEADER), "|");
  assert.equal(detectSeparator("A,B;C,D"), ",");
  assert.equal(convertSeparator('a,"b,c",d\n1,2,3', ","), "a|b,c|d\n1|2|3");
});

test("parseAlarms: cabecera con comillas, error de separador y de columnas", () => {
  const ok = parseAlarms(
    `${HEADER}\n4659940|100|-1|100|2026-11-18 08:15:00|Cali|Valle|n\n4659941|100|100|100|fecha-mala|Cali|Valle|N\nALM-1|100|100|100|2026-11-18 08:15:00|Cali|Valle|N`,
  );
  assert.ok(ok.ok);
  assert.equal(ok.alarms.length, 1);
  assert.equal(ok.alarms[0].id, "4659940");
  assert.equal(ok.alarms[0].notificada, "N");
  assert.equal(ok.alarms[0].g3, -1);
  assert.deepEqual(ok.skipped.map((s) => s.line), [3, 4]);
  assert.match(ok.skipped[1].reason, /numérico/);

  // Línea real del documento
  const real = parseAlarms(`${HEADER}\n4659944|0|0|13|09-OCT-26 10.12.56.000000000 PM|"Cabuyaro"|"Meta"|"N"`);
  assert.ok(real.ok && real.skipped.length === 0);
  assert.deepEqual(
    { ...real.alarms[0], createdAt: undefined },
    { id: "4659944", g2: 0, g3: 0, g4: 13, createdAt: undefined, createdRaw: "09-OCT-26 10.12.56.000000000 PM", municipio: "Cabuyaro", departamento: "Meta", notificada: "N" },
  );
  assert.equal(classify(real.alarms[0], now).level, "NORMAL"); // (0,0,13): ninguna al 100

  const sep = parseAlarms(HEADER.replaceAll("|", ";"));
  assert.deepEqual(!sep.ok && sep.issue, { kind: "separator", detected: ";" });

  const cols = parseAlarms("ID_ALARMA|2G|3G");
  assert.ok(!cols.ok && cols.issue.kind === "columns" && cols.issue.missing.includes("FECHA_CREACION"));
});

test("parseDate: 24h y 12h equivalentes, inválidas null", () => {
  const mil = parseDate("2026-11-18 14:30:00");
  assert.equal(parseDate("18/11/2026 02:30:00 PM"), mil);
  assert.equal(parseDate("18/11/2026 2:30 p. m."), mil);
  assert.equal(parseDate("18/11/2026 12:05 AM"), new Date(2026, 10, 18, 0, 5).getTime());
  assert.equal(parseDate("2026-11-18T19:30:00Z"), mil); // Bogotá = UTC-5
  // Formato Oracle del documento real
  assert.equal(parseDate("09-OCT-26 10.12.56.000000000 PM"), new Date(2026, 9, 9, 22, 12, 56).getTime());
  assert.equal(parseDate("18-NOV-26 02.30.00.000000000 PM"), mil);
  assert.equal(parseDate("18-nov-2026 14.30.00"), mil);
  assert.equal(parseDate("01-ENE-26 12.00.00.000000000 AM"), new Date(2026, 0, 1, 0, 0).getTime());
  assert.equal(parseDate("09-XYZ-26 10.12.56 PM"), null);
  assert.equal(parseDate("31/02/2026 10:00"), null);
  assert.equal(parseDate("13:00 PM"), null);
});

test("classify: umbrales WARN / CRÍTICO y condición base", () => {
  const at = (ms: number, a: Partial<Alarm> = {}) => classify({ ...base, ...a, createdAt: now - ms }, now).level;
  assert.equal(at(HOUR), "NORMAL");
  assert.equal(at(HOUR + 1), "WARN");
  assert.equal(at(DAY), "WARN");
  assert.equal(at(DAY + 1), "CRITICO");
  assert.equal(at(DAY * 2, { notificada: "S" }), "NORMAL");
  assert.equal(at(DAY * 2, { g4: 99 }), "CRITICO"); // basta una al 100
  assert.equal(at(DAY * 2, { g2: 0, g3: 50, g4: 99 }), "NORMAL"); // ninguna al 100
  assert.equal(at(DAY * 2, { g2: -1, g3: -1, g4: -1 }), "NORMAL");
  assert.equal(at(DAY * 2, { g2: 0 }), "CRITICO"); // 0 es >= 0; 3G y 4G al 100
  assert.equal(at(DAY * 2, { g3: -1 }), "NORMAL"); // un negativo ya no cumple base
  assert.equal(at(DAY * 2, { g4: null }), "NORMAL"); // vacío tampoco
  assert.equal(at(-HOUR), "NORMAL"); // fecha futura → duración 0
});

test("sortAlarms: por nivel asc/desc (desc = críticos primero, por defecto)", () => {
  const rows = [DAY * 2, HOUR * 2, 0].map((ms, i) => classify({ ...base, id: String(i), createdAt: now - ms }, now));
  assert.deepEqual(sortAlarms(rows, "level", "asc").map((r) => r.level), ["NORMAL", "WARN", "CRITICO"]);
  assert.deepEqual(sortAlarms(rows, "level", "desc").map((r) => r.level), ["CRITICO", "WARN", "NORMAL"]);
});

test("summarizeToday: solo hoy en la zona horaria, agrupado por hora", () => {
  const ts = [
    Date.parse("2026-11-18T13:10:00Z"), // 08:10 Bogotá
    Date.parse("2026-11-18T13:50:00Z"), // 08:50 Bogotá
    Date.parse("2026-11-18T04:00:00Z"), // 23:00 del 17 en Bogotá → fuera
  ];
  const s = summarizeToday(ts, "America/Bogota", Date.parse("2026-11-18T17:00:00Z"));
  assert.equal(s.date, "2026-11-18");
  assert.equal(s.total, 2);
  assert.equal(s.hours[8].count, 2);
  // Misma data en Madrid: 04:00Z = 05:00 del 18 → sí cuenta
  assert.equal(summarizeToday(ts, "Europe/Madrid", Date.parse("2026-11-18T17:00:00Z")).total, 3);
});

test("formatDuration", () => {
  assert.equal(formatDuration(DAY * 23 + HOUR * 15 + 40 * 60_000), "23 Días"); // solo la mayor unidad
  assert.equal(formatDuration(DAY), "1 Día");
  assert.equal(formatDuration(HOUR * 22 + 59 * 60_000), "22 Horas");
  assert.equal(formatDuration(HOUR), "1 Hora");
  assert.equal(formatDuration(24 * 60_000), "24 Minutos");
  assert.equal(formatDuration(60_000), "1 Minuto");
  assert.equal(formatDuration(0), "0 Minutos");
});

test("tipo de archivo: solo .csv; binario, vacío y solo cabecera se rechazan", () => {
  assert.equal(isAllowedFile("alarmas.csv"), true);
  assert.equal(isAllowedFile("ALARMAS.CSV"), true);
  for (const n of ["alarmas.xlsx", "alarmas.txt", "alarmas.csv.pdf", "alarmas"]) assert.equal(isAllowedFile(n), false, n);
  const bin = parseAlarms("PK\u0003\u0004\u0000\u0000xl/workbook.xml");
  assert.deepEqual(!bin.ok && bin.issue, { kind: "binary" });
  const empty = parseAlarms("\n\n");
  assert.deepEqual(!empty.ok && empty.issue, { kind: "empty" });
  const onlyHeader = parseAlarms(HEADER + "\n");
  assert.deepEqual(!onlyHeader.ok && onlyHeader.issue, { kind: "empty" });
  const bomCrlf = parseAlarms(`\uFEFF${HEADER}\r\n4659940|100|100|100|2026-11-18 08:15:00|Cali|Valle|N\r\n`);
  assert.ok(bomCrlf.ok && bomCrlf.alarms.length === 1);
});

test("code review: fechas, comillas multilínea y números estrictos", () => {
  // Oracle con año de 4 dígitos y sin hora no se confunde con zona horaria
  assert.equal(parseDate("09-ENE-2026"), new Date(2026, 0, 9).getTime());
  assert.equal(parseDate("09-OCT-2026"), new Date(2026, 9, 9).getTime());
  // Zonas con espacio u offset de 2 dígitos
  const z = Date.parse("2026-10-09T10:12:56-05:00");
  assert.equal(parseDate("2026-10-09 10:12:56 -05:00"), z);
  assert.equal(parseDate("2026-10-09 10:12:56-05"), z);
  assert.equal(parseDate("2026-10-09T10:12:56-0500"), z);
  assert.equal(parseDate("2026-10-09T15:12:56Z"), z);
  // Salto de línea dentro de comillas = mismo registro
  const r = parseAlarms(`${HEADER}\n4659940|100|100|100|2026-11-18 08:15:00|"San José\ndel Guaviare"|"Guaviare"|N`);
  assert.ok(r.ok && r.alarms.length === 1 && r.alarms[0].municipio === "San José\ndel Guaviare");
  assert.equal(convertSeparator('a,"x\ny",b', ","), 'a|"x\ny"|b');
  // Números: solo decimales simples
  const n = parseAlarms(`${HEADER}\n1|0x64|1e2|85,5|2026-11-18 08:15:00|C|D|N`);
  assert.ok(n.ok);
  assert.deepEqual([n.alarms[0].g2, n.alarms[0].g3, n.alarms[0].g4], [null, null, 85.5]);
});

test("matchesQuery: busca por ID, municipio o departamento sin importar tildes ni mayúsculas", async () => {
  const { matchesQuery } = await import("./alarms");
  const a = { ...base, id: "4659944", municipio: "Cubará", departamento: "Boyacá" };
  for (const q of ["", "46599", "cubara", "CUBARÁ", "boya", " Boyacá "]) assert.equal(matchesQuery(a, q), true, q);
  for (const q of ["4700", "Meta", "Bogotá"]) assert.equal(matchesQuery(a, q), false, q);
});

test("review 2: hora de un dígito con zona y número de línea físico", () => {
  assert.equal(parseDate("2026-11-18 9:30:00Z"), Date.parse("2026-11-18T09:30:00Z"));
  assert.equal(parseDate("2026-11-18 9:30:00.5-05:00"), Date.parse("2026-11-18T09:30:00.5-05:00"));
  // cabecera(1), 2 en blanco(2-3), registro de 2 líneas(4-5), ALM(6), blanco(7), X(8)
  const text = `${HEADER}\n\n\n4659940|100|100|100|2026-11-18 08:15:00|"San\nJosé"|"Meta"|N\nALM|100|100|100|2026-11-18 08:15:00|C|D|N\n\nX|1|1|1|fecha|C|D|N`;
  const r = parseAlarms(text);
  assert.ok(r.ok);
  assert.deepEqual(r.skipped.map((s) => s.line), [6, 8]);
});

test("detectDateFormat / summarizeFormats: identifica el formato original del documento", async () => {
  const { detectDateFormat, summarizeFormats } = await import("./datetime");
  assert.equal(detectDateFormat("09-OCT-26 10.12.56.000000000 PM"), "Oracle 12 h (AM/PM)");
  assert.equal(detectDateFormat("09-OCT-26 22.12.56"), "Oracle 24 h (militar)");
  assert.equal(detectDateFormat("2026-11-18 14:30:00"), "Militar 24 h");
  assert.equal(detectDateFormat("18/11/2026 2:30 p. m."), "Estándar 12 h (AM/PM)");
  assert.equal(detectDateFormat("2026-11-18T19:30:00Z"), "ISO con zona horaria");
  const g = summarizeFormats([
    { createdRaw: "2026-11-18 14:30:00", createdAt: 1 },
    { createdRaw: "09-OCT-26 10.12.56.000000000 PM", createdAt: 2 },
    { createdRaw: "2026-11-18 08:00:00", createdAt: 3 },
  ]);
  assert.deepEqual(g.map((x) => [x.format, x.count, x.example]), [["Militar 24 h", 2, "2026-11-18 14:30:00"], ["Oracle 12 h (AM/PM)", 1, "09-OCT-26 10.12.56.000000000 PM"]]);
});

test("review 3: comilla suelta, zona de los datos, conversión con líneas y límite de filas", () => {
  // Una comilla a mitad de un campo es texto: no se "traga" las filas siguientes
  const q = parseAlarms(`${HEADER}\n1|100|100|100|2026-11-18 08:00:00|Antena 5" norte|Meta|N\n2|100|100|100|2026-11-18 09:00:00|Cali|Valle|N`);
  assert.ok(q.ok && q.alarms.length === 2 && q.alarms[0].municipio === 'Antena 5" norte');
  // Fecha sin zona = hora de Colombia, sin importar el navegador (10:00 Bogotá = 15:00 UTC)
  assert.equal(parseDate("2026-11-18 10:00:00"), Date.UTC(2026, 10, 18, 15, 0, 0));
  // Convertir separador conserva la numeración física (líneas en blanco incluidas)
  const conv = convertSeparator(`${HEADER.replaceAll("|", ";")}\n\n\nALM;100;100;100;2026-11-18 08:00:00;C;D;N`, ";");
  const r = parseAlarms(conv);
  assert.ok(r.ok && r.skipped[0].line === 4);
  // Más filas de las permitidas → aviso antes de enviar al backend
  const big = parseAlarms(HEADER + "\n" + "1|100|100|100|2026-11-18 08:00:00|C|D|N\n".repeat(200_001));
  assert.ok(!big.ok && big.issue.kind === "tooMany");
});

test("docDate/docTime: muestran la fecha y hora del documento tal cual, solo cambia el formato", async () => {
  const { docDate, docTime } = await import("./datetime");
  const cases: [string, string, string, string][] = [
    // [valor en el documento, fecha, 12 h, 24 h]
    ["09-OCT-26 10.12.56.000000000 PM", "09/10/2026", "10:12:56 PM", "22:12:56"],
    ["09-OCT-26 22.12.56", "09/10/2026", "10:12:56 PM", "22:12:56"],
    ["2026-11-18 14:30:00", "18/11/2026", "02:30:00 PM", "14:30:00"],
    ["18/11/2026 2:30 p. m.", "18/11/2026", "02:30:00 PM", "14:30:00"],
    ["18/11/2026 12:05 AM", "18/11/2026", "12:05:00 AM", "00:05:00"],
    ["2026-11-18T19:30:00Z", "18/11/2026", "07:30:00 PM", "19:30:00"], // con zona: NO se convierte a hora local
    ["2026-11-18 23:30:00-05:00", "18/11/2026", "11:30:00 PM", "23:30:00"],
  ];
  for (const [raw, date, h12, h24] of cases) {
    assert.equal(docDate(raw), date, raw);
    assert.equal(docTime(raw, "12h"), h12, raw);
    assert.equal(docTime(raw, "24h"), h24, raw);
  }
});

test("hora de Colombia: 'ahora', fechas y duración no dependen de la zona del navegador", async () => {
  const { formatTime, formatDate, wallClockAt, parseDate: pd } = await import("./datetime");
  const instante = Date.UTC(2026, 10, 18, 20, 30, 0); // 20:30 UTC = 15:30 en Colombia (UTC-5, sin horario de verano)
  assert.equal(formatTime(instante, "24h"), "15:30:00");
  assert.equal(formatTime(instante, "12h", false), "03:30 PM");
  assert.equal(formatDate(Date.UTC(2026, 10, 19, 3, 0)), "18/11/2026"); // 03:00 UTC del 19 = 22:00 del 18 en Colombia
  assert.equal(wallClockAt(instante).h, 15);
  // Duración = instante actual − instante de creación (documento en hora de Colombia)
  assert.equal(instante - pd("2026-11-18 13:30:00")!, 2 * HOUR);
});

test("review 4: columnas que no cuadran y desfases horarios imposibles", () => {
  const r = parseAlarms(`${HEADER}\n1|0|0|100|09-OCT-26 10.12.56.000000000 PM|"Cabuyaro|"Meta"|"N"\n2|100|100|100|2026-11-18 08:00:00|Cali|Valle|N`);
  assert.ok(r.ok);
  assert.deepEqual(r.alarms.map((a) => a.id), ["2"]);
  assert.match(r.skipped[0].reason, /columnas/);
  assert.equal(parseDate("2026-10-09 10:00 +25:99"), null);
  assert.equal(parseDate("2026-10-09 10:00 +14:00"), Date.UTC(2026, 9, 8, 20, 0));
});
