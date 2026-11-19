"use client";
import { LoaderCircle, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { isAvailable, type ClassifiedAlarm } from "@/lib/alarms";
import { docDate, docTime, formatDuration, type TimeFormat } from "@/lib/datetime";
import { LevelBadge } from "./LevelBadge";

interface Props {
  rows: ClassifiedAlarm[]; // SOLO la página actual, ya filtrada y ordenada por el servidor
  total: number; // filas que cumplen el filtro (todas las páginas)
  page: number;
  pageSize: number;
  loading: boolean; // pidiendo la página al servidor
  onPage: (p: number) => void;
  timeFormat: TimeFormat;
}

/** Valor de tecnología tal cual (negativos incluidos), en negro y sin resaltar; vacío → "—". */
function TechCell({ v }: { v: number | null }) {
  return (
    <td className="tabular-nums" title={isAvailable(v) ? undefined : `No disponible (${v ?? "vacío"})`}>
      {v ?? "—"}
    </td>
  );
}

const PAGE_BLOCK = 10; // números de página visibles a la vez

/** Números de página en bloques de 10 (1–10, 11–20…), con la primera/última y "…" si hay más bloques. */
export function pageList(current: number, pages: number): (number | "…")[] {
  const start = Math.floor((current - 1) / PAGE_BLOCK) * PAGE_BLOCK + 1;
  const end = Math.min(start + PAGE_BLOCK - 1, pages);
  const out: (number | "…")[] = [];
  if (start > 1) out.push(1, "…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < pages) out.push("…", pages);
  return out;
}

export function AlarmTable({ rows, total, page, pageSize, loading, onPage, timeFormat }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const visible = rows;
  const from = total ? (current - 1) * pageSize + 1 : 0;

  return (
    <div>
      <div className="overflow-x-auto">
        {/* Mismo padding en X e Y para th y td: celdas simétricas y contenido centrado. */}
        <table className="w-full min-w-[1080px] text-center align-middle text-sm [&_td]:px-3 [&_td]:py-3 [&_th]:px-3 [&_th]:py-3 [&_td]:align-middle">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold tracking-wide text-slate-900">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-slate-50">DISTINTIVO</th>
              <th scope="col">ID ALARMA</th>
              <th scope="col">2G</th>
              <th scope="col">3G</th>
              <th scope="col">4G</th>
              <th scope="col">FECHA</th>
              <th scope="col">HORA ({timeFormat === "12h" ? "AM/PM" : "24 H"})</th>
              <th scope="col">DURACIÓN ACUMULADA</th>
              <th scope="col" className="text-left">MUNICIPIO</th>
              <th scope="col" className="text-left">DEPARTAMENTO</th>
              <th scope="col">NOTIFICADA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-900">
            {visible.length === 0 && (
              <tr>
                <td colSpan={11} className="py-14 text-slate-500">
                  {loading ? (
                    <LoaderCircle className="mx-auto mb-2 size-8 animate-spin text-brand-500" aria-hidden />
                  ) : (
                    <Inbox className="mx-auto mb-2 size-8" aria-hidden />
                  )}
                  {loading ? "Cargando alarmas…" : "No hay registros para este filtro."}
                </td>
              </tr>
            )}
            {visible.map((r, i) => {
              // Estilo T1 (AdminLTE): filas alternas y resaltado de marca al pasar el mouse.
              const zebra = i % 2 ? "bg-slate-50" : "bg-white";
              return (
                <tr key={`${r.id}-${from + i}`} className={`group transition-colors ${zebra} hover:bg-brand-50`}>
                  {/* Columna fija al desplazar horizontalmente (móvil): el nivel nunca sale de vista */}
                  <td className={`sticky left-0 z-10 transition-colors shadow-[1px_0_0_0_var(--color-slate-200)] ${zebra} group-hover:bg-brand-50`}>
                    <LevelBadge level={r.level} title={r.reason} />
                  </td>
                  <td className="font-mono text-xs">{r.id}</td>
                  <TechCell v={r.g2} />
                  <TechCell v={r.g3} />
                  <TechCell v={r.g4} />
                  {/* Original exacto del documento en el tooltip. */}
                  <td className="whitespace-nowrap tabular-nums" title={`Original: ${r.createdRaw}`}>
                    {docDate(r.createdRaw)}
                  </td>
                  {/* Cambia con el selector 12 h / 24 h. */}
                  <td className="whitespace-nowrap tabular-nums">{docTime(r.createdRaw, timeFormat)}</td>
                  <td className="whitespace-nowrap tabular-nums">{formatDuration(r.durationMs)}</td>
                  {/* Texto alineado a la izquierda: los nombres quedan en columna; el icono, fijo al inicio. */}
                  <td className="whitespace-nowrap text-left">{r.municipio}</td>
                  <td className="whitespace-nowrap text-left">{r.departamento}</td>
                  <td>
                    <span title={r.notificada === "S" ? "Ya notificada" : "No notificada"}>{r.notificada || "—"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-500">
        <span>
          Mostrando <strong className="text-slate-800">{from}</strong>–<strong className="text-slate-800">{Math.min(current * pageSize, total)}</strong> de{" "}
          <strong className="text-slate-800">{total.toLocaleString("es-CO")}</strong>
          {loading && <LoaderCircle className="ml-2 inline size-3.5 animate-spin text-slate-500" aria-label="Actualizando" />}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <button onClick={() => onPage(current - 1)} disabled={current <= 1} aria-label="Página anterior" className="btn-icon">
            <ChevronLeft className="size-4" />
          </button>
          {pageList(current, pages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1 text-slate-400" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p)}
                aria-label={`Página ${p}`}
                aria-current={p === current ? "page" : undefined}
                className={`min-w-8 rounded-md px-2 py-1 text-sm tabular-nums ring-1 transition-colors ${
                  p === current ? "bg-brand-600 font-semibold text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-100"
                }`}
              >
                {p}
              </button>
            ),
          )}
          <button onClick={() => onPage(current + 1)} disabled={current >= pages} aria-label="Página siguiente" className="btn-icon">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </nav>
    </div>
  );
}
