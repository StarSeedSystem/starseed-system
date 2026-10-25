/**
 * Recetas de limpieza de OpenRefine como DATO (INV1025F · architecture/repos-libreria-1025.md §7).
 *
 * Una receta es la lista de operaciones JSON que OpenRefine (3.10.1, BSD-3) exporta con «Extraer
 * operaciones» y que se guarda y comparte por REFERENCIA, nunca duplicada. El validador fija la
 * lista blanca del contrato (R5 y R9 del grupo de investigación): solo operaciones conocidas,
 * solo expresiones GREL, reconciliación solo contra servicios https de la lista (Wikidata) y la
 * receta debe declararse de datos públicos. Jython y Clojure ejecutan código y
 * `core/column-addition-by-fetching-urls` sale a red (SSRF): fuera. Topes: 100 operaciones y 200 KB.
 * Módulo puro: sin `node:*`, sin red, sin reloj.
 */

export interface OperacionLimpieza {
  /** Identidad exacta de la operación de OpenRefine (p.ej. «core/text-transform»). */
  op: string;
  [clave: string]: unknown;
}

export interface RecetaLimpieza {
  /** Declaración obligatoria: solo datos públicos (R5) toca servicios de fuera (R9). */
  datos: "publicos";
  operaciones: OperacionLimpieza[];
}

export interface ResultadoValidacion {
  ok: boolean;
  errores: string[];
}

/** Nombres EXACTOS de OpenRefine 3.10, verificados contra su código (ops de `core/`). */
export const OPS_PERMITIDAS = [
  "text-transform", "mass-edit", "column-removal", "column-rename", "column-split",
  "column-addition", "blank-down", "fill-down", "row-removal", "recon",
  "multivalued-cell-split", "multivalued-cell-join", "column-reorder",
] as const;

export type OpLimpieza = (typeof OPS_PERMITIDAS)[number];

/** Anfitriones https con los que se permite reconciliar (R9): servicios de Wikidata. */
export const SERVICIOS_RECONCILIACION = ["wikidata.reconci.link", "wdreconcile.toolforge.org"] as const;

export const TOPE_OPERACIONES = 100;
export const TOPE_BYTES = 200 * 1024;

/** «core/text-transform» o «text-transform» → «core/text-transform»; cualquier otra cosa → null. */
export function opCanonica(op: unknown): string | null {
  if (typeof op !== "string") return null;
  const nombre = op.startsWith("core/") ? op.slice("core/".length) : op;
  return (OPS_PERMITIDAS as readonly string[]).includes(nombre) ? `core/${nombre}` : null;
}

/** Un servicio de reconciliación solo cuenta si es https y su anfitrión está en la lista blanca. */
export function esServicioDeLista(valor: unknown): boolean {
  if (typeof valor !== "string") return false;
  let u: URL;
  try {
    u = new URL(valor);
  } catch {
    return false;
  }
  return u.protocol === "https:" && (SERVICIOS_RECONCILIACION as readonly string[]).includes(u.hostname);
}

/** Recorre las hojas de texto de la operación (la clave que las trae decide qué se comprueba). */
function recorrer(v: unknown, clave: string, visita: (clave: string, valor: string) => void): void {
  if (typeof v === "string") return visita(clave, v);
  if (Array.isArray(v)) {
    for (const e of v) recorrer(e, clave, visita);
    return;
  }
  if (v === null || typeof v !== "object") return;
  for (const [k, e] of Object.entries(v)) recorrer(e, k, visita);
}
/** Sin «jython:»/«clojure:» (código), expresiones solo GREL y reconciliación de lista blanca. */
export function validarOperacion(o: unknown, indice: number, errores: string[]): void {
  const et = (m: string) => errores.push(`Operación ${indice + 1}: ${m}`);
  if (o === null || typeof o !== "object") {
    et("no es un objeto.");
    return;
  }
  const op = (o as OperacionLimpieza).op;
  const canon = opCanonica(op);
  if (!canon) {
    et(op === "core/column-addition-by-fetching-urls"
      ? "«column-addition-by-fetching-urls» prohibida (sale a red: SSRF)."
      : `op «${String(op)}» fuera de la lista blanca.`);
    return;
  }
  recorrer(o, "", (clave, valor) => {
    const v = valor.toLowerCase();
    if (v.startsWith("jython:") || v.startsWith("clojure:")) et(`expresión prohibida en ${clave || "op"}: solo GREL.`);
    if (clave === "expression" && !v.startsWith("grel:")) et("la expresión debe empezar por «grel:».");
    if (clave === "service" && !esServicioDeLista(valor)) et("servicio de reconciliación fuera de la lista blanca (solo https Wikidata).");
  });
}

/** Valida una receta entera: declaración de públicos, lista blanca, topes y tamaño. */
export function validarReceta(x: unknown): ResultadoValidacion {
  const errores: string[] = [];
  if (x === null || typeof x !== "object" || Array.isArray(x)) {
    return { ok: false, errores: ["La receta debe ser un objeto con «datos» y «operaciones»."] };
  }
  const r = x as Record<string, unknown>;
  if (r.datos !== "publicos") errores.push("La receta debe declarar datos:\"publicos\" (R5/R9: solo datos públicos).");
  if (!Array.isArray(r.operaciones)) {
    errores.push("Falta la lista de operaciones.");
  } else {
    if (r.operaciones.length > TOPE_OPERACIONES) errores.push(`Demasiadas operaciones: ${r.operaciones.length} (tope ${TOPE_OPERACIONES}).`);
    r.operaciones.forEach((o, i) => validarOperacion(o, i, errores));
  }
  let bytes = 0;
  try {
    bytes = new TextEncoder().encode(JSON.stringify(x)).length;
  } catch {
    errores.push("La receta no se puede serializar.");
  }
  if (bytes > TOPE_BYTES) errores.push(`La receta ocupa ${bytes} bytes (tope ${TOPE_BYTES}).`);
  return { ok: errores.length === 0, errores };
}
