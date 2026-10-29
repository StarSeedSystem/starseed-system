// Consenso con los modelos de 1,58 bits (tarea C, Ola 1018L): la MISMA pregunta tipada se hace a Laya y al
// modelo pequeño (BitNet/Bonsai/Needle). Si coinciden, vale; si no, manda Laya solo con `answer_confidence`
// (la calibrada, nunca `confidence`) ≥ umbral; si Laya no llegó a tiempo —en CPU tarda segundos: nunca
// bloquea la primera palabra de una conversación—, se acepta lo pequeño solo si su confianza ≥ umbral; si
// no, se escala a la capa siguiente (punto «basico.consenso», respaldo «lo que decida la regla determinista»).
// PURA: sin red, sin disco, sin reloj, sin modelo. Lo privado nunca sale de las neuronas ni de servidores
// propios, y el consenso solo puede SUBIR la privacidad del resultado reportado, nunca bajarla.
import { puntoDecision, UMBRAL_POR_DEFECTO } from "./puntos-decision";

/** Respuesta del modelo pequeño a la misma pregunta tipada; `confianza` y `motor` pueden faltar. */
export interface PequenoConsenso {
  readonly respuesta: string;
  readonly confianza?: number;
  readonly motor?: string;
}

export interface LayaConsenso {
  readonly respuesta: string;
  /** La calibrada: la única con la que se decide con umbral, nunca `confidence`. */
  readonly answer_confidence?: number;
  readonly probabilities?: readonly number[];
}

export interface EntradaConsenso {
  readonly pequeno: PequenoConsenso;
  readonly laya: LayaConsenso | null;
  readonly umbral?: number;
}

export type QuienConsenso = "ambos" | "laya" | "pequeno" | "ninguno";

export interface ResultadoConsenso {
  /** La decisión que entra en la cadena: null solo cuando se escala. */
  readonly decision: string | null;
  readonly quien: QuienConsenso;
  readonly accion: "aceptar" | "escalar";
  readonly motivo: string;
}

/** Umbral del punto «basico.consenso»; lo decide el catálogo (afinable por recalibrado, §6). */
export const umbralConsenso = (): number =>
  puntoDecision("basico.consenso")?.umbral ?? UMBRAL_POR_DEFECTO;

/** Coincidencia sin distinguir mayúsculas ni espacios sobrantes: misma respuesta tipada, mismo contenido. */
export const mismaRespuesta = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Consensúa la decisión de un punto tipado entre Laya y el modelo pequeño:
 * coinciden → se acepta; manda Laya si su `answer_confidence` llega al umbral;
 * sin Laya (no llegó a tiempo) se acepta lo pequeño con confianza al umbral; si no, se escala.
 */
export function consensuar(e: EntradaConsenso): ResultadoConsenso {
  const umbral = e.umbral ?? umbralConsenso();
  const motor = e.pequeno.motor ?? "el modelo pequeño";
  const respuestaPequeno = e.pequeno.respuesta.trim();
  const respuestaLaya = e.laya && typeof e.laya.respuesta === "string" ? e.laya.respuesta.trim() : "";
  const decideCon = (c: number | undefined): c is number =>
    typeof c === "number" && Number.isFinite(c);
  if (respuestaPequeno && respuestaLaya && mismaRespuesta(respuestaPequeno, respuestaLaya))
    return { decision: respuestaPequeno, quien: "ambos", accion: "aceptar",
      motivo: `Laya y ${motor} dan la misma respuesta a la pregunta tipada: vale.` };
  if (!e.laya && respuestaPequeno) {
    const cp = e.pequeno.confianza;
    if (decideCon(cp) && cp >= umbral)
      return { decision: respuestaPequeno, quien: "pequeno", accion: "aceptar",
        motivo: `Laya no llegó a tiempo: se acepta ${motor} con su confianza ` +
          `(${cp.toFixed(2)} ≥ ${umbral.toFixed(2)}).` };
  }
  const cl = e.laya?.answer_confidence;
  // Si el pequeño no dio respuesta no admite mando: ni con Laya segura se decide, se escala.
  if (respuestaPequeno && respuestaLaya && decideCon(cl) && cl >= umbral)
    return { decision: respuestaLaya, quien: "laya", accion: "aceptar",
      motivo: `Criterios distintos: manda Laya con answer_confidence calibrada ` +
        `(${cl.toFixed(2)} ≥ ${umbral.toFixed(2)}).` };
  return { decision: null, quien: "ninguno", accion: "escalar",
    motivo: motivoEscala(e, { motor, umbral, respuestaLaya, respuestaPequeno }) };
}

/** Motivo de escalado con la causa exacta: Laya sin llegar, sin respuesta, sin calibrada o con duda. */
function motivoEscala(
  e: EntradaConsenso, ctx: { motor: string; umbral: number; respuestaLaya: string; respuestaPequeno: string },
): string {
  const cl = e.laya?.answer_confidence;
  if (!e.laya) {
    const cp = e.pequeno.confianza;
    return `Laya no llegó a tiempo y la confianza de ${ctx.motor} ` +
      `${typeof cp === "number" && Number.isFinite(cp) ? `(${cp.toFixed(2)})` : "no llegó"}` +
      ` o su respuesta queda bajo el umbral (${ctx.umbral.toFixed(2)}): se escala.`;
  }
  if (!ctx.respuestaLaya) return "Laya llegó sin respuesta utilizable: se escala.";
  if (!ctx.respuestaPequeno) return "El modelo pequeño respondió vacío y no admite mando: se escala la respuesta de Laya.";
  if (!(typeof cl === "number" && Number.isFinite(cl)))
    return "Criterios distintos y Laya no dio answer_confidence: se escala.";
  return `Criterios distintos y Laya duda (${cl.toFixed(2)} < ${ctx.umbral.toFixed(2)}): se escala.`;
}
