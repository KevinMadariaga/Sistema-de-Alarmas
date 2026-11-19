// CSV: detección de separador, split con comillas y conversión a "|".

export const SEPARATOR = "|";

/** Único tipo de archivo permitido. */
export const ALLOWED_EXTENSION = ".csv";

/** Extensión en minúsculas ("datos.XLSX" → ".xlsx"); "" si no tiene. */
export const fileExtension = (name: string) => (/\.[^.]+$/.exec(name)?.[0] ?? "").toLowerCase();

export const isAllowedFile = (name: string) => fileExtension(name) === ALLOWED_EXTENSION;

/** Contenido binario (Excel, PDF, imagen renombrados a .csv): un CSV de texto nunca trae bytes NUL. */
export const looksBinary = (text: string) => text.includes("\u0000");
const CANDIDATES = ["|", ",", ";", "\t"] as const;

export const SEPARATOR_NAMES: Record<string, string> = {
  "|": "barra vertical ( | )",
  ",": "coma ( , )",
  ";": "punto y coma ( ; )",
  "\t": "tabulación",
};

/**
 * Divide una línea respetando comillas dobles ("a|b" es un solo campo) y quita las comillas.
 * Regla CSV: una comilla solo ABRE un campo entrecomillado al inicio del campo; dentro, "" es una comilla literal.
 * Una comilla suelta a mitad de un campo (Antena 5" norte) es texto normal.
 */
export function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (ch === sep) {
      out.push(field.trim());
      field = "";
    } else field += ch;
  }
  out.push(field.trim());
  return out;
}

export interface CsvRecord {
  line: number; // línea física del archivo donde empieza el registro (1 = primera línea)
  text: string;
}

/**
 * Separa el documento en registros no vacíos. Un salto de línea DENTRO de comillas es parte del campo,
 * no un registro nuevo. Conserva la línea física para poder señalarla al usuario.
 */
export function toRecords(text: string): CsvRecord[] {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const out: CsvRecord[] = [];
  let buf = "";
  let quoted = false;
  let fieldBlank = true; // aún no hay texto en el campo actual (solo ahí una comilla abre un entrecomillado)
  let physical = 1; // línea física actual
  let start = 1; // línea física donde empezó `buf`
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\n") physical++;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        buf += '""';
        i++;
        continue;
      }
      if (ch === '"') quoted = false;
      buf += ch;
      continue;
    }
    if (ch === "\n") {
      if (buf.trim() !== "") out.push({ line: start, text: buf });
      buf = "";
      start = physical;
      fieldBlank = true;
      continue;
    }
    if (ch === '"' && fieldBlank) quoted = true;
    else if ((CANDIDATES as readonly string[]).includes(ch)) fieldBlank = true;
    else if (ch !== " ") fieldBlank = false;
    buf += ch;
  }
  if (buf.trim() !== "") out.push({ line: start, text: buf });
  return out;
}


/** Separador más frecuente (fuera de comillas) en la cabecera; null si no hay ninguno. */
export function detectSeparator(headerLine: string): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const sep of CANDIDATES) {
    const count = splitLine(headerLine, sep).length - 1;
    if (count > bestCount) {
      best = sep;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Reescribe el documento usando "|" como separador. Conserva las líneas en blanco y la numeración física,
 * para que "Línea N" en las filas omitidas siga señalando la línea del archivo original.
 */
export function convertSeparator(text: string, from: string): string {
  const out: string[] = [];
  let physical = 1; // próxima línea física a escribir
  for (const rec of toRecords(text)) {
    while (physical < rec.line) {
      out.push("");
      physical++;
    }
    const converted = splitLine(rec.text, from)
      // Campo con |, comillas o salto de línea → entre comillas (escapando ""), así se lee intacto.
      .map((f) => (/[|"\n]/.test(f) ? `"${f.replaceAll('"', '""')}"` : f))
      .join(SEPARATOR);
    out.push(converted);
    physical += 1 + (converted.match(/\n/g)?.length ?? 0);
  }
  return out.join("\n");
}
