/**
 * Ajustes de «Contenido vivo» por ámbito y libro de créditos (CVV1028, tarea C).
 * Módulo PURO: sin red, sin disco y sin `node:*`. La persistencia la decide quien llama.
 * Contrato §4: local primero, externos permitidos, tope mensual y quién aprueba.
 * Sin tope no se gasta; en democrática hace falta una propuesta.
 */
import type { TareaViva } from "./tipos";

export type AprobacionContenidoVivo = "yo" | "democratica" | "personas";

export interface AjustesContenidoVivo {
  localPrimero: boolean;
  externosPermitidos: string[];
  topeCreditosMes: number;
  aprobacion: AprobacionContenidoVivo;
  personas?: string[];
}

/** Asiento del libro de créditos. `t` es la marca de tiempo en milisegundos. */
export interface AsientoCreditos {
  t: number;
  /** Id del ámbito: cuenta, página o grupo. */
  ambito: string;
  servicio: string;
  modelo: string;
  creditos: number;
  tarea: TareaViva;
  aprobadoPor: string;
}

export interface DecisionGasto {
  si: boolean;
  motivo: string;
}

const MAX_EXTERNOS = 20, MAX_PERSONAS = 50, MAX_TEXTO = 80, MAX_TOPE = 10_000_000;

/** Recorta, descarta vacíos, deduplica y limita el tamaño. */
function listaTexto(valor: unknown, maximo: number): string[] {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const item of valor) {
    if (typeof item !== "string") continue;
    const texto = item.trim().slice(0, MAX_TEXTO);
    if (!texto || vistos.has(texto)) continue;
    vistos.add(texto);
    salida.push(texto);
    if (salida.length >= maximo) break;
  }
  return salida;
}

function aNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string" || valor.trim() === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/** Clave de mes en UTC, igual en cualquier aparato. */
function mesDe(t: unknown): string | null {
  const fecha = t instanceof Date ? t : typeof t === "number" ? new Date(t) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  return `${fecha.getUTCFullYear()}-${fecha.getUTCMonth()}`;
}

/** Rellena lo que falta y recorta valores raros, sin lanzar nunca. */
export function validarAjustes(entrada: unknown): AjustesContenidoVivo {
  const objeto = entrada && typeof entrada === "object" && !Array.isArray(entrada)
    ? (entrada as Record<string, unknown>) : {};
  const aprobacion: AprobacionContenidoVivo =
    objeto.aprobacion === "democratica" || objeto.aprobacion === "personas" ? objeto.aprobacion : "yo";
  const personas = listaTexto(objeto.personas, MAX_PERSONAS);
  const tope = aNumero(objeto.topeCreditosMes);
  const topeLimpio = tope === null ? 0 : Math.min(MAX_TOPE, Math.max(0, Math.floor(tope)));
  return {
    localPrimero: objeto.localPrimero !== false,
    externosPermitidos: listaTexto(objeto.externosPermitidos, MAX_EXTERNOS),
    topeCreditosMes: topeLimpio,
    aprobacion,
    ...(personas.length > 0 ? { personas } : {}),
  };
}

/** Suma los créditos del mes de `ahora`, comparando en UTC. Ignora asientos rotos. */
export function gastadoEnMes(asientos: readonly AsientoCreditos[], ahora: number | Date): number {
  const mes = mesDe(ahora);
  if (mes === null) return 0;
  let total = 0;
  for (const asiento of asientos) {
    if (!asiento || mesDe(asiento.t) !== mes) continue;
    if (typeof asiento.creditos === "number" && Number.isFinite(asiento.creditos)) total += asiento.creditos;
  }
  return total;
}

/** Decide si se puede gastar la cotización. Sin tope no se gasta. */
export function puedeGastar(ajustes: AjustesContenidoVivo, gastado: number, cotizacion: number, quien: string): DecisionGasto {
  const limpios = validarAjustes(ajustes);
  if (!Number.isFinite(cotizacion) || cotizacion < 0) return { si: false, motivo: "La cotización no es válida: no se gasta sin saber cuánto cuesta." };
  if (cotizacion === 0) return { si: true, motivo: "La cotización no gasta créditos." };
  if (limpios.topeCreditosMes <= 0) return { si: false, motivo: "Este ámbito no tiene tope de créditos al mes: no se gasta." };
  const usado = Number.isFinite(gastado) ? Math.max(0, gastado) : 0;
  if (usado + cotizacion > limpios.topeCreditosMes) {
    const queda = Math.max(0, limpios.topeCreditosMes - usado);
    return { si: false, motivo: `La cotización (${cotizacion}) supera lo que queda del tope mensual (${queda}).` };
  }
  if (limpios.aprobacion === "democratica") return { si: false, motivo: "Hace falta una propuesta democrática y su votación antes de gastar." };
  const persona = typeof quien === "string" ? quien.trim() : "";
  if (!persona) return { si: false, motivo: "Hace falta saber quién aprueba el gasto." };
  if (limpios.aprobacion === "personas") {
    const autorizadas = limpios.personas ?? [];
    if (!autorizadas.includes(persona)) return { si: false, motivo: `«${persona}» no está entre las personas con permiso para aprobar este gasto.` };
    return { si: true, motivo: `«${persona}» tiene permiso y queda saldo en el tope mensual.` };
  }
  return { si: true, motivo: "Aprueba la persona dueña del ámbito y queda saldo en el tope mensual." };
}
