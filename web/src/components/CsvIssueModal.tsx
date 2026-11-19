"use client";
import { ArrowRight, FolderOpen, Wand2 } from "lucide-react";
import { COLUMNS } from "@/lib/alarms";
import { SEPARATOR_NAMES } from "@/lib/csv";
import type { PendingIssue } from "@/hooks/useAlarms";
import { Modal } from "./Modal";

interface Props {
  pending: PendingIssue | null;
  onClose: () => void;
  onConvert: () => void;
  /** Archivo elegido desde "Elegir otro archivo" (el selector vive DENTRO de la modal: fuera, el navegador lo bloquea). */
  onPickFile: (f: File) => void;
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800">{children}</code>
);

export function CsvIssueModal({ pending, onClose, onConvert, onPickFile }: Props) {
  const issue = pending?.issue;
  const canConvert = issue?.kind === "separator" && issue.detected !== null;
  const wrongFile = issue?.kind === "fileType" || issue?.kind === "binary";
  // Solo la primera línea (sin recorrer todo el archivo en cada render).
  const preview = pending && !wrongFile ? pending.text.replace(/^\uFEFF/, "").slice(0, 400).split(/\r?\n/)[0].slice(0, 160) : "";

  return (
    <Modal
      open={!!pending}
      onClose={onClose}
      size="md"
      title={wrongFile ? "Archivo no permitido" : "No se pudo cargar el documento"}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            {canConvert || wrongFile ? "Cancelar" : "Entendido"}
          </button>
          {wrongFile && (
            <>
              <input
                id="csv-issue-input"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  onClose();
                  onPickFile(f);
                }}
              />
              <label htmlFor="csv-issue-input" className="btn-primary cursor-pointer">
                <FolderOpen className="size-4" aria-hidden /> Elegir otro archivo
              </label>
            </>
          )}
          {canConvert && (
            <button onClick={onConvert} className="btn-primary">
              <Wand2 className="size-4" /> Convertir a “|” y cargar
            </button>
          )}
        </>
      }
    >
      <p className="text-sm text-slate-500">
        Archivo: <span className="font-medium text-slate-700">{pending?.fileName}</span>
      </p>

      {issue?.kind === "fileType" && (
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>
            Los archivos <Code>{issue.extension}</Code> no están permitidos. Solo se aceptan archivos <Code>.csv</Code> separados por <Code>|</Code>.
          </p>
          <p className="text-slate-500">Cámbialo por un archivo CSV e inténtalo de nuevo. Si tienes un Excel, ábrelo y usa “Guardar como → CSV”.</p>
        </div>
      )}

      {issue?.kind === "binary" && (
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>
            El archivo tiene extensión <Code>.csv</Code>, pero su contenido no es texto (parece un Excel, PDF o imagen renombrado).
          </p>
          <p className="text-slate-500">Cámbialo por un CSV real: abre el archivo original y usa “Guardar como → CSV”.</p>
        </div>
      )}

      {issue?.kind === "tooMany" && (
        <p className="mt-3 text-sm">
          El documento tiene <strong>{issue.count.toLocaleString("es-CO")}</strong> filas y el máximo permitido es{" "}
          <strong>{issue.max.toLocaleString("es-CO")}</strong>. Divídelo en archivos más pequeños.
        </p>
      )}

      {issue?.kind === "empty" && <p className="mt-3">El archivo está vacío o no tiene líneas con datos.</p>}

      {issue?.kind === "separator" && (
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>
            El documento debe estar separado por <strong>barra vertical</strong> <Code>|</Code>.{" "}
            {issue.detected ? (
              <>
                Este archivo usa <strong>{SEPARATOR_NAMES[issue.detected]}</strong>, por eso las columnas no se pueden leer.
              </>
            ) : (
              <>No se encontró ningún separador reconocible (| , ; tabulación) en la cabecera.</>
            )}
          </p>
          {canConvert && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 p-3 text-brand-900">
              <Code>{issue.detected === "\t" ? "\\t" : issue.detected}</Code>
              <ArrowRight className="size-4" />
              <Code>|</Code>
              <span>Puedo reescribir el archivo con el separador correcto (se respetan valores entre comillas).</span>
            </div>
          )}
        </div>
      )}

      {issue?.kind === "columns" && (
        <div className="mt-3 space-y-3 text-sm">
          <p>El separador es correcto, pero faltan columnas obligatorias:</p>
          <div className="flex flex-wrap gap-1.5">
            {issue.missing.map((c) => (
              <span key={c} className="rounded-md bg-danger-50 px-2 py-0.5 font-mono text-xs font-semibold text-danger-700 ring-1 ring-danger-200">
                {c}
              </span>
            ))}
          </div>
          <p className="text-slate-500">
            Esperadas: <Code>{COLUMNS.join("|")}</Code>
          </p>
        </div>
      )}

      {preview && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Cabecera leída</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">{preview}</pre>
        </div>
      )}
    </Modal>
  );
}
