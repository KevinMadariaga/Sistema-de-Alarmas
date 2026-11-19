"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChartColumn, ChartPie, Globe, LoaderCircle, RefreshCw, ServerCrash } from "lucide-react";
import { fetchDailySummary } from "@/lib/api";
import { DATA_TIME_ZONE, formatHourLabel, wallClockAt, type TimeFormat } from "@/lib/datetime";
import type { DailySummary } from "@/lib/summary";
import { CHART_CATEGORICAL, CHART_OTHER, SURFACE } from "@/lib/theme";
import { Modal } from "./Modal";
import { onRadioKeyDown } from "./radioKeys";

const CHART_TYPES = ["bars", "pie"] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  batchId: number; // lote cargado en el servidor
  timeFormat: TimeFormat;
}

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: DailySummary };

/** Tope "limpio" del eje Y: 1, 2, 5 × 10^k ≥ max. */
function niceMax(max: number): number {
  if (max <= 4) return Math.max(1, max);
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= max)!;
}

// Paleta categórica (skill dataviz, validada) centralizada en lib/theme.ts. "Otras" en gris neutro.
const PIE_COLORS = CHART_CATEGORICAL;
const OTHER_COLOR = CHART_OTHER;
const MAX_SLICES = 5;

type Slice = { label: string; count: number; color: string };

/** Top 5 franjas por cantidad (en orden horario) + "Otras" con el resto. */
function buildSlices(hours: DailySummary["hours"], label: (h: number) => string): Slice[] {
  const withData = hours.filter((h) => h.count > 0);
  const top = [...withData].sort((a, b) => b.count - a.count || a.hour - b.hour).slice(0, MAX_SLICES).sort((a, b) => a.hour - b.hour);
  const slices: Slice[] = top.map((h, i) => ({ label: label(h.hour), count: h.count, color: PIE_COLORS[i] }));
  const rest = withData.filter((h) => !top.includes(h)).reduce((n, h) => n + h.count, 0);
  if (rest) slices.push({ label: `Otras (${withData.length - top.length} franjas)`, count: rest, color: OTHER_COLOR });
  return slices;
}

function PieChart({ slices, total }: { slices: Slice[]; total: number }) {
  const [hover, setHover] = useState<string | null>(null); // porción resaltada (gráfico ↔ leyenda)
  const R = 90;
  const C = 100;
  let angle = -Math.PI / 2; // empieza arriba, sentido horario
  const point = (a: number) => `${C + R * Math.cos(a)} ${C + R * Math.sin(a)}`;
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
      <svg viewBox="0 0 200 200" className="size-52 shrink-0" role="img" aria-label="Distribución de alarmas por franja horaria">
        {slices.length === 1 ? (
          <circle cx={C} cy={C} r={R} fill={slices[0].color}>
            <title>{`${slices[0].label}: ${slices[0].count}`}</title>
          </circle>
        ) : (
          slices.map((s) => {
            const sweep = (s.count / total) * Math.PI * 2;
            const start = angle;
            angle += sweep;
            return (
              <path
                key={s.label}
                d={`M ${C} ${C} L ${point(start)} A ${R} ${R} 0 ${sweep > Math.PI ? 1 : 0} 1 ${point(angle)} Z`}
                fill={s.color}
                stroke={SURFACE}
                strokeWidth={2} // separación de 2 px entre porciones
                strokeLinejoin="round"
                opacity={hover && hover !== s.label ? 0.35 : 1}
                onMouseEnter={() => setHover(s.label)}
                onMouseLeave={() => setHover(null)}
                className="transition-opacity motion-reduce:transition-none"
              >
                <title>{`${s.label}: ${s.count} (${Math.round((s.count / total) * 100)}%)`}</title>
              </path>
            );
          })
        )}
      </svg>
      {/* Leyenda con valores: la identidad nunca depende solo del color */}
      <ul className="w-full max-w-xs space-y-1.5 text-sm">
        {slices.map((s) => (
          <li
            key={s.label}
            onMouseEnter={() => setHover(s.label)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors ${hover === s.label ? "bg-slate-100" : ""}`}
          >
            <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
            <span className="flex-1 tabular-nums text-slate-700">{s.label}</span>
            <span className="font-semibold tabular-nums text-slate-900">{s.count}</span>
            <span className="w-10 text-right text-xs tabular-nums text-slate-500">{Math.round((s.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function SummaryModal({ open, onClose, batchId, timeFormat }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [chart, setChart] = useState<"bars" | "pie">("bars");

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setState({ status: "loading" });
    fetchDailySummary(batchId, DATA_TIME_ZONE, ctrl.signal) // "hoy" en hora de Colombia, no del navegador
      .then((data) => setState({ status: "ok", data }))
      .catch((e: Error) => e.name !== "AbortError" && setState({ status: "error", message: e.message }));
    return () => ctrl.abort();
  }, [open, batchId, attempt]);

  const data = state.status === "ok" ? state.data : null;
  // Hora actual en Colombia según el reloj del SERVIDOR (generatedAt), no el del navegador.
  const currentHour = data ? wallClockAt(Date.parse(data.generatedAt), data.timeZone).h : -1;

  const stats = useMemo(() => {
    if (!data) return null;
    const peak = data.hours.reduce((a, b) => (b.count > a.count ? b : a));
    const elapsed = currentHour + 1; // franjas transcurridas hoy, incluida la actual
    return { peak, avg: data.total / elapsed, active: data.hours.filter((h) => h.count > 0).length, elapsed };
  }, [data, currentHour]);

  const yMax = niceMax(Math.max(0, ...(data?.hours.map((h) => h.count) ?? [0])));
  const ticks = [yMax, yMax / 2, 0].filter((t, i, a) => Number.isInteger(t) && a.indexOf(t) === i);
  const hourLabel = (h: number) => formatHourLabel(h, timeFormat);
  const hourRange = (h: number) => `${hourLabel(h)} – ${formatHourLabel((h + 1) % 24, timeFormat)}`;
  const rawDate = data ? new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeZone: data.timeZone }).format(new Date(data.generatedAt)) : ""
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1); // "Miércoles, 18 de noviembre de 2026"

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Resumen del día"
    >
      {state.status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
          <LoaderCircle className="size-5 animate-spin" aria-hidden /> Consultando servicio…
        </div>
      )}

      {state.status === "error" && (
        <div className="py-14 text-center">
          <ServerCrash className="mx-auto mb-3 size-10 text-danger-500" />
          <p className="font-medium text-slate-800">No se pudo obtener el resumen</p>
          <p className="mt-1 text-sm text-slate-500">{state.message}</p>
          <button onClick={() => setAttempt((n) => n + 1)} className="btn-secondary mx-auto mt-4">
            <RefreshCw className="size-4" /> Reintentar
          </button>
        </div>
      )}

      {data && stats && (
        <div className="space-y-6">
          {/* 1. Contexto: día y zona horaria */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden /> {dateLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe className="size-4" aria-hidden /> {data.timeZone}
            </span>
          </div>

          {/* 2. KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label="Alarmas creadas hoy" value={data.total.toLocaleString("es-CO")} sub={`${stats.active} de ${stats.elapsed} franjas con actividad`} />
            <StatTile
              label="Hora pico"
              value={stats.peak.count ? hourLabel(stats.peak.hour) : "—"}
              sub={stats.peak.count ? `${stats.peak.count} alarma${stats.peak.count === 1 ? "" : "s"}` : "Sin alarmas"}
            />
            <StatTile label="Promedio por hora" value={stats.avg.toLocaleString("es-CO", { maximumFractionDigits: 1 })} sub="Hasta la hora actual" />
          </div>

          {/* 3. Gráfico: alarmas creadas por hora (una serie → un color, sin leyenda) */}
          <figure aria-labelledby="chart-title">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <figcaption id="chart-title" className="text-sm font-semibold text-slate-900">
                Alarmas creadas por hora
              </figcaption>
              {data.total > 0 && (
                <div role="radiogroup" aria-label="Tipo de gráfico" className="inline-flex rounded-lg bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200">
                  {(
                    [
                      ["bars", "Barras", ChartColumn],
                      ["pie", "Torta", ChartPie],
                    ] as const
                  ).map(([k, label, Icon]) => (
                    <button
                      key={k}
                      role="radio"
                      aria-checked={chart === k}
                      tabIndex={chart === k ? 0 : -1}
                      onClick={() => setChart(k)}
                      onKeyDown={(e) => onRadioKeyDown(e, CHART_TYPES, chart, setChart)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                        chart === k ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <Icon className="size-3.5" aria-hidden /> {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {data.total > 0 && chart === "pie" ? (
              <PieChart slices={buildSlices(data.hours, hourRange)} total={data.total} />
            ) : data.total === 0 ? (
              <p className="rounded-xl bg-slate-50 py-12 text-center text-sm text-slate-500 ring-1 ring-slate-200">Ninguna alarma del documento tiene FECHA_CREACION de hoy.</p>
            ) : (
              // pt-5: espacio para la etiqueta de la hora pico (si no, desborda y crea scroll)
              <div className="overflow-x-auto pt-5">
                <div className="grid min-w-[620px] grid-cols-[2rem_1fr] gap-x-2">
                  {/* Eje Y */}
                  <div className="relative h-52 text-right text-[11px] tabular-nums text-slate-500">
                    {ticks.map((t) => (
                      <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / yMax) * 100}%` }}>
                        {t}
                      </span>
                    ))}
                  </div>

                  {/* Barras + líneas de guía finas */}
                  <div className="relative h-52">
                    {ticks.map((t) => (
                      <div key={t} className={`absolute inset-x-0 h-px ${t === 0 ? "bg-slate-300" : "bg-slate-100"}`} style={{ top: `${100 - (t / yMax) * 100}%` }} />
                    ))}
                    {/* Visual: el detalle accesible está en la lista "Detalle por franja" (evita 24 paradas de Tab). */}
                    <div className="absolute inset-0 flex items-end gap-0.5" aria-hidden="true">
                      {data.hours.map((h) => {
                        const isPeak = h.count > 0 && h.hour === stats.peak.hour;
                        const future = h.hour > currentHour;
                        return (
                          <div key={h.hour} className="group relative flex h-full flex-1 items-end justify-center">
                            {/* Tooltip dentro del área del gráfico: si saliera por arriba o por los lados, el contenedor
                                con overflow-x crearía una barra de desplazamiento y el gráfico "saltaría". */}
                            <span
                              className={`pointer-events-none absolute top-0 z-10 hidden whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block ${
                                h.hour < 3 ? "left-0" : h.hour > 20 ? "right-0" : "left-1/2 -translate-x-1/2"
                              }`}
                            >
                              <span className="block text-slate-300">{hourRange(h.hour)}</span>
                              <span className="font-semibold">
                                {h.count} alarma{h.count === 1 ? "" : "s"}
                              </span>
                            </span>
                            {/* Etiqueta solo en la hora pico */}
                            {isPeak && (
                              <span className="absolute text-[11px] font-semibold text-slate-700" style={{ bottom: `calc(${(h.count / yMax) * 100}% + 4px)` }}>
                                {h.count}
                              </span>
                            )}
                            <div
                              className={`w-full max-w-6 rounded-t transition-colors ${
                                h.count ? "bg-brand-500 group-hover:bg-brand-600" : future ? "" : "bg-slate-200"
                              }`}
                              style={{ height: h.count ? `${(h.count / yMax) * 100}%` : future ? 0 : "2px" }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Eje X: cada 3 h + marca de la hora actual */}
                  <div />
                  <div className="flex gap-0.5 pt-2">
                    {data.hours.map((h) => (
                      <span
                        key={h.hour}
                        className={`flex-1 text-center text-[10px] tabular-nums ${h.hour === currentHour ? "font-bold text-slate-900" : "text-slate-500"}`}
                      >
                        {h.hour === currentHour ? "Ahora" : h.hour % 3 === 0 ? hourLabel(h.hour).replace(":00", "") : ""}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </figure>

          {/* 4. Detalle por franja (vista de tabla) */}
          {data.total > 0 && (
            <section aria-labelledby="detail-title">
              <h3 id="detail-title" className="mb-2 text-sm font-semibold text-slate-900">
                Detalle por franja
              </h3>
              <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {data.hours
                  .filter((h) => h.count > 0)
                  .map((h) => (
                    <li key={h.hour} className="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-slate-200">
                      <span className="tabular-nums text-slate-600">{hourLabel(h.hour)}</span>
                      <span className="font-semibold tabular-nums text-slate-900">{h.count}</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
