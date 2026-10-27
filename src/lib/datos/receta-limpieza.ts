// ════════════════════════════════════════════════════════════════
// Receta de limpieza de OpenRefine — PURA, sin node:* ni red
// ----------------------------------------------------------------
// Una receta es una lista de operaciones JSON de OpenRefine (3.10.1)
// exportable y versionable: la misma lista que el comando
// «Extract operations» produce y `apply-operations` consume.
// Aquí solo se valida; nadie la ejecuta. Ver SRC-F contra el código
// de la 3.10 (nombres exactos de `op` y prefijos de expresión).
// ════════════════════════════════════════════════════════════════

/** Operaciones permitidas (se aceptan con o sin prefijo `core/`). */
const OPS_PERMITIDAS: readonly string[] = [
  "text-transform", "mass-edit", "column-removal", "column-rename",
  "column-split", "column-addition", "blank-down", "fill-down",
  "row-removal", "multivalued-cell-split", "multivalued-cell-join",
  "column-reorder", "recon",
];

/** Servicios de reconciliación a los que SÍ se puede hablar (R5, R9): */
const SERVICIOS_RECON: readonly string[] = [
  "https://www.wikidata.org/",
  "https://wikidata.org/",
  "https://wdreconcile.toolforge.org/",
];

/** Tope de la receta: 100 operaciones y 200 KB serializada. */
export const MAX_OPERACIONES = 100;
export const MAX_BYTES = 200 * 1024;

export interface OperacionReceta {
  /** Nombre de la operación, p. ej. `core/text-transform`. */
  op: string;
  [campo: string]: unknown;
}

export interface RecetaLimpieza {
  /** Los datos que la receta toca (R5/SR9): solo públicos. */
  datos: "publicos";
  /** Operación a aplicar, en orden. */
  operaciones: OperacionReceta[];
}

export type RecetaValida =
  | { ok: true; operaciones: OperacionReceta[] }
  | { ok: false; error: string };

export function validarReceta(valor: unknown): RecetaValida {
  return verificarReceta(valor);
}

/** Nombres de campos donde puede vivir una expresión GREL. */
const CAMPOS_EXPRESION = ["expression", "gormExpression", "scoringExpression"];

function fallar(error: string): RecetaValida {
  return { ok: false, error };
}

/** Quita el prefijo `core/` si existe (se acepta con o sin él). */
function nombreOp(op: string): string {
  return op.startsWith("core/") ? op.slice(5) : op;
}

function verificarReceta(valor: unknown): RecetaValida {
  if (typeof valor !== "object" || valor === null) return fallar("La receta debe ser un objeto.");
  const receta = valor as { datos?: unknown; operaciones?: unknown };
  if (receta.datos !== "publicos") return fallar("La receta debe declarar datos: \"publicos\" (R5, R9).");
  if (!Array.isArray(receta.operaciones)) return fallar("La receta debe traer una lista de operaciones.");
  if (receta.operaciones.length > MAX_OPERACIONES) return fallar(`Más de ${MAX_OPERACIONES} operaciones.`);
  if (JSON.stringify(valor).length > MAX_BYTES) return fallar("La receta supera los 200 KB.");
  for (let i = 0; i < receta.operaciones.length; i++) {
    const fallo = verificarOperacion(i, receta.operaciones[i]);
    if (fallo) return fallo;
  }
  return {
    ok: true,
    operaciones: receta.operaciones as OperacionReceta[],
  };
}

function verificarOperacion(indice: number, crudo: unknown): RecetaValida | null {
  if (typeof crudo !== "object" || crudo === null || !("op" in crudo)) {
    return fallar(`Operación ${indice}: falta el campo «op».`);
  }
  const operacion = crudo as { [k: string]: unknown };
  const base = nombreOp(String(operacion.op));
  if (!OPS_PERMITIDAS.includes(base)) {
    return fallar(`Operación ${indice}: op no permitida (${String(operacion.op)}).`);
  }
  const campo = verificarExpresion(indice, operacion);
  if (campo) return campo;
  if (base === "recon") {
    return verificarSesiónRecon(indice, operacion);
  }
  return null;
}

function verificarExpresion(indice: number, operacion: { [k: string]: unknown }): RecetaValida | null {
  for (const campo of CAMPOS_EXPRESION) {
    const valor = operacion[campo];
    if (valor === undefined) continue;
    if (typeof valor !== "string") return fallar(`Operación ${indice}: ${campo} debe ser texto.`);
    if (!valor.startsWith("grel:")) {
      return fallar(`Operación ${indice}: solo expresiones grel: (rechazado: ${valor.slice(0, 24)}).`);
    }
  }
  return null;
}

function verificarSesiónRecon(indice: number, operacion: { [k: string]: unknown }): RecetaValida | null {
  // La reconciliación envía los valores a un servicio: solo lista blanca https.
  const servicio = operacion.service ?? operacion.reconciliationService;
  if (typeof servicio === "string") {
    const vale = SERVICIOS_RECON.some((raíz) => servicio.startsWith(raíz));
    if (!vale) {
      return fallar(`Operación ${indice}: servicio de reconciliación fuera de la lista blanca.`);
    }
  }
  return null;
}
