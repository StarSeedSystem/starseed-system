// src/lib/datos/receta-limpieza.ts
// Validación pura de recetas de OpenRefine. Sin dependencias de nodo.

export type RecetaLimpieza = {
  datos?: string;
  operations?: unknown[];
};

const OPS_PERMITIDAS = new Set<string>([
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
]);

const RECONCILIACION_SERVICIOS_PERMITIDOS = new Set<string>([
  "https://wikidata.org",
  "https://www.wikidata.org",
]);

const TAMANO_MAX_BYTES = 200 * 1024;
const OPS_MAX = 100;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function contieneCadenaMaliciosa(obj: unknown): boolean {
  if (typeof obj === "string") {
    if (obj.startsWith("jython:") || obj.startsWith("clojure:")) return true;
    return false;
  }
  if (Array.isArray(obj)) {
    return obj.some(contieneCadenaMaliciosa);
  }
  if (esObjeto(obj)) {
    return Object.values(obj).some(contieneCadenaMaliciosa);
  }
  return false;
}

function tieneExpresionNoGrel(obj: unknown): boolean {
  if (typeof obj === "string") {
    if (obj.includes(":") && !obj.startsWith("grel:")) {
      // expresión con prefijo distinto a grel
      return true;
    }
    return false;
  }
  if (Array.isArray(obj)) {
    return obj.some(tieneExpresionNoGrel);
  }
  if (esObjeto(obj)) {
    return Object.values(obj).some(tieneExpresionNoGrel);
  }
  return false;
}

export function validarReceta(x: unknown): boolean {
  if (!esObjeto(x)) return false;
  if (x.datos !== "publicos") return false;

  const ops = x.operations;
  if (!Array.isArray(ops)) return false;
  if (ops.length === 0 || ops.length > OPS_MAX) return false;

  const serializado = JSON.stringify(x);
  if (serializado.length > TAMANO_MAX_BYTES) return false;

  for (const op of ops) {
    if (!esObjeto(op)) return false;
    const opNombre = typeof op.op === "string" ? op.op : "";
    if (!OPS_PERMITIDAS.has(opNombre)) {
      // rechaza fetching urls
      if (opNombre === "core/column-addition-by-fetching-urls") return false;
      return false;
    }
    if (contieneCadenaMaliciosa(op)) return false;
    if (tieneExpresionNoGrel(op)) return false;

    // reconciliación limitada
    if (opNombre.startsWith("core/reconcile")) {
      const servicio = typeof op.service =="string" ? op.service : "";
      if (!RECONCILIACION_SERVICIOS_PERMITIDOS.has(servicio)) return false;
    }
  }

  return true;
}
