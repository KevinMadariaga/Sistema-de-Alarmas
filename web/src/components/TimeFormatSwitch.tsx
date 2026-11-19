import { Clock3 } from "lucide-react";
import type { TimeFormat } from "@/lib/datetime";
import { onRadioKeyDown } from "./radioKeys";

const OPTIONS: { value: TimeFormat; label: string; aria: string }[] = [
  { value: "12h", label: "12 h", aria: "12 horas, AM/PM" },
  { value: "24h", label: "24 h", aria: "24 horas, militar" },
];

const VALUES = OPTIONS.map((o) => o.value);

/** Control segmentado con indicador deslizante para el formato de hora. */
export function TimeFormatSwitch({ value, onChange }: { value: TimeFormat; onChange: (f: TimeFormat) => void }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
        <Clock3 className="size-4" aria-hidden /> Hora
      </span>
      <div role="radiogroup" aria-label="Formato de hora" className="relative grid grid-cols-2 rounded-xl bg-slate-100 p-1 ring-1 ring-inset ring-slate-200">
        <span
          aria-hidden
          className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm ring-1 ring-slate-200 transition-transform duration-200 ease-out motion-reduce:transition-none ${
            value === "24h" ? "translate-x-full" : ""
          }`}
        />
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            aria-label={o.aria}
            tabIndex={value === o.value ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onRadioKeyDown(e, VALUES, value, onChange)}
            className={`relative z-10 flex min-w-14 items-center justify-center rounded-lg px-3 py-1.5 leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
              value === o.value ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="text-sm font-semibold tabular-nums">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
