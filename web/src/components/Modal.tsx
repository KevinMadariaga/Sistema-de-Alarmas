"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const WIDTH = { sm: "max-w-lg", md: "max-w-2xl", lg: "max-w-3xl", xl: "max-w-5xl" };

/** Modal estándar (estilo M1 de Bootstrap): título con ×, cuerpo y pie con acciones a la derecha.
 *  Nativo (<dialog>): foco atrapado, Esc y fondo gratis. */
export function Modal({ open, onClose, title, children, footer, size = "sm" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId(); // único por modal: hay varias montadas a la vez
  const closingByProp = useRef(false); // cierre pedido por `open=false` (no por el usuario)

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) {
      closingByProp.current = true;
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={() => {
        // El evento "close" del <dialog> también se dispara al cerrarlo por código: solo Esc/botón/fondo son del usuario.
        if (closingByProp.current) closingByProp.current = false;
        else onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby={titleId}
      className={`m-auto w-[calc(100%-2rem)] ${WIDTH[size]} rounded-xl bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/45`}
    >
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3.5">
        <h2 id={titleId} className="flex-1 text-base font-bold text-slate-900">
          {title}
        </h2>
        <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
          <X className="size-5" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
    </dialog>
  );
}
