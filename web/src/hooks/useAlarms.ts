"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseAlarms, type Alarm, type LoadIssue, type SkippedRow } from "@/lib/alarms";
import type { AlarmPage, PageQuery } from "@/lib/alarmsQuery";
import { fetchAlarmPage, uploadAlarms } from "@/lib/api";
import { convertSeparator, fileExtension } from "@/lib/csv";
import { MINUTE, summarizeFormats, type FormatGroup } from "@/lib/datetime";

// Versiones anteriores guardaban el último CSV en el navegador; ya no (al recargar se vuelve al inicio).
const LEGACY_STORAGE_KEY = "alarmas.csv.v1";

/** Lo que el navegador conserva de un archivo: metadatos, NO las filas (esas viven en el servidor). */
export interface Dataset {
  loadId: number; // identifica la carga en el navegador (aviso de formato, efectos)
  batchId: number | null; // asignado por el SERVIDOR al subir; null mientras se sube
  fileName: string;
  total: number; // filas válidas
  skipped: SkippedRow[];
  formatGroups: FormatGroup[]; // formatos de FECHA_CREACION detectados (ventana al cargar)
}

export interface PendingIssue {
  fileName: string;
  text: string;
  issue: LoadIssue;
}

/**
 * Carga del archivo: el navegador lee y valida el CSV, lo SUBE una vez al backend y suelta las filas.
 * La tabla luego pide páginas de 10 (useAlarmPage).
 */
export function useAlarms() {
  const [data, setData] = useState<Dataset | null>(null);
  const [pending, setPending] = useState<PendingIssue | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false); // el servidor ya tiene el lote → se pueden pedir páginas
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // "Reintentar" la subida
  const toUpload = useRef<Alarm[] | null>(null); // filas pendientes de subir; se sueltan tras el éxito
  const uploadKey = useRef<string | null>(null); // subida en curso o hecha (loadId:intento)

  useEffect(() => {
    if (!data || !toUpload.current) return;
    // Una sola subida por carga (o por reintento). Sin cancelarla al limpiar el efecto: una subida cancelada en el
    // navegador sigue procesándose en el servidor y, si termina después, reemplazaría al lote vigente
    // (pasaba en desarrollo, donde React ejecuta los efectos dos veces).
    const key = `${data.loadId}:${attempt}`;
    if (uploadKey.current === key) return;
    uploadKey.current = key;
    const loadId = data.loadId;
    setUploading(true);
    uploadAlarms(toUpload.current)
      .then((res) => {
        if (uploadKey.current !== key) return; // llegó otro archivo mientras tanto
        toUpload.current = null; // el navegador ya no guarda las filas
        setData((d) => (d && d.loadId === loadId ? { ...d, batchId: res.batchId } : d));
        setUploaded(true);
        setError(null);
      })
      .catch((e: Error) => uploadKey.current === key && setError(`No se pudo subir el archivo: ${e.message}`))
      .finally(() => uploadKey.current === key && setUploading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se sube una vez por archivo (loadId), no al recibir su batchId
  }, [data?.loadId, attempt]);

  const load = useCallback((fileName: string, text: string) => {
    const result = parseAlarms(text);
    if (!result.ok) {
      setPending({ fileName, text, issue: result.issue });
      return;
    }
    setPending(null);
    setError(null); // el error del archivo anterior no aplica al nuevo
    setUploaded(false);
    toUpload.current = result.alarms;
    setData({
      loadId: Date.now(),
      batchId: null,
      fileName,
      total: result.alarms.length,
      skipped: result.skipped,
      formatGroups: summarizeFormats(result.alarms),
    });
  }, []);

  // Sin persistencia: recargar la página vuelve a la pantalla de carga. Se limpia el CSV que guardaban versiones anteriores.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* storage bloqueado */
    }
  }, []);

  const convertPending = useCallback(() => {
    if (pending?.issue.kind !== "separator" || !pending.issue.detected) return;
    load(`${pending.fileName} (convertido a |)`, convertSeparator(pending.text, pending.issue.detected));
  }, [pending, load]);

  return {
    data,
    uploading,
    uploaded,
    uploadError: error,
    retryUpload: () => setAttempt((n) => n + 1),
    pending,
    load,
    convertPending,
    dismissPending: () => setPending(null),
    /** Archivo con extensión no permitida: muestra el modal sin leerlo. */
    rejectFile: (fileName: string) => setPending({ fileName, text: "", issue: { kind: "fileType", extension: fileExtension(fileName) || "(sin extensión)" } }),
  };
}

/**
 * Página actual de la tabla, pedida al servidor (filtro + búsqueda + orden + página).
 * Cada minuto se vuelve a pedir SOLO esta página (la duración crece). Mientras llega la nueva,
 * se mantiene la anterior en pantalla (sin parpadeo).
 */
export function useAlarmPage(batchId: number | null, ready: boolean, query: PageQuery) {
  const [result, setResult] = useState<AlarmPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const reqSeq = useRef(0); // solo la última petición puede apagar inFlight

  useEffect(() => {
    const id = setInterval(() => !inFlight.current && setTick((t) => t + 1), MINUTE);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setResult(null); // otro archivo: no mostrar la página del anterior
  }, [batchId]);

  const { level, q, sort, page, size } = query;
  useEffect(() => {
    if (batchId === null || !ready) return;
    const ctrl = new AbortController();
    const req = ++reqSeq.current;
    inFlight.current = true;
    setLoading(true);
    fetchAlarmPage(batchId, { level, q, sort, page, size }, ctrl.signal)
      .then((r) => {
        setResult(r);
        setError(null);
      })
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message))
      .finally(() => {
        if (req === reqSeq.current) inFlight.current = false;
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [batchId, ready, level, q, sort, page, size, tick, attempt]);

  return { result, loading, error, retry: () => setAttempt((n) => n + 1) };
}
