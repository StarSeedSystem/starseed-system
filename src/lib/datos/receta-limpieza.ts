// src/lib/datos/receta-limpieza.ts
// Módulo puro para validar recetas de limpieza de OpenRefine (INV1025F parte 1 de 3).
// Sin node:*, sin red, sin disco, sin reloj. Solo reglas puras.

export type DatosReceta = "publicos";

export interface RecetaLimpieza {
  datos: DatosReceta;
  operaciones?: unknown[];
  [clave: string]: unknown;
}

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
  "join",
  "column-reorder",
]);

const EXPRESION_PERMITIDA_PREFIJO = "grel:";
const EXPRESIONES_PROHIBIDAS_PREFIJO = ["jython:", "clojure:"];

const SERVICIOS_RECONCILIACION_BLANCA = new Set(["https://wikidata.org", "wikidata.org"]);

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function esString(x: unknown): x is string {
  return typeof x === "string";
}

function tamanioAproxBytes(x: unknown): number {
  try {
    const s = JSON.stringify(x);
    return s.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function validarExpresionGrel(expr: unknown): boolean {
  if (!esString(expr)) return false;
  const e = expr.trim();
  if (e.length === 0) return false;
  for (const p of EXPRESIONES_PROHIBIDAS_PREFIJO) {
    if (e.toLowerCase().startsWith(p)) return false;
  }
  if (!e.toLowerCase().startsWith(EXPRESION_PERMITIDA_PREFIJO)) return false;
  return true;
}

function buscarExpresionesGrel(obj: unknown): unknown[] {
  const res: unknown[] = [];
  if (typeof obj === "string") {
    res.push(obj);
    return res;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) res.push(...buscarExpresionesGrel(v));
    return res;
  }
  if (esObjeto(obj)) {
    for (const v of Object.values(obj)) res.push(...buscarExpresionesGrel(v));
    return res;
  }
  return res;
}

function esServicioReconocimientoEnListaBlanca(url: unknown): boolean {
  if (!esString(url)) return false;
  try {
    const u = url.trim();
    if (!u.toLowerCase().startsWith("https://")) return false;
    // Solo https; comparar contra lista blanca (Wikidata)
    // Permitir dominios de wikidata
    if (u.includes("wikidata.org")) {
      // Extraer host
      const m = u.match(/^https:\/\/([^\/\?#]+)/i);
      if (!m) return false;
      const host = m[1].toLowerCase();
      if (host === "wikidata.org" || host.endsWith(".wikidata.org")) return true;
      return false;
    }
    // También aceptar explícitamente los listados en la lista blanca
    for (const s of SERVICIOS_RECONCILIACION_BLANCA) {
      if (u.startsWith(s + "/") || u === s) {
        const m = u.match(/^https:\/\/([^\/\?#]+)/i);
        if (m) {
          const host = m[1].toLowerCase();
          if (host === "wikidata.org") return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

function extraerServiciosReconciliacion(obj: unknown): unknown[] {
  const res: unknown[] = [];
  if (Array.isArray(obj)) {
    for (const v of obj) res.push(...extraerServiciosReconciliacion(v));
    return res;
  }
  if (esObjeto(obj)) {
    // Buscar campos típicos de reconciliación
    for (const [k, v] of Object.entries(obj)) {
      const kl = k.toLowerCase();
      if (kl.includes("service") || kl.includes("endpoint") || kl.includes("url") || kl.includes("reconcil")) {
        if (esString(v)) res.push(v);
        else res.push(...extraerServiciosReconciliacion(v));
      } else {
        res.push(...extraerServiciosReconciliacion(v));
      }
    }
    return res;
  }
  return res;
}

export function validarReceta(x: unknown): { ok: boolean; motivo?: string } {
  // tope de 200 KB
  const bytes = tamanioAproxBytes(x);
  if (bytes > 200 * 1024) {
    return { ok: false, motivo: "receta_muy_grande" };
  }

  if (!esObjeto(x)) {
    return { ok: false, motivo: "receta_no_objeto" };
  }

  const receta = x as RecetaLimpieza;

  // debe declarar datos: "publicos" (R5, R9)
  if (receta.datos !== "publicos") {
    return { ok: false, motivo: "datos_no_publicos" };
  }

  const ops = receta.operaciones;
  if (!Array.isArray(ops)) {
    return { ok: false, motivo: "operaciones_no_array" };
  }

  // tope de 100 operaciones
  if (ops.length > 100) {
    return { ok: false, motivo: "demasiadas_operaciones" };
  }

  // Verificar cada operación
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!esObjeto(op)) {
      return { ok: false, motivo: "operacion_no_objeto" };
    }
    const tipoOp = (op as Record<string, unknown>).op;
    if (!esString(tipoOp)) {
      return { ok: false, motivo: "operacion_sin_tipo" };
    }

    // rechaza core/column-addition-by-fetching-urls explícitamente
    if (tipoOp === "core/column-addition-by-fetching-urls") {
      return { ok: false, motivo: "operacion_prohibida" };
    }

    // lista blanca
    if (!OPS_PERMITIDAS.has(tipoOp)) {
      return { ok: false, motivo: "operacion_fuera_lista" };
    }
  }

  // SOLO expresiones que empiezan por grel: - buscar todas las expresiones
  const expresiones = buscarExpresionesGrel(x);
  for (const expr of expresiones) {
    if (esString(expr)) {
      // Verificar que es grel: y no jython:/clojure:
      const e = expr.trim().toLowerCase();
      if (e.startsWith("jython:") || e.startsWith("clojure:")) {
        return { ok: false, motivo: "expresion_prohibida" };
      }
      if (!e.startsWith(EXPRESION_PERMITIDA_PREFIJO)) {
        // Si parece una expresión (no es solo texto normal), hay que ser estricto
        // Pero también puede haber otras formas; el requisito dice "SOLO expresiones que empiezan por grel:"
        // Asumimos que cualquier expresión encontrada debe cumplir
        return { ok: false, motivo: "expresion_no_grel" };
      }
    }
  }

  // Reconciliación solo contra servicios https de lista blanca (Wikidata)
  const servicios = extraerServiciosReconciliacion(x);
  for (const s of servicios) {
    if (esString(s)) {
      const sl = s.toLowerCase();
      // Si parece un servicio de reconciliación/reconocimiento
      if (sl.includes("reconcil") || sl.includes("service") || s.includes("://")) {
        if (!esServicioReconocimientoEnListaBlanca(s)) {
          // Solo Wikidata permitido
          if (!s.includes("wikidata.org")) {
            return { ok: false, motivo: "servicio_reconciliacion_fuera_lista" };
          }
        }
      }
    }
  }

  return { ok: true };
}
