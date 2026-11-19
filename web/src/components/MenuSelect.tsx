"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

export interface MenuOption {
  value: string;
  label: string;
  hint?: string; // segunda línea gris (ej. la regla del distintivo)
  swatch?: string; // clase de color de un cuadrito antes del texto
  count?: number; // número a la derecha
}

interface Props {
  label: string; // texto fijo del botón ("Ordenar", "Distintivo")
  icon: LucideIcon;
  ariaLabel: string;
  value: string;
  options: MenuOption[];
  onChange: (v: string) => void;
}

/**
 * Desplegable con el estilo del proyecto (patrón WAI-ARIA select-only combobox + listbox).
 * Se usa para "Distintivo" (filtro) y "Ordenar".
 * Enter/Espacio/↓ abre · ↑↓ Inicio/Fin recorren · Enter elige · Esc o clic fuera cierra.
 */
export function MenuSelect({ label, icon: Icon, ariaLabel, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // opción resaltada con teclado/mouse
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  // Cierra al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openList = () => {
    setActive(selectedIndex);
    setOpen(true);
  };

  const choose = (i: number) => {
    onChange(options[i].value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const last = options.length - 1;
    const moves: Record<string, number> = { ArrowDown: Math.min(active + 1, last), ArrowUp: Math.max(active - 1, 0), Home: 0, End: last };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        role="combobox" // patrón WAI-ARIA "select-only combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-100 py-1 pl-3 pr-1 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <Icon className="size-4" aria-hidden /> {label}
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg bg-white py-1.5 pl-3 pr-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200">
          {selected?.swatch && <span className={`size-2 rounded-[2px] ${selected.swatch}`} aria-hidden />}
          {selected?.label}
          {selected?.count !== undefined && <span className="font-normal tabular-nums text-slate-500">{selected.count}</span>}
          <ChevronDown className={`size-4 text-slate-500 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute right-0 z-30 mt-2 min-w-full overflow-hidden rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200"
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()} // mantiene el foco en el botón
                onClick={() => choose(i)}
                className={`flex cursor-pointer items-start gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                  i === active ? "bg-brand-50 text-brand-900" : "text-slate-700"
                } ${isSelected ? "font-semibold" : ""}`}
              >
                <Check className={`mt-0.5 size-4 shrink-0 ${isSelected ? "text-brand-600" : "invisible"}`} aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2">
                    {o.swatch && <span className={`size-2 rounded-[2px] ${o.swatch}`} aria-hidden />}
                    {o.label}
                    {o.count !== undefined && <span className="ml-auto pl-4 font-normal tabular-nums text-slate-500">{o.count}</span>}
                  </span>
                  {o.hint && <span className="text-xs font-normal text-slate-500">{o.hint}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
