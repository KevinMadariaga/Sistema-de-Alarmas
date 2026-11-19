"use client";
import { useState } from "react";
import { FileSpreadsheet, FileUp, FolderOpen, Upload, X } from "lucide-react";
import { isAllowedFile } from "@/lib/csv";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  currentFile: string;
  /** Archivo elegido o soltado (lo maneja la página: también llega por arrastrar a la ventana). */
  file: File | null;
  onFile: (f: File | null) => void;
  onLoad: (f: File) => void;
}

/** Modal "Cambiar archivo": elegir o soltar un CSV nuevo y cargarlo en lugar del actual. */
export function UploadModal({ open, onClose, currentFile, file, onFile, onLoad }: Props) {
  const [dragging, setDragging] = useState(false);
  const invalid = file && !isAllowedFile(file.name);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Cambiar archivo"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button onClick={() => file && onLoad(file)} disabled={!file || !!invalid} className="btn-primary">
            <Upload className="size-4" aria-hidden /> Cargar archivo
          </button>
        </>
      }
    >
      <p className="text-center text-sm text-slate-600">
        Archivo actual: <span className="font-medium text-slate-900">{currentFile}</span>. Al cargar uno nuevo, la tabla se reemplaza.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); // sin stopPropagation: la página también debe enterarse para apagar su aviso de arrastre
          setDragging(false);
          onFile(e.dataTransfer.files[0] ?? null);
        }}
        className={`mt-4 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50"
        }`}
      >
        <FileUp className={`mx-auto size-10 ${dragging ? "text-brand-600" : "text-brand-500"}`} aria-hidden />
        <p className="mt-3 font-semibold text-slate-900">{dragging ? "Suelta el archivo aquí" : "Arrastra el nuevo CSV aquí, o"}</p>

        {file ? (
          <div className="mt-4 flex flex-col items-center gap-2">
            <span
              className={`inline-flex max-w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ring-1 ${
                invalid ? "bg-danger-50 text-danger-800 ring-danger-200" : "bg-white text-slate-800 ring-slate-200"
              }`}
            >
              <FileSpreadsheet className={`size-4 shrink-0 ${invalid ? "text-danger-600" : "text-ok-600"}`} aria-hidden />
              <span className="min-w-0 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</span>
              <button onClick={() => onFile(null)} aria-label="Quitar archivo elegido" className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700">
                <X className="size-4" />
              </button>
            </span>
            {invalid && (
              <p role="alert" className="text-sm text-danger-700">
                Archivo no permitido: solo se aceptan archivos .csv. Elige otro.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <input
              id="csv-modal"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                onFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <label htmlFor="csv-modal" className="btn-primary cursor-pointer">
              <FolderOpen className="size-4" aria-hidden /> Seleccionar archivo
            </label>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">Solo archivos .csv</p>
      </div>
    </Modal>
  );
}
