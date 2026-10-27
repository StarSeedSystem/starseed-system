/**
 * Recetas de limpieza como datos · OpenRefine (INV1025F, architecture/repos-libreria-1025.md §7 y §3.4).
 *
 * Una receta es la lista JSON de operaciones que OpenRefine guarda como historial y se aplica con
 * «apply-operations». La consume el cliente `src/lib/integrations/clients/openrefine.ts` y, en la
 * tarea INV1025H, la limpieza nativa sin JVM. Módulo PURO: sin `node:*`, sin red, sin disco ni reloj;
 * lo importan cliente y servidor.
 *
 * Reglas duras R5 y R9 del grupo investigación: los datos de una receta son siempre públicos
 * («publicos») y la reconciliación solo contra servicios https de la lista blanca (Wikidata).
 * Jython y Clojure ejecutan código y «añadir columna desde URLs» hace peticiones de red (SSRF):
 * fuera, según R10. Los nombres de «op» son los exactos del registro de la 3.10 (OperationsEnabled),
 * con su prefijo `core/`: lo que no esté en la lista blanca no se aplica.
 */

/** Un paso de la receta, con la forma que OpenRefine exporta en su historial de operaciones. */
export interface OperacionReceta {
  /** Nombre exacto de la operación de OpenRefine (p. ej. «core/text-transform»). */
  op: string;
  /** El resto de campos los declara cada operación (columnName, expression, mode…). */
  [campo: string]: unknown;
}

/** Receta trasladable: declara que toca SOLO datos públicos y trae sus operaciones en orden. */
export interface RecetaLimpieza {
  datos: "publicos";
  /** Del primero (más antiguo) al último, como los aplica OpenRefine. */
  operaciones: OperacionReceta[];
}

export type ValidacionReceta =
  | { ok: true; receta: RecetaLimpieza }
  | { ok: false; motivo: string };

export const MAX_OPERACIONES = 100;
export const MAX_BYTES_RECETA = 200 * 1024;

/**
 * Nombres EXACTOS del registro de operaciones de la 3.10.x (prefijo «core/», verificado en el
 * código de la versión: text-transform, mass-edit, column-removal, column-rename, column-split,
 * column-addition, blank-down, fill-down, row-removal, multivalued-cell-split y -join,
 * column-reorder). Quedan fuera por ejecutar código o tocar la red: core/column-addition-by-fetching-urls
 * (SSRF) y todo lo demás que no esté aquí.
 */
export const OPS_PERMITIDAS: readonly string[] = [
  "core/text-transform",
  "core/mass-edit",
  "core/column-removal",
  "core/column-rename",
  "core/column-split",
  "core/column-addition",
  "core/blank-down",
  "core/fill-down",
  "core/row-removal",
  "core/multivalued-cell-split",
  "core/multivalued-cell-join",
  "core/column-reorder",
];

/** Lista blanca de servicios de reconciliación (R5 · R9): siempre https y solo estos. */
export const SERVICIOS_RECONCILIACION: readonly string[] = ["https://wikidata.reconci.link/en/api"];
const GREP_GREL = /^grel:/;
const SERVICIO_EXTRA = "la reconciliación solo vale contra «Wikidata» por https (R5, R9).";

/** Acumula hasta `tope` fallas recorriendo campos y anidamientos de UNA operación. */
function revisar(valor: unknown, donde: string, fallas: string[], tope: number): void {
  if (fallas.length >= tope || valor === null || typeof valor !== "object") return;
  const entradas = Object.entries(valor as Record<string, unknown>);
  for (const [campo, v] of entradas) {
    if (fallas.length >= tope) return;
    const rita = `${donde} · campo «${campo}»`;
    if (typeof v === "string") {
      if (campo === "expression" && !GREP_GREL.test(v))
        fallas.push(`${rita}: la expresión solo acepta GREL («grel:…»); Jython y Clojure ejecutan código (R10).`);
      else if (campo === "service" && (!(SERVICIOS_RECONCILIACION as readonly string[]).includes(v) || !v.startsWith("https://")))
        fallas.push(`${rita}: ${SERVICIO_EXTRA}`);
    } else revisar(v, rita, fallas, tope);
  }
}

const FALLAS_POR_RECETA = 3;

/** Razones por las que UNA operación no vale; la primera manda y las demás acompañan. */
function razonesOp(op: unknown, n: number): string[] {
  if (typeof op !== "object" || op === null || Array.isArray(op)) return [`La operación ${n} no es un objeto JSON.`];
  const nombre = (op as Record<string, unknown>)["op"];
  if (typeof nombre !== "string") return [`La operación ${n} no declara su «op».`];
  if (!(OPS_PERMITIDAS as readonly string[]).includes(nombre))
    return [`La operación ${n} usa «${nombre}», que no está en la lista blanca; se rechaza (jython, clojure,`
      + ` «añadir columna desde URLs» y cualquier otra, por SSRF o ejecución de código, R10).`];
  const fallas: string[] = [];
  revisar(op, `operación ${n}`, fallas, FALLAS_POR_RECETA);
  return fallas;
}

export function validarReceta(valor: unknown): ValidacionReceta {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return { ok: false, motivo: "La receta no es un objeto JSON." };
  const r = valor as Record<string, unknown>;
  if (r.datos !== "publicos")
    return { ok: false, motivo: "R5/R9: una receta solo toca datos públicos; declara datos: \"publicos\"." };
  if (!Array.isArray(r.operaciones)) return { ok: false, motivo: "La receta no trae su lista de «operaciones»." };
  const operaciones = r.operaciones as unknown[];
  if (operaciones.length > MAX_OPERACIONES) return { ok: false, motivo: `La receta pasa de ${MAX_OPERACIONES} operaciones.` };
  let bytes: number;
  try { bytes = new TextEncoder().encode(JSON.stringify(valor)).byteLength; }
  catch { return { ok: false, motivo: "La receta no se puede pasar a JSON." }; }
  if (bytes > MAX_BYTES_RECETA) return { ok: false, motivo: `La receta pasa de ${Math.round(MAX_BYTES_RECETA / 1024)} KB.` };
  const razones: string[] = [];
  for (let i = 0; i < operaciones.length && razones.length === 0; i++) razones.push(...razonesOp(operaciones[i], i + 1));
  if (razones.length > 0) return { ok: false, motivo: razones.join(" ") };
  return { ok: true, receta: valor as RecetaLimpieza };
}
