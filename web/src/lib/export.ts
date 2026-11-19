// Exporta a Excel exactamente las filas visibles (filtro + búsqueda + orden aplicados).
import { LEVEL_LABEL, LEVELS, type ClassifiedAlarm, type Level } from "./alarms";
import { XLSX } from "./theme";
import { docDate, docTime, formatDate, formatDuration, formatTime, type TimeFormat } from "./datetime";

const LEVEL_FILL = XLSX.level;
/** En el Excel los distintivos van en mayúscula: NORMAL, WARN, CRÍTICO. */
const XLSX_LABEL = Object.fromEntries(LEVELS.map((l) => [l, LEVEL_LABEL[l].toUpperCase()])) as Record<Level, string>;
const BORDER = { style: "thin" as const, color: { argb: XLSX.border } };
const BORDERS = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

export async function exportToExcel(rows: ClassifiedAlarm[], fileName: string, filterLabel: string, fmt: TimeFormat, generatedAt: number) {
  const { default: ExcelJS } = await import("exceljs"); // carga diferida: no pesa en el bundle inicial
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema de Alarmas";
  wb.created = new Date();

  // ---------- Hoja 1: Alarmas ----------
  const ws = wb.addWorksheet("Alarmas", { views: [{ state: "frozen", ySplit: 1 }] });
  // Mismas columnas y en el mismo orden que la tabla de la web.
  ws.columns = [
    { header: "DISTINTIVO", key: "level", width: 12 },
    { header: "ID ALARMA", key: "id", width: 13 },
    { header: "2G", key: "g2", width: 7 },
    { header: "3G", key: "g3", width: 7 },
    { header: "4G", key: "g4", width: 7 },
    { header: "FECHA", key: "date", width: 13 },
    { header: fmt === "12h" ? "HORA (AM/PM)" : "HORA (24 H)", key: "hora", width: 14 },
    { header: "DURACIÓN ACUMULADA", key: "dur", width: 19 },
    { header: "MUNICIPIO", key: "mun", width: 20 },
    { header: "DEPARTAMENTO", key: "dep", width: 20 },
    { header: "NOTIFICADA", key: "notif", width: 12 },
  ];

  for (const r of rows) {
    ws.addRow({
      id: r.id, // texto: un ID largo o con ceros a la izquierda no pierde dígitos
      level: XLSX_LABEL[r.level],
      // Fecha y hora tal como están en el documento; solo cambia el formato (12 h / 24 h).
      date: docDate(r.createdRaw),
      hora: docTime(r.createdRaw, fmt),
      dur: formatDuration(r.durationMs),
      g2: r.g2 ?? "",
      g3: r.g3 ?? "",
      g4: r.g4 ?? "",
      notif: r.notificada,
      mun: r.municipio,
      dep: r.departamento,
    });
  }

  ws.eachRow((row, n) => {
    row.height = n === 1 ? 24 : 18;
    row.eachCell((cell) => {
      cell.border = BORDERS;
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: n === 1 };
      if (n === 1) {
        cell.font = { bold: true, color: { argb: XLSX.headerFg } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX.headerBg } };
      }
    });
    if (n > 1) {
      const level = rows[n - 2].level;
      const nivel = row.getCell("level");
      nivel.font = { bold: true, color: { argb: LEVEL_FILL[level].fg } };
      nivel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LEVEL_FILL[level].bg } };
      if (rows[n - 2].notificada === "S") row.getCell("notif").font = { bold: true, underline: true };
      if (n % 2 === 1) {
        // filas alternas (cebra) excepto la celda de nivel
        row.eachCell((cell, col) => {
          if (col !== 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX.zebra } };
        });
      }
    }
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  // ---------- Hoja 2: Resumen ----------
  const info = wb.addWorksheet("Resumen");
  info.columns = [{ width: 26 }, { width: 30 }];
  const count = (l: Level) => rows.filter((r) => r.level === l).length;
  const lines: [string, string | number][] = [
    ["Generado (hora Colombia)", `${formatDate(generatedAt)} ${formatTime(generatedAt, fmt)}`],
    ["Formato de hora", fmt === "12h" ? "12 h (AM/PM)" : "24 h (militar)"],
    ["Filtro aplicado", filterLabel],
    ["Total de filas", rows.length],
    ...[...LEVELS].reverse().map((l): [string, number] => [XLSX_LABEL[l], count(l)]),
  ];
  info.addRow(["SISTEMA DE ALARMAS — EXPORTACIÓN"]).font = { bold: true, size: 13 };
  info.addRow([]);
  for (const [k, v] of lines) {
    const row = info.addRow([k, v]);
    row.getCell(1).font = { bold: true };
    row.eachCell((c) => {
      c.border = BORDERS;
      c.alignment = { vertical: "middle", horizontal: "left" };
    });
    const lvl = LEVELS.find((l) => XLSX_LABEL[l] === k);
    if (lvl) row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LEVEL_FILL[lvl].bg } };
    if (lvl) row.getCell(1).font = { bold: true, color: { argb: LEVEL_FILL[lvl].fg } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  // Revocar inmediatamente cancela la descarga en Safari/Firefox: se da tiempo a que el navegador lea el blob.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
