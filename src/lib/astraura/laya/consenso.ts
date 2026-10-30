// Consenso de las decisiones básicas de 1,58 bits con Laya (architecture/laya-y-habilidades.md §4,
// fila «Decisiones básicas de 1,58 bits», Ola 1018L · LYS1018C, tarea C). La MISMA pregunta tipada
// (`choice` del punto `basico.consenso`) va a Laya y al modelo pequeño (BitNet, Bonsai, Needle):
// si coinciden, vale; si no, manda Laya solo con `answer_confidence` (calibrada) ≥ umbral;
// si Laya no llegó a tiempo (en CPU tarda segundos: nunca bloquea la primera palabra), lo pequeño
// entra solo si su confianza ≥ umbral; si no, se escala.
// PURA: sin red, sin disco, sin reloj, sin modelos. Lo privado nunca sale de las neuronas propias.
import { puntoDecision, UMBRAL_POR_DEFECTO } from "./puntos-decision";

/** Respuesta del modelo pequeño de 1,58 bits a la misma pregunta tipada de Laya. */
export interface RespuestaPequeno {
  readonly respuesta: string;
  readonly motor: string; // «bitnet», «bonsai», «needle»…
  /** Confianza del propio motor, si el motor la da: solo cuenta cuando Laya no llegó. */
  readonly confianza?: number;
}

/** Respuesta de Laya a la `choice`: la opción elegida y su `answer_confidence` calibrada. */
export interface RespuestaLayaBasicos {
  readonly respuesta: string;
  readonly answer_confidence: number;
  /** Probabilities reales de la choice, tal como las devuelve la System One. */
  readonly probabilities?: Readonly<Record<string, number>>;
}

export interface EntradaConsenso {
  readonly pequeno: RespuestaPequeno;
  readonly laya: RespuestaLayaBasicos | null;
  readonly umbral: number;
}

export type QuienConsenso = "ambos" | "laya" | "pequeno" | "ninguno";
export type AccionConsenso = "aceptar" | "escalar";

export interface VeredictoConsenso {
  readonly decision: string | null;
  readonly quien: QuienConsenso;
  readonly accion: AccionConsenso;
  readonly motivo: string;
}

/** Texto limpio de una respuesta: vacío cuenta como «no respondió». */
const limpia = (t: unknown): string => (typeof t === "string" ? t.trim() : "");
/** Confianza utilizable: número finito, sin NaN ni infinito. */
const segura = (c: unknown): number | null => (typeof c === "number" && Number.isFinite(c) ? c : null);

/**
 * Cierra el consenso del punto `basico.consenso` (§4). Cuatro ramas:
 * 1. Laya y el pequeño coinciden → se acepta, sin mirar confianzas.
 * 2. Discrepan y Laya llega con `answer_confidence` ≥ umbral → manda Laya.
 * 3. Laya no llegó a tiempo y el pequeño llega con `confianza` ≥ umbral → manda el pequeño.
 * 4. En cualquier otro caso (discrepanza con Laya débil, nadie seguro) → se escala.
 */
export function consensuar(e: EntradaConsenso): VeredictoConsenso {
  const L = e.laya, P = e.pequeno;
  const la = limpia(L?.respuesta), pe = limpia(P.respuesta);
  if (L && la !== "") {
    if (la === pe)
      return { decision: pe, quien: "ambos", accion: "aceptar", motivo: `Coinciden ${P.motor} y Laya en «${pe}»: vale.` };
    // Discrepan: manda Laya solo con su `answer_confidence` (calibrada) por encima del umbral.
    const c = segura(L.answer_confidence);
    if (c !== null && c >= e.umbral)
      return { decision: la, quien: "laya", accion: "aceptar", motivo: `Discrepan (${P.motor} «${pe}», Laya «${la}»): manda Laya con ${c.toFixed(2)} ≥ ${e.umbral.toFixed(2)}.` };
    return {
      decision: null, quien: "ninguno", accion: "escalar",
      motivo: c === null
        ? `Discrepan (${P.motor} «${pe}», Laya «${la}») y Laya no dio answer_confidence: se escala.`
        : `Discrepan (${P.motor} «${pe}», Laya «${la}») y Laya duda (${c.toFixed(2)} < ${e.umbral.toFixed(2)}): se escala.`,
    };
  }
  // Laya no llegó a tiempo (null o sin respuesta): lo pequeño entra solo con confianza ≥ umbral.
  const cP = segura(P?.confianza);
  if (P && cP !== null && cP >= e.umbral)
    return { decision: pe, quien: "pequeno", accion: "aceptar", motivo: `Laya no llegó a tiempo; manda ${P.motor} con ${cP.toFixed(2)} ≥ ${e.umbral.toFixed(2)}.` };
  return {
    decision: null, quien: "ninguno", accion: "escalar",
    motivo: cP === null
      ? `Laya no llegó a tiempo y ${P?.motor ?? "el pequeño"} no dio confianza: se escala.`
      : `Laya no llegó a tiempo y ${P?.motor ?? "el pequeño"} duda (${cP.toFixed(2)} < ${e.umbral.toFixed(2)}): se escala.`,
  };
}

export const UMBRAL_CONSENSO = puntoDecision("basico.consenso")?.umbral ?? UMBRAL_POR_DEFECTO;
