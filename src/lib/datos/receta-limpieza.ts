// Recetas de limpieza de OpenRefine 3.10 COMO DATOS (INV1025F · contrato
// architecture/repos-libreria-1025.md §7, R5/R9): lista de operaciones JSON
// con `op` de la 3.10 (con o sin prefijo `core/`), SOLO expresiones `grel:`,
// reconciliación solo https de lista blanca (Wikidata) y datos «publicos».
// Receta = entidad única (se referencia por `id`). Pura: sin `node:*`.

/** Una operación JSON de OpenRefine (`op` obligatorio, resto forma libre). */
export interface OperacionRefine {
  op: string;
  [campo: string]: unknown;
}
/** Receta de limpieza: entidad única, compartida por referencia a su `id`. */
export interface RecetaLimpieza {
  id: string;
  nombre?: string;
  datos: "publicos"; // Obligatorio (R5, R9): solo datos públicos.
  reconciliacion?: string; // Servicio optativo (https y lista blanca).
  /** Operaciones en el orden en que OpenRefine las aplicará. */
  operaciones: OperacionRefine[];
}

export type ResultadoReceta = { ok: true; receta: RecetaLimpieza } | { ok: false; errores: string[] };

/** `op` exactos de la 3.10 (sin el prefijo `core/` de la serialización). */
export const OPS_PERMITIDAS = new Set(["text-transform", "mass-edit", "column-removal", "column-rename",
  "column-split", "column-addition", "blank-down", "fill-down", "row-removal",
  "multivalued-cell-split", "multivalued-cell-join", "column-reorder"]);

/** Prohibida: hace peticiones de red desde el refinado (SSRF). */
export const OP_PROHIBIDA = "core/column-addition-by-fetching-urls";

/** Lista blanca de reconciliación (R9): solo https, solo Wikidata. */
export const SERVICIOS_RECONCILIACION_OK = new Set(["www.wikidata.org"]);

/** Prefijos que ejecutan código: la 3.10 los lleva, una receta no. */
export const LENGUAJES_PROHIBIDOS = ["jython:", "clojure:", "grelass:", "cloveur:"];

/** Topes de la receta. Claves: expresión / servicio de reconciliación. */
export const MAX_OPERACIONES_RECETA = 100;
export const MAX_BYTES_RECETA = 200 * 1024;
const CLAVES_EXPRESION = new Set(["exp", "expression", "expr"]);
const CLAVES_SERVICIO = new Set(["service", "reconciliationService", "servicio"]);

/** Servicio de reconciliación: https y solo de la lista blanca (R9). */
function validarServicio(url: string, errores: string[]): void {
  let u: URL | null = null;
  try { u = new URL(url); } catch { u = null; }
  if (!u || u.protocol !== "https:" || !SERVICIOS_RECONCILIACION_OK.has(u.hostname)) {
    errores.push(`Servicio de reconciliación «${url}» fuera de la lista blanca https (solo Wikidata).`);
  }
}

/** Recorre la operación: lenguajes prohibidos, expresiones grel y servicios. */
function escanear(valor: unknown, clave: string, errores: string[]): void {
  if (Array.isArray(valor)) { for (const v of valor) escanear(v, clave, errores); return; }
  if (valor !== null && typeof valor === "object") {
    const tipo = (valor as Record<string, unknown>)["type"];
    if (CLAVES_EXPRESION.has(clave) && tipo !== "grel") errores.push(`Solo expresiones GREL (type «${String(tipo)}»).`);
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) escanear(v, k, errores);
    return;
  }
  if (typeof valor !== "string") return;
  const min = valor.toLowerCase();
  if (LENGUAJES_PROHIBIDOS.some((m) => min.startsWith(m))) errores.push(`«${valor.slice(0, 20)}…» ejecuta código: prohibido.`);
  else if (CLAVES_EXPRESION.has(clave) && !min.startsWith("grel:")) errores.push(`La expresión de «${clave}» debe empezar por grel:.`);
  if (CLAVES_SERVICIO.has(clave)) validarServicio(valor, errores);
}

/** Valida una operación: `op` en lista blanca, sin jython/clojure ni SSRF. */
function validarOperacion(op: unknown, indice: number, errores: string[]): void {
  const o = op !== null && typeof op === "object" && !Array.isArray(op) ? (op as Record<string, unknown>) : null;
  if (!o) { errores.push(`Operación ${indice}: no es un objeto JSON.`); return; }
  const nombre = typeof o["op"] === "string" ? o["op"] : "";
  const canonico = nombre.replace(/^core\//, "");
  if (!nombre) errores.push(`Operación ${indice}: falta «op».`);
  else if (canonico === "column-addition-by-fetching-urls") {
    errores.push(`Operación ${indice}: «${OP_PROHIBIDA}» prohibida (SSRF).`);
  } else if (!OPS_PERMITIDAS.has(canonico)) {
    errores.push(`Operación ${indice}: «${nombre}» no está en la lista blanca.`);
  }
  if (nombre) escanear(o, "", errores);
}

/** Valida una receta: lista blanca, solo GREL y topes 100 ops / 200 KB. */
export function validarReceta(x: unknown): ResultadoReceta {
  if (x === null || typeof x !== "object" || Array.isArray(x)) {
    return { ok: false, errores: ["Una receta es un objeto JSON con «operaciones»."] };
  }
  const r = x as Record<string, unknown>;
  const errores: string[] = [];
  if (typeof r["id"] !== "string" || r["id"].trim() === "") {
    errores.push("Falta «id»: la receta es una entidad única que se referencia.");
  }
  if (r["nombre"] !== undefined && typeof r["nombre"] !== "string") errores.push("«nombre» debe ser texto.");
  if (r["datos"] !== "publicos") errores.push(`«datos» debe declararse como "publicos" (R5, R9).`);
  const rec = r["reconciliacion"];
  if (rec !== undefined && typeof rec !== "string") {
    errores.push("«reconciliacion» debe ser una URL https.");
  } else if (typeof rec === "string") validarServicio(rec, errores);
  const ops = r["operaciones"];
  if (!Array.isArray(ops)) {
    errores.push("«operaciones» es la lista JSON de operaciones de OpenRefine.");
  } else {
    if (ops.length > MAX_OPERACIONES_RECETA) errores.push(`La receta tiene ${ops.length} operaciones; el tope es 100.`);
    const bytes = new TextEncoder().encode(JSON.stringify(x)).length;
    if (bytes > MAX_BYTES_RECETA) errores.push(`La receta pesa ${bytes} bytes; el tope es 200 KB.`);
    ops.forEach((op, i) => validarOperacion(op, i, errores));
  }
  if (errores.length > 0) return { ok: false, errores };
  return {
    ok: true,
    receta: {
      id: r["id"] as string,
      nombre: r["nombre"] as string | undefined,
      datos: "publicos",
      reconciliacion: r["reconciliacion"] as string | undefined,
      operaciones: (ops as Array<Record<string, unknown>>).map((o) => ({ ...o, op: String(o["op"]) })),
    },
  };
}
