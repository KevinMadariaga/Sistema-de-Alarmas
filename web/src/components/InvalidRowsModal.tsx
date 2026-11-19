"use client";
import { CircleAlert } from "lucide-react";
import type { SkippedRow } from "@/lib/alarms";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  rows: SkippedRow[];
  fileName: string;
}

const RULES = [
  { field: "ID_ALARMA", rule: "Debe ser un número entero (ej. 4659944). No puede estar vacío ni tener letras." },
  {
    field: "FECHA_CREACION",
    rule: "Debe ser una fecha real en un formato reconocido: 09-OCT-26 10.12.56.000000000 PM · 2026-11-18 14:30:00 · 18/11/2026 02:30 PM · ISO con zona.",
  },
];

/** Detalle de las filas que no se cargaron y por qué. */
export function InvalidRowsModal({ open, onClose, rows, fileName }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Filas omitidas (${rows.length})`}
      footer={
        <button onClick={onClose} className="btn-primary">
          Entendido
        </button>
      }
    >
      <p className="text-sm text-slate-600">
        Estas filas de <span className="font-medium text-slate-800">{fileName}</span> no se cargaron en la tabla. Corrígelas en el documento y vuelve a cargarlo.
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-center">Línea</th>
              <th scope="col" className="px-4 py-2.5">Motivo</th>
              <th scope="col" className="px-4 py-2.5">Contenido en el documento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.line} className="align-top">
                <td className="px-4 py-2.5 text-center font-mono text-xs font-semibold tabular-nums text-slate-700">{r.line}</td>
                <td className="px-4 py-2.5 text-slate-800">
                  <span className="inline-flex items-start gap-1.5">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn-600" aria-hidden />
                    {r.reason}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <code className="block max-w-[40rem] overflow-x-auto whitespace-nowrap rounded bg-slate-100 px-2 py-1.5 font-mono text-xs text-slate-700">{r.raw}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 text-sm font-semibold text-slate-900">Reglas de validación</h3>
      <dl className="mt-2 space-y-2 text-sm">
        {RULES.map((r) => (
          <div key={r.field} className="rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
            <dt className="font-mono text-xs font-semibold text-slate-800">{r.field}</dt>
            <dd className="mt-0.5 text-slate-600">{r.rule}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
