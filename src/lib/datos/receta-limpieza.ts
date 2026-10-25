// src/lib/datos/receta-limpieza.ts
// Recetas de limpieza de OpenRefine como DATO (tarea INV1025F; reglas R5/R9 de
// architecture/repos-libreria-1025.md §7). Una receta es la lista de operaciones
// JSON que OpenRefine 3.10 exporta; este módulo puro valida que sea segura antes
// de enviarla al servicio local (127.0.0.1:3333):
//   · Solo operaciones de la lista blanca y solo expresiones grel:; se rechaza
//     jython: y clojure: (ejecutan código) y column-addition-by-fetching-urls
//     (hace peticiones de red desde el servidor: SSRF).
//   · La reconciliación solo contra servicios https de la lista blanca (Wikidata)
//     y la receta debe declarar datos: "publicos": nada sensible sale de casa.
//   · Topes: 100 operaciones y 200 KB por receta.

export type OperacionOpenRefine = Record<string, unknown>;

export interface RecetaLimpieza {
  /** R5/R9: solo se acepta "publicos". */
  datos: string;
  /** Servicio https de la lista blanca si la receta reconcilia. */
  servicioReconciliacion?: string;
  /** Operaciones JSON exportadas por OpenRefine 3.10 (prefijo core/ opcional). */
  operaciones: OperacionOpenRefine[];
}

export interface ResultadoValidacion {
  valida: boolean;
  /** Motivo en español cuando valida es false. */
  motivo?: string;
}

export const TOPES_RECETA = { operaciones: 100, bytes: 200 * 1024 } as const;

// Nombres exactos de OpenRefine 3.10 sin el prefijo core/ que antepone la exportación.
const OPS_PERMITIDAS = new Set([
  "text-transform",
  "mass-edit",
  "column-removal",
  "column-rename",
  "column-split",
  "column-addition",
  "blank-down",
  "fill-down",
  "row-removal",
  "multivalued-cell-split",
  "multivalued-cell-join",
  "column-reorder",
]);

/** Lista blanca https de reconciliación (R9: solo Wikidata). */
const SERVICIOS_RECONCILIACION = new Set(["www.wikidata.org"]);

function fallar(motivo: string): ResultadoValidacion {
  return { valida: false, motivo };
}

function servicioPermitido(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && SERVICIOS_RECONCILIACION.has(u.hostname);
  } catch {
    return false;
  }
}

/** Recoge las expresiones (claves expression/expr) y marca jython:/clojure: donde aparezcan. */
function escanearOperacion(op: OperacionOpenRefine): { expresiones: string[]; prohibida: boolean } {
  const expresiones: string[] = [];
  let prohibida = false;
  const visita = (valor: unknown): void => {
    if (typeof valor === "string") {
      if (/^(jython|clojure):/.test(valor)) prohibida = true;
      return;
    }
    if (valor && typeof valor === "object") {
      for (const [clave, v] of Object.entries(valor)) {
        if ((clave === "expression" || clave === "expr") && typeof v === "string") {
          expresiones.push(v);
          if (/^(jython|clojure):/.test(v)) prohibida = true;
        } else visita(v);
      }
    }
  };
  visita(op);
  return { expresiones, prohibida };
}

/**
 * Valida una receta de limpieza contra las reglas R5/R9 y la lista blanca de
 * OpenRefine 3.10. Nunca lanza: devuelve el motivo en español.
 */
export function validarReceta(x: unknown): ResultadoValidacion {
  if (!x || typeof x !== "object") return fallar("La receta debe ser un objeto con datos y operaciones.");
  const receta = x as RecetaLimpieza;
  if (receta.datos !== "publicos") return fallar('La receta debe declarar datos: "publicos" (R5, R9).');
  if (!Array.isArray(receta.operaciones) || receta.operaciones.length === 0)
    return fallar("La receta necesita al menos una operación.");
  if (receta.operaciones.length > TOPES_RECETA.operaciones)
    return fallar(`Máximo ${TOPES_RECETA.operaciones} operaciones por receta.`);
  if (JSON.stringify(receta).length > TOPES_RECETA.bytes) return fallar("La receta supera los 200 KB.");
  if (receta.servicioReconciliacion !== undefined && !servicioPermitido(receta.servicioReconciliacion))
    return fallar("La reconciliación solo admite servicios https de la lista blanca (Wikidata).");
  for (const op of receta.operaciones) {
    if (!op || typeof op !== "object") return fallar("Cada operación debe ser un objeto JSON.");
    const nombre = typeof op["op"] === "string" ? (op["op"] as string).replace(/^core\//, "") : "";
    if (!nombre) return fallar("Cada operación necesita su campo op.");
    if (nombre === "column-addition-by-fetching-urls")
      return fallar("column-addition-by-fetching-urls está prohibido: hace peticiones de red (SSRF).");
    if (!OPS_PERMITIDAS.has(nombre)) return fallar(`Operación no permitida: ${nombre}.`);
    const { expresiones, prohibida } = escanearOperacion(op);
    if (prohibida) return fallar("Se rechaza jython: y clojure: porque ejecutan código de terceros.");
    if (expresiones.some((e) => !e.startsWith("grel:")))
      return fallar("Todas las expresiones deben empezar por grel:.");
    const servicio = (op as { service?: unknown })["service"];
    if (typeof servicio === "string" && !servicioPermitido(servicio))
      return fallar("La reconciliación solo admite servicios https de la lista blanca (Wikidata).");
  }
  return { valida: true };
}
