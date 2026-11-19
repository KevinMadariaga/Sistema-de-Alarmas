"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, BarChart3, CircleCheck, Clock, Eye, FileSpreadsheet, FileText, FileUp, Filter, FolderOpen, LoaderCircle, RefreshCw, Search, ServerCrash, TriangleAlert, Upload, X } from "lucide-react";
import { useAlarmPage, useAlarms } from "@/hooks/useAlarms";
import { LEVEL_LABEL } from "@/lib/alarms";
import { PAGE_SIZE, type LevelFilter as LevelFilterValue, type SortPreset } from "@/lib/alarmsQuery";
import { fetchAlarmPage } from "@/lib/api";
import { isAllowedFile } from "@/lib/csv";
import { formatTime, wallClockAt, type TimeFormat } from "@/lib/datetime";
import { exportToExcel } from "@/lib/export";
import { AlarmTable } from "@/components/AlarmTable";
import { InvalidRowsModal } from "@/components/InvalidRowsModal";
import { DateFormatInfo } from "@/components/DateFormatInfo";
import { UploadModal } from "@/components/UploadModal";
import { CsvIssueModal } from "@/components/CsvIssueModal";
import { LEVEL_STYLE } from "@/components/LevelBadge";
import { SummaryModal } from "@/components/SummaryModal";
import { MenuSelect } from "@/components/MenuSelect";
import { TimeFormatSwitch } from "@/components/TimeFormatSwitch";

// Opciones del filtro "Distintivo": la regla de cada nivel va como segunda línea.
const LEVEL_FILTERS: { value: LevelFilterValue; label: string; hint?: string; swatch: string }[] = [
  { value: "ALL", label: "Todos", swatch: "bg-slate-400" },
  { value: "CRITICO", label: "Crítico", hint: "Más de 24 horas activa", swatch: LEVEL_STYLE.CRITICO.swatch },
  { value: "WARN", label: "Warn", hint: "Más de 1 hora y hasta 24 horas activa", swatch: LEVEL_STYLE.WARN.swatch },
  { value: "NORMAL", label: "Normal", swatch: LEVEL_STYLE.NORMAL.swatch },
];

// Opciones del selector "Ordenar" (el orden lo aplica el servidor: ver SORTS en lib/alarmsQuery.ts).
const SORT_OPTIONS: { value: SortPreset; label: string }[] = [
  { value: "level", label: "Distintivo (Crítico → Normal)" },
  { value: "recent", label: "Hora más reciente primero" },
  { value: "oldest", label: "Hora más antigua primero" },
];

export default function Home() {
  const { data, uploading, uploaded, uploadError, retryUpload, pending, load, convertPending, dismissPending, rejectFile } = useAlarms();
  const [filter, setFilter] = useState<LevelFilterValue>("ALL");
  const [sort, setSort] = useState<SortPreset>("level"); // críticos primero
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState(""); // ID, municipio o departamento
  const [debouncedQuery, setDebouncedQuery] = useState(""); // se envía al servidor 300 ms después de dejar de escribir
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [invalidOpen, setInvalidOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false); // modal "Cambiar archivo"
  const [modalFile, setModalFile] = useState<File | null>(null); // archivo elegido dentro de esa modal
  const [timeFormat, setTimeFormat] = useState<TimeFormat>("12h"); // AM/PM por defecto
  const [staged, setStaged] = useState<File | null>(null); // archivo elegido/soltado, pendiente de "Cargar"
  const [dragging, setDragging] = useState(false);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Solo la página visible (10 filas) llega del servidor, ya filtrada, buscada y ordenada.
  const pageQuery = { level: filter, q: debouncedQuery, sort, page, size: PAGE_SIZE };
  const { result, loading: pageLoading, error: pageError, retry: retryPage } = useAlarmPage(data?.batchId ?? null, uploaded, pageQuery);
  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;
  const counts = result?.counts ?? { ALL: data?.total ?? 0, NORMAL: 0, WARN: 0, CRITICO: 0 };
  const now = result ? Date.parse(result.classifiedAt) : null;
  const error = uploadError ?? pageError;

  // Si al reclasificar una página quedó vacía (alarmas que cambiaron de nivel), volver a la última que exista.
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => {
    if (result && page > lastPage) setPage(lastPage);
  }, [result, page, lastPage]);

  /** Solo .csv: cualquier otra extensión abre el modal "archivo no permitido". */
  const stage = (file?: File | null) => {
    if (!file) return;
    if (!isAllowedFile(file.name)) return rejectFile(file.name);
    setStaged(file);
  };

  const onFile = async (file?: File) => {
    if (!file || loadingFile) return;
    if (!isAllowedFile(file.name)) {
      rejectFile(file.name);
      return;
    }
    setLoadingFile(file.name);
    try {
      // Tiempo mínimo visible: evita un parpadeo del loader con archivos pequeños.
      const [text] = await Promise.all([file.text(), new Promise((r) => setTimeout(r, 600))]);
      load(file.name, text);
      setStaged(null);
      // Archivo nuevo → vista limpia (los filtros del anterior no aplican).
      setFilter("ALL");
      setQuery("");
      setDebouncedQuery("");
      setSort("level");
      setPage(1);
      setTimeFormat("12h"); // cada archivo se muestra en estándar AM/PM (ver ícono ⓘ junto a "Hora")
    } catch {
      // El archivo se movió, borró o perdió permisos después de elegirlo.
      setToast({ ok: false, text: `No se pudo leer "${file.name}". Vuelve a seleccionarlo.` });
    } finally {
      setLoadingFile(null);
    }
  };

  // Arrastrar y soltar en TODA la ventana: evita que el navegador abra el archivo si cae fuera del recuadro.
  // Sin datos → queda listo para "Cargar"; con datos → pide confirmar el reemplazo.
  const dropRef = useRef<(f: File) => void>(() => {});
  useEffect(() => {
    dropRef.current = data ? requestReplace : stage;
  });
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false); // salió de la ventana
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) dropRef.current(file);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  /** Con datos cargados, un archivo nuevo (elegido o soltado) abre la modal "Cambiar archivo" para confirmarlo. */
  const requestReplace = (file: File | null) => {
    setModalFile(file);
    setUploadOpen(true);
  };

  const filterLabel = `${filter === "ALL" ? "Todos los niveles" : LEVEL_LABEL[filter]}${debouncedQuery ? ` · búsqueda "${debouncedQuery}"` : ""}`;

  const onExport = async () => {
    if (!data?.batchId) return;
    const batchId = data.batchId;
    setExporting(true);
    try {
      // El Excel lleva TODAS las filas del filtro actual: se piden al servidor solo al exportar (size 0).
      const all = await fetchAlarmPage(batchId, { ...pageQuery, page: 1, size: 0 });
      // Nombre con la hora de Colombia del servidor (la misma que "Generado" dentro del archivo).
      const w = wallClockAt(Date.parse(all.classifiedAt));
      const p2 = (n: number) => String(n).padStart(2, "0");
      const name = `alarmas_${filter.toLowerCase()}_${w.y}-${p2(w.mo)}-${p2(w.d)}_${p2(w.h)}-${p2(w.mi)}.xlsx`;
      await exportToExcel(all.rows, name, filterLabel, timeFormat, Date.parse(all.classifiedAt)); // hora del servidor
      setToast({ ok: true, text: `Excel descargado: ${name} (${all.rows.length} ${all.rows.length === 1 ? "fila" : "filas"})` });
    } catch (e) {
      setToast({ ok: false, text: `No se pudo generar el Excel: ${(e as Error).message}. Inténtalo de nuevo.` });
    } finally {
      setExporting(false);
    }
  };

  // El aviso se oculta solo a los 5 s.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <div className="min-h-dvh bg-slate-100">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-brand-700 focus:shadow-lg">
        Saltar al contenido
      </a>
      <h1 className="sr-only">Sistema de Alarmas</h1>

      <main id="contenido" className="mx-auto max-w-[1680px] space-y-5 px-4 py-6 sm:px-6">
        {!data ? (
          // Sin archivo: solo la tarjeta de carga, centrada en ambos ejes (alto de pantalla menos el padding de <main>).
          <div className="grid min-h-[calc(100dvh-3rem)] place-items-center">
              {/* Tarjeta de panel (estilo AdminLTE): cabecera, área de arrastre y acciones en el pie */}
              <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">
                  <FileText className="size-4 text-brand-600" aria-hidden />
                  Cargar documento de alarmas
                  <span className="ml-auto rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200">.csv</span>
                </div>
                <div className="p-4">
                  <div
                    className={`grid min-h-40 place-items-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
                      dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50"
                    }`}
                  >
                    {dragging ? (
                      <p className="font-semibold text-brand-700">Suelta el archivo para agregarlo</p>
                    ) : staged ? (
                      <div className="flex max-w-full flex-col items-center gap-2">
                        <span className="inline-flex max-w-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-200">
                          <FileSpreadsheet className="size-4 shrink-0 text-ok-600" aria-hidden />
                          <span className="min-w-0 truncate">{staged.name}</span>
                          <span className="shrink-0 text-xs text-slate-500">{(staged.size / 1024).toFixed(1)} KB</span>
                          <button onClick={() => setStaged(null)} aria-label="Quitar archivo" className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                            <X className="size-4" />
                          </button>
                        </span>
                        <span className="text-xs text-slate-500">Listo para cargar</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="size-8 text-slate-400" aria-hidden />
                        <p className="text-sm text-slate-700">
                          <strong className="font-semibold text-slate-900">Arrastra el CSV aquí</strong> o usa el botón
                        </p>
                        <p className="text-xs text-slate-500">Solo archivos .csv</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    id="csv-stage"
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      stage(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  {staged ? (
                    <button onClick={() => onFile(staged)} disabled={!!loadingFile} className="btn-primary py-1.5 text-xs">
                      <Upload className="size-4" aria-hidden /> Cargar
                    </button>
                  ) : (
                    <label htmlFor="csv-stage" className="btn-primary cursor-pointer py-1.5 text-xs">
                      <FolderOpen className="size-4" aria-hidden /> Seleccionar archivo
                    </label>
                  )}
                </div>
              </div>
          </div>
        ) : (
          <>
            {/* Contexto: archivo cargado + reloj de cálculo */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-200">
                <FileSpreadsheet className="size-4 text-ok-600" /> {data.fileName}
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-500" title="La duración se recalcula cada minuto">
                <Clock className="size-4" /> Duración calculada a las{" "}
                <strong className="tabular-nums text-slate-700">{now === null ? "…" : formatTime(now, timeFormat, false)}</strong>
              </span>
              {/* Acciones dentro de la página (antes en la barra superior) */}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button onClick={() => requestReplace(null)} className="btn-secondary">
                  <Upload className="size-4" aria-hidden /> Cambiar archivo
                </button>
                <button onClick={() => setSummaryOpen(true)} disabled={!uploaded} className="btn-secondary">
                  <BarChart3 className="size-4" aria-hidden /> Resumen del día
                </button>
                <button onClick={onExport} disabled={!total || exporting} className="btn-excel">
                  {exporting ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="size-4" aria-hidden />}
                  {exporting ? "Exportando…" : "Exportar Excel"}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger-300 bg-danger-50 px-4 py-3 text-sm text-danger-800">
                <ServerCrash className="size-5 shrink-0" />
                <span className="flex-1">
                  <strong>{error}</strong>
                </span>
                <button onClick={uploadError ? retryUpload : retryPage} className="btn-secondary">
                  <RefreshCw className="size-4" /> Reintentar
                </button>
              </div>
            )}

            {data.skipped.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn-300 bg-warn-50 px-4 py-3 text-sm text-warn-900">
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 font-medium">{data.skipped.length === 1 ? "1 fila omitida" : `${data.skipped.length} filas omitidas`} por datos inválidos</span>
                <button onClick={() => setInvalidOpen(true)} className="btn-secondary">
                  <Eye className="size-4" /> Ver detalle
                </button>
              </div>
            )}

            {/* Panel de la tabla: título + herramientas + tabla. Sin overflow-hidden: los menús y el panel ⓘ no se recortan. */}
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-3">
                <div>
                  <h2 className="font-semibold text-slate-900">Alarmas</h2>
                  <p className="text-xs text-slate-500">
                    {total.toLocaleString("es-CO")} de {counts.ALL.toLocaleString("es-CO")} · {filterLabel}
                  </p>
                </div>
                {/* Controles en su propia fila bajo el título: buscador de ancho fijo (completo en móvil). */}
                <div className="flex flex-wrap items-center gap-3">
                <label className="relative w-full sm:mr-auto sm:w-80">
                  <span className="sr-only">Buscar por ID, municipio o departamento</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input
                    type="search"
                    name="buscar-alarma"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Buscar ID, municipio o departamento…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:font-sans placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </label>
                {/* Filtro por distintivo (reemplaza las tarjetas grandes) */}
                <MenuSelect
                  label="Distintivo"
                  icon={Filter}
                  ariaLabel="Filtrar por distintivo"
                  value={filter}
                  options={LEVEL_FILTERS.map((o) => ({ ...o, count: counts[o.value] }))}
                  onChange={(v) => {
                    setFilter(v as LevelFilterValue);
                    setPage(1);
                  }}
                />
                <MenuSelect
                  label="Ordenar"
                  icon={ArrowDownUp}
                  ariaLabel="Ordenar alarmas"
                  value={sort}
                  options={SORT_OPTIONS}
                  onChange={(v) => {
                    setSort(v as SortPreset);
                    setPage(1);
                  }}
                />
                <span className="inline-flex items-center gap-1">
                  <TimeFormatSwitch value={timeFormat} onChange={setTimeFormat} />
                  {/* Formato de hora del documento (antes en una ventana al cargar) */}
                  <DateFormatInfo groups={data.formatGroups} />
                </span>
                </div>
              </div>
              <AlarmTable rows={rows} total={total} page={page} pageSize={PAGE_SIZE} loading={pageLoading || !result} onPage={setPage} timeFormat={timeFormat} />
            </section>
          </>
        )}
      </main>

      {(loadingFile || uploading) && (
        <div role="status" aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 backdrop-blur-sm">
          <div className="flex w-[calc(100%-2rem)] max-w-sm flex-col items-center gap-3 rounded-2xl bg-white px-8 py-7 text-center shadow-2xl">
            <LoaderCircle className="size-10 animate-spin text-brand-600" aria-hidden />
            <p className="font-semibold text-slate-900">{loadingFile ? "Cargando archivo…" : "Subiendo y clasificando alarmas…"}</p>
            <p className="max-w-full truncate text-sm text-slate-500">{loadingFile ?? data?.fileName}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-1/3 animate-[loader_1s_ease-in-out_infinite] rounded-full motion-reduce:animate-none bg-brand-500" />
            </div>
          </div>
        </div>
      )}

      {dragging && data && !uploadOpen && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-brand-600/10 ring-4 ring-inset ring-brand-500">
          <p className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-brand-700 shadow-lg">
            <FileUp className="size-5" /> Suelta el archivo para cargarlo
          </p>
        </div>
      )}

      {data && <InvalidRowsModal open={invalidOpen} onClose={() => setInvalidOpen(false)} rows={data.skipped} fileName={data.fileName} />}
      {/* Confirmación de exportación (región viva: los lectores de pantalla la anuncian) */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {toast && (
          <p
            className={`pointer-events-auto inline-flex max-w-xl items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 ${
              toast.ok ? "bg-slate-900 text-white ring-slate-800" : "bg-danger-50 text-danger-800 ring-danger-200"
            }`}
          >
            {toast.ok ? <CircleCheck className="size-4 shrink-0 text-ok-400" aria-hidden /> : <ServerCrash className="size-4 shrink-0" aria-hidden />}
            <span className="min-w-0 break-all">{toast.text}</span>
            <button onClick={() => setToast(null)} aria-label="Cerrar aviso" className="ml-1 rounded p-1 opacity-70 hover:opacity-100">
              <X className="size-4" />
            </button>
          </p>
        )}
      </div>

      {data && (
        <UploadModal
          open={uploadOpen}
          onClose={() => {
            setUploadOpen(false);
            setModalFile(null);
          }}
          currentFile={data.fileName}
          file={modalFile}
          onFile={setModalFile}
          onLoad={(f) => {
            setUploadOpen(false);
            setModalFile(null);
            onFile(f);
          }}
        />
      )}
      <CsvIssueModal pending={pending} onClose={dismissPending} onConvert={convertPending} onPickFile={(f) => (data ? requestReplace(f) : stage(f))} />
      {data?.batchId != null && <SummaryModal open={summaryOpen} onClose={() => setSummaryOpen(false)} batchId={data.batchId} timeFormat={timeFormat} />}
    </div>
  );
}
