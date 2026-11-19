import type { KeyboardEvent } from "react";

/**
 * Teclado estándar de un radiogroup (patrón WAI-ARIA): flechas mueven y seleccionan, Home/End van a los extremos.
 * Usar con roving tabindex: solo la opción activa tiene tabIndex=0.
 */
export function onRadioKeyDown<T>(e: KeyboardEvent<HTMLElement>, options: readonly T[], value: T, onChange: (v: T) => void) {
  const i = options.indexOf(value);
  const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: options.length - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  const idx = (next + options.length) % options.length;
  onChange(options[idx]);
  // Mueve el foco a la opción recién elegida (hermana en el mismo grupo).
  const group = e.currentTarget.closest('[role="radiogroup"]');
  (group?.querySelectorAll<HTMLElement>('[role="radio"]')[idx])?.focus();
}
