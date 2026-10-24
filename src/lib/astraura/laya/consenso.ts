// Consenso con las decisiones básicas de 1,58 bits (BitNet, Bonsai, Needle) — architecture/laya-y-habilidades.md
// §4, punto «basico.consenso» (Ola 1018L · LYS1018C, tarea C). La MISMA pregunta tipada va a Laya y al modelo
// pequeño: si coinciden, vale; si discrepan, manda Laya solo con su `answer_confidence` (calibrada) ≥ umbral;
// si Laya no llegó a tiempo (en CPU tarda segundos: nunca bloquea la primera palabra), la regla determinista
// acepta la respuesta pequeña solo si su confianza ≥ umbral; y si nadie lo afirma, se escala.
// PURA: sin red, sin disco, sin reloj, sin modelo. Lo privado nunca sale de las neuronas ni de los servidores
// propios, y Laya solo puede SUBIR la privacidad, jamás bajarla.
import { puntoDecision, UMBRAL_POR_DEFECTO } from "./puntos-decision";

/** Con quién queda la decisión del consenso. */
export type QuienConsenso = "ambos" | "laya" | "pequeno" | "ninguno";
/** Qué pasa con la decisión: aceptar lleva `decision`; escalar deja `decision` en null y sube la pregunta. */
export type AccionConsenso = "aceptar" | "escalar";

/** Respuesta del motor pequeño de 1,58 bits (BitNet, Bonsai o Needle) a la pregunta tipada. */
export interface RespuestaPequeno {
  readonly respuesta: string;
  /** Confianza del motor pequeño; si no llegó ninguna, no puede decidir solo (cuenta como 0). */
  readonly confianza?: number;
  /** Qué motor la dio (bitnet-b1.58-2b, bonsai-1.7b, needle-3…): solo para el motivo, no decide. */
  readonly motor: string;
}

/** Respuesta real de Laya a la misma pregunta: probabilidades calibradas de la forma nativa (choice, score o noul). */
export interface RespuestaLayaConsenso {
  readonly respuesta: string;
  /** La que sirve para decidir con umbral: calibrada. La `confidence` cruda no cuenta nunca. */
  readonly answer_confidence?: unknown;
  readonly probabilities?: readonly number[];
}

export interface EntradaConsenso {
  readonly pequeno: RespuestaPequeno;
  readonly laya: RespuestaLayaConsenso | null;
  /** Umbral sobre la confianza; por defecto el del punto «basico.consenso» del catálogo. */
  readonly umbral?: number;
}

export interface ResultadoConsenso {
  /** La respuesta aceptada (ya recortada); null cuando el resultado es escalar. */
  readonly decision: string | null;
  readonly quien: QuienConsenso;
  readonly accion: AccionConsenso;
  readonly motivo: string;
}

/** Umbral por defecto, el del punto «basico.consenso» del catálogo de puntos de decisión. */
export const UMBRAL_CONSENSO: number = puntoDecision("basico.consenso")?.umbral ?? UMBRAL_POR_DEFECTO;

/** Recorta, quita mayúsculas y espacios dobles: «Mantener el ritmo» y «mantener el ritmo» coinciden. */
function normalizar(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

/** La respuesta de Laya coincide con la del pequeño (mismo texto normalizado); sin Laya no puede haber coincidencia. */
function respuestasCoinciden(laya: RespuestaLayaConsenso | null, pequeno: string): boolean {
  return laya !== null && normalizar(laya.respuesta) === normalizar(pequeno) && normalizar(pequeno) !== "";
}

/** Confianza usable: número finito. La ausente o no calibrada cuenta como que no llegó. */
function confianzaUsable(c: unknown): number | null {
  return typeof c === "number" && Number.isFinite(c) ? c : null;
}

const texto = (t: string) => `«${t.trim()}»`;

/**
 * Decide el consenso sobre una pregunta tipada de decisión básica (la MISMA pregunta a Laya y al modelo
 * pequeño de 1,58 bits). Cuatro ramas: (1) coinciden → aceptar; (2) discrepan y Laya llega segura con
 * `answer_confidence` ≥ umbral → manda Laya; (3) Laya no llegó (o no dio `answer_confidence` calibrada)
 * y la confianza del pequeño ≥ umbral → manda el pequeño; (4) nadie lo afirma con seguridad → escalar
 * («basico.consenso».siDuda = "regla": lo que decida la regla determinista de quien llama).
 */
export function consensuar(e: EntradaConsenso): ResultadoConsenso {
  const umbral = e.umbral ?? UMBRAL_CONSENSO;
  const respuestaPequena = e.pequeno.respuesta.trim();
  if (respuestasCoinciden(e.laya, e.pequeno.respuesta)) {
    return {
      decision: respuestaPequena, quien: "ambos", accion: "aceptar",
      motivo: `Coincide la respuesta con Laya y ${e.pequeno.motor}: ${texto(respuestaPequena)}.`,
    };
  }
  const cL = confianzaUsable(e.laya?.answer_confidence);
  if (e.laya !== null && cL !== null) {
    if (cL >= umbral) {
      return {
        decision: e.laya.respuesta.trim(), quien: "laya", accion: "aceptar",
        motivo: `Discrepan Laya y ${e.pequeno.motor}; manda Laya (answer_confidence ${cL.toFixed(2)} ≥ ${umbral.toFixed(2)}): ${texto(e.laya.respuesta)}.`,
      };
    }
    return {
      decision: null, quien: "ninguno", accion: "escalar",
      motivo: `Discrepan Laya y ${e.pequeno.motor}; Laya duda (answer_confidence ${cL.toFixed(2)} < ${umbral.toFixed(2)}) y la palabra del pequeño por sí sola no cuela: se escala la pregunta («basico.consenso»).`,
    };
  }
  // Laya no llegó a tiempo («laya: null») o llegó sin la calibrada: su veredicto no es usable y la
  // regla determinista decide con la confianza del pequeño (respaldo del punto «basico.consenso»).
  const sinVeredicto = e.laya === null ? "Laya no llegó a tiempo" : "Laya llegó sin answer_confidence calibrada";
  const cP = confianzaUsable(e.pequeno.confianza);
  if (cP !== null && cP >= umbral) {
    return {
      decision: respuestaPequena, quien: "pequeno", accion: "aceptar",
      motivo: `${sinVeredicto}; la regla determinista acepta a ${e.pequeno.motor} (confianza ${cP.toFixed(2)} ≥ ${umbral.toFixed(2)}): ${texto(respuestaPequena)}.`,
    };
  }
  return {
    decision: null, quien: "ninguno", accion: "escalar",
    motivo: `${sinVeredicto} y ${e.pequeno.motor}${cP === null ? " no dio confianza" : ` queda baja (${cP.toFixed(2)} < ${umbral.toFixed(2)})`}: se escala («basico.consenso»).`,
  };
}
