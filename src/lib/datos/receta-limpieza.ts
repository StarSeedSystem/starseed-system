/**
 * Receta de limpieza OpenRefine como DATO (INV1025F · architecture/repos-libreria-1025.md §3.4).
 *
 * Una receta es una lista de operaciones JSON de OpenRefine 3.10.1: el parámetro `operations`
 * de `/command/core/apply-operations` las interpreta `Recipe`, que acepta el array tal cual.
 * Aquí vive lo puro (lista blanca y validación), sin `node:*`.
 *
 * R5/R9 del grupo investigación: nada de Jython/Clojure (ejecutan código), nada de «añadir
 * columna desde URLs» (SSRF), nada de reconciliación (envía valores a servicios externos;
 * su futuroía es solo https y solo Wikidata) y solo expresiones GREL (`grel:`). La receta
 * declara `datos: "publicos"`.
 */

export const TOPE_OPERACIONES = 100;
export const TOPE_TAMANO_BYTES = 200 * 1024;

/**
 * Lista blanca, con los ids COMPLETOS como los registra OpenRefine 3.10.1 (verificados en
 * main/tests/server/src/…/operations/*.java). El id puede venir con o sin el prefijo `core/`:
 * `OperationRegistry.resolveOperationId` lo añade si falta (compatibilidad).
 */
export const OPS_LIMPIEZA = [
  "core/text-transform", "core/mass-edit", "core/column-removal", "core/column-rename",
  "core/column-split", "core/column-addition", "core/blank-down", "core/fill-down",
  "core/row-removal", "core/multivalued-cell-split", "core/multivalued-cell-join", "core/column-reorder",
] as const;

export type OpLimpieza = (typeof OPS_LIMPIEZA)[number];

/** Operación JSON de OpenRefine: `op` fijo y el resto de campos según la operación. */
export interface OperacionLimpieza {
  op: string;
  [campo: string]: unknown;
}

/** Receta declarada: solo datos públicos (R5) y solo la lista blanca de arriba. */
export interface RecetaLimpieza {
  datos: "publicos";
  nombre?: string;
  operaciones: OperacionLimpieza[];
}

export type ValidacionReceta = { ok: true; receta: RecetaLimpieza } | { ok: false; errores: string[] };

function esOpPermitida(op: string): boolean {
  const id = op.startsWith("core/") ? op.slice(5) : op;
  return (OPS_LIMPIEZA as readonly string[]).includes(`core/${id}`);
}

/** Toda cadena guardada bajo un campo `expression` (también anidada) ha de declarar GREL. */
function expresionesNoGrel(x: unknown, con: string[] = []): string[] {
  if (con.length >= 8 || !x || typeof x !== "object") return con;
  for (const [clave, valor] of Object.entries(x as Record<string, unknown>)) {
    if (con.length >= 8) break;
    if (typeof valor === "string" && clave === "expression" && !valor.startsWith("grel:")) con.push(valor.slice(0, 40));
    else if (valor && typeof valor === "object") expresionesNoGrel(valor, con);
  }
  return con;
}

/**
 * Valida una receta desde datos que puedan venir de cualquier lado. Rechaza: forma incorrecta,
 * `datos` distinto de `publicos` (R5/R9), operaciones fuera de la lista blanca (con aviso
 * expreso para reconciliación y columnas por URLs), expresiones no GREL, y lo que pase de
 * `TOPE_OPERACIONES` u operaciones o de `TOPE_TAMANO_BYTES` de receta serializada.
 */
export function validarReceta(entrada: unknown): ValidacionReceta {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    return { ok: false, errores: ["La receta ha de ser un objeto con `datos` y `operaciones`."] };
  }
  const r = entrada as Partial<RecetaLimpieza>;
  if (r.datos !== "publicos") {
    return { ok: false, errores: ['La receta debe declarar `datos: "publicos"` (R5/R9: nada de datos personales a servicios externos).'] };
  }
  if (!Array.isArray(r.operaciones)) {
    return { ok: false, errores: ["La receta necesita la lista de operaciones en `operaciones`."] };
  }
  const errores: string[] = [];
  if (r.operaciones.length > TOPE_OPERACIONES) {
    errores.push(`Demasiadas operaciones (${r.operaciones.length}); el tope es ${TOPE_OPERACIONES}.`);
  }
  if (new TextEncoder().encode(JSON.stringify(entrada)).length > TOPE_TAMANO_BYTES) {
    errores.push(`La receta serializada pasa de ${TOPE_TAMANO_BYTES / 1024} KB.`);
  }
  r.operaciones.slice(0, TOPE_OPERACIONES).forEach((op, i) => {
    if (!op || typeof op !== "object" || typeof op.op !== "string") {
      errores.push(`Operación ${i}: falta el campo \`op\`.`);
      return;
    }
    if (op.op.includes("column-addition-by-fetching-urls")) {
      errores.push(`Operación ${i}: «añadir columna desde URLs» prohibido (hace peticiones de red: SSRF).`);
      return;
    }
    if (op.op.includes("recon")) {
      errores.push(`Operación ${i}: la reconciliación no está en la lista blanca (solo servicios https autorizados y solo con datos públicos).`);
      return;
    }
    if (!esOpPermitida(op.op)) {
      errores.push(`Operación ${i}: \`op: "${op.op}"\` fuera de la lista blanca de limpieza.`);
      return;
    }
    for (const mala of expresionesNoGrel(op)) {
      errores.push(`Operación ${i}: expresión "${mala}" sin \`grel:\`; Jython, Clojure y demás prefijos quedan fuera.`);
    }
  });
  if (errores.length) return { ok: false, errores };
  const nombre = typeof r.nombre === "string" && r.nombre.trim() ? r.nombre.trim().slice(0, 120) : undefined;
  return { ok: true, receta: { datos: "publicos", nombre, operaciones: r.operaciones.filter((o): o is OperacionLimpieza => Boolean(o)) } };
}

/** Peso serializado de una receta ya validada (para catálogos y fichas honestas). */
export function pesoReceta(receta: RecetaLimpieza): number {
  return new TextEncoder().encode(JSON.stringify(receta)).length;
}
