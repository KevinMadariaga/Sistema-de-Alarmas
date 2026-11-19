import { LEVEL_LABEL, type Level } from "@/lib/alarms";

/** Colores por distintivo: fondo suave + texto oscuro del mismo tono (etiqueta de estado, sin ícono). */
export const LEVEL_STYLE: Record<Level, { badge: string; swatch: string }> = {
  CRITICO: { badge: "bg-critical-100 text-critical-800", swatch: "bg-critical-500" },
  WARN: { badge: "bg-warn-100 text-warn-900", swatch: "bg-warn-500" },
  NORMAL: { badge: "bg-ok-100 text-ok-800", swatch: "bg-ok-500" },
};

export function LevelBadge({ level, title }: { level: Level; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex w-24 items-center justify-center rounded-[3px] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap ${LEVEL_STYLE[level].badge}`}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}
