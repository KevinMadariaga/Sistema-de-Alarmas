// Colores que NO pasan por CSS/Tailwind (Excel, SVG del gráfico, <meta theme-color>).
// Los valores coinciden con los roles de src/app/globals.css: si cambias un rol allí, cámbialo aquí.

/** Fondo de la página (slate-100) → color de la barra del navegador en móvil. */
export const PAGE_BG = "#f1f5f9";

/** Superficie de los gráficos: separa porciones de la torta (gap de 2 px). */
export const SURFACE = "#ffffff";

/** Paleta categórica del gráfico de torta (skill dataviz, validada): orden fijo, nunca rotado. */
export const CHART_CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"] as const;
/** Porción "Otras" (slate-400). */
export const CHART_OTHER = "#94a3b8";

/** Excel (ARGB): encabezado, bordes, cebra y celda de distintivo por nivel. */
export const XLSX = {
  headerBg: "FF1E293B", // slate-800
  headerFg: "FFFFFFFF",
  border: "FFE2E8F0", // slate-200
  zebra: "FFF8FAFC", // slate-50
  level: {
    CRITICO: { bg: "FFFADBD8", fg: "FF741C16" }, // critical-100 / critical-800
    WARN: { bg: "FFFDEBC2", fg: "FF5C3810" }, // warn-100 / warn-900
    NORMAL: { bg: "FFD3ECDD", fg: "FF18452E" }, // ok-100 / ok-800
  },
} as const;
