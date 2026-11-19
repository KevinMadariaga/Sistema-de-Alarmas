"use client";
import { ArrowRight, Info } from "lucide-react";
import { docDate, docTime, type FormatGroup } from "@/lib/datetime";

/**
 * Ícono ⓘ junto al selector de hora: al pasar el mouse (o enfocarlo con Tab) muestra en qué formato viene
 * FECHA_CREACION en el documento y cómo se ve convertida a estándar AM/PM. Reemplaza la ventana que salía al cargar.
 */
export function DateFormatInfo({ groups }: { groups: FormatGroup[] }) {
  if (!groups.length) return null;
  const total = groups.reduce((n, g) => n + g.count, 0);
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="Formato de hora del documento"
        aria-describedby="formato-hora"
        className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <Info className="size-4" aria-hidden />
      </button>
      <span
        id="formato-hora"
        role="tooltip"
        className="invisible absolute right-0 top-full z-30 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg bg-white p-4 text-left opacity-0 shadow-xl ring-1 ring-slate-200 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 motion-reduce:transition-none"
      >
        <span className="block text-sm font-semibold text-slate-900">Formato de hora del documento</span>
        <span className="mt-1 block text-xs text-slate-500">FECHA_CREACION se muestra en estándar AM/PM. Cambia a 24 h con el selector “Hora”.</span>
        <span className="mt-3 grid gap-2">
          {groups.map((g) => (
            <span key={g.format} className="block rounded-md bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
              <span className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-800">{g.format}</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {g.count} de {total}
                </span>
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">{g.example}</code>
                <ArrowRight className="size-3.5 text-slate-500" aria-hidden />
                <span className="font-semibold tabular-nums text-ok-800">
                  {docDate(g.example)} {docTime(g.example, "12h")}
                </span>
              </span>
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
