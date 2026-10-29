/**
 * Contenido vivo · ajustes por ámbito (cuenta, página y grupo) y libro de créditos
 * (CVV1028, tarea C). Módulo PURO: sin red, sin disco y sin `node:*`.
 * Contrato: `architecture/contenido-vivo.md` §4. La persistencia la decide quien llama.
 *  · Local primero por defecto; los servicios externos se permiten de uno en uno.
 *  · Tope de créditos al mes: 0 significa que no se gasta nada (seguro por defecto).
 *  · Quién aprueba un gasto: la propia persona («yo»), una propuesta democrática
 *    en la Protomolécula («democratica») o personas concretas con permiso.
 *  · Cada gasto deja un asiento con fecha, servicio, modelo, créditos, tarea y quién lo aprobó.
 */
import type { TareaViva } from "./tipos";

export type ModoAprobacion = "yo" | "democratica" | "personas";

/** Ajustes de contenido vivo de UN ámbito: una cuenta, una página o un grupo. */
export interface AjustesContenidoVivo {
  localPrimero: boolean;
  externosPermitidos: string[];
  topeCreditosMes: number;
  aprobacion: ModoAprobacion;
  /** Solo en `aprobacion: "personas"`: quienes tienen permiso de aprobar. */
  personas?: string[];
}

/** Un gasto de créditos anotado en el libro del ámbito (`t` ISO y `ambito` a gusto de quien llama). */
export interface AsientoCreditos {
  t: string;
  ambito: string;
  servicio: string;
  modelo: string;
  creditos: number;
  tarea: TareaViva;
  aprobadoPor: string;
}

/** Respuesta de `puedeGastar`: un sí o un no, siempre con el motivo claro. */
export interface VeredictoGasto {
  si: boolean;
  motivo: string;
}

const MODOS_VALIDOS: readonly ModoAprobacion[] = ["yo", "democratica", "personas"];

/** Cadena finita y positiva (un tope, una cotización). Lo demás vale 0. */
const positivo = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Limpia una lista que viene de fuera: deja cadenas, recorta espacios y quita repetidos. */
function listarLimpio(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const items = valor
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
  return Array.from(new Set(items));
}

/** Rellena lo que falta y recorta los valores raros. Nunca lanza. */
export function validarAjustes(bruto?: Partial<AjustesContenidoVivo> | null): AjustesContenidoVivo {
  if (!bruto || typeof bruto !== "object") {
    return { localPrimero: true, externosPermitidos: [], topeCreditosMes: 0, aprobacion: "yo" };
  }
  const modoValido = typeof bruto.aprobacion === "string" && (MODOS_VALIDOS as readonly string[]).includes(bruto.aprobacion);
  const ajustes: AjustesContenidoVivo = {
    localPrimero: bruto.localPrimero !== false,
    externosPermitidos: listarLimpio(bruto.externosPermitidos),
    topeCreditosMes: positivo(bruto.topeCreditosMes),
    aprobacion: modoValido ? (bruto.aprobacion as ModoAprobacion) : "yo",
  };
  if (bruto.aprobacion === "personas" || Array.isArray(bruto.personas)) {
    ajustes.personas = listarLimpio(bruto.personas);
  }
  return ajustes;
}

/**
 * Lo gastado en el MES calendario del momento dado (`t` y `ahora`, ISO).
 * Los asientos con fecha rota o créditos no positivos no cuentan; nunca lanza.
 */
export function gastadoEnMes(asientos: readonly AsientoCreditos[], ahora: string): number {
  const referencia = new Date(ahora);
  if (Number.isNaN(referencia.getTime())) return 0;
  let total = 0;
  for (const asiento of asientos || []) {
    const fecha = new Date(asiento?.t ?? "");
    if (Number.isNaN(fecha.getTime())) continue;
    if (fecha.getFullYear() !== referencia.getFullYear() || fecha.getMonth() !== referencia.getMonth()) continue;
    total += positivo(asiento.creditos);
  }
  return total;
}

/** Decide si se gasta: cotización, tope del mes y un sí de quien aprueba. */
export function puedeGastar(
  ajustes: AjustesContenidoVivo,
  gastado: number,
  cotizacion: number,
  quien: string,
): VeredictoGasto {
  const a = ajustes || validarAjustes(null);
  const coste = positivo(cotizacion);
  if (coste === 0) return { si: false, motivo: "Nunca se gasta sin cotización: primero se compara la ruta." };
  if (a.topeCreditosMes <= 0) {
    return { si: false, motivo: "Sin tope de créditos no se gasta: pone un tope al mes en los ajustes del ámbito." };
  }
  const gastadoMes = typeof gastado === "number" && Number.isFinite(gastado) ? Math.max(gastado, 0) : 0;
  if (gastadoMes + coste > a.topeCreditosMes) {
    return { si: false, motivo: `El gasto pasa el tope del mes: llevas ${gastadoMes} de ${a.topeCreditosMes} y la cotización pide ${coste}.` };
  }
  if (a.aprobacion === "democratica") {
    return { si: false, motivo: "En aprobación democrática el gasto va a propuesta de la Protomolécula: nadie lo aprueba solo." };
  }
  if (a.aprobacion === "personas") {
    const personas = listarLimpio(a.personas);
    if (personas.length === 0) {
      return { si: false, motivo: "No hay personas con permiso para aprobar créditos: añade alguien en los ajustes." };
    }
    if (!personas.includes(quien)) return { si: false, motivo: `A «${quien}» no le corresponde aprobar este gasto.` };
  }
  return { si: true, motivo: "Dentro del tope del mes y aprobado por quien pide el gasto." };
}
