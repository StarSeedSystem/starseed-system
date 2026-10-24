// Escalado por la cadena de capas del plan (architecture/laya-y-habilidades.md §4, Ola 1018L · LYS1018D, tarea D).
// Decide «¿basta la respuesta?» con el noul de Laya del punto `respuesta.basta` y, si Laya duda o no llega
// (en CPU tarda segundos: nunca bloquea la primera palabra), sube por la cadena de respaldo del planificador.
// PURA: sin red, sin disco, sin reloj, sin modelo. Lo privado nunca sale hacia la nube y solo se SUBE la privacidad.
import type { Capa } from "@/lib/astraura/capas/catalogo";
import { puntoDecision, UMBRAL_POR_DEFECTO } from "./puntos-decision";

/** Cadena de subida de las respuestas; voz y adaptador no responden: no participan. */
export const CADENA_SUBIDA: readonly Capa[] = ["reflejo", "memoria", "palabra", "razon", "profunda"];

/** Dónde corre cada paso del plan: «api-gratis» es la nube libre (enrutador gratuito o API en la nube). */
export type DondePlan = "local" | "par" | "servidor-starseed" | "servidor-propio" | "api-gratis";

/** Un paso de la cadena de respaldo del planificador, de abajo (capa baja) hacia arriba. */
export interface PasoPlanLaya {
  readonly capa: Capa;
  readonly modelo: string;
  readonly donde: DondePlan;
}

/** Respuesta real de Laya al noul «¿basta?» del punto `respuesta.basta`: probabilidades calibradas. */
export interface RespuestaLayaBasta {
  readonly answer_confidence: number;
  readonly probabilities?: readonly number[];
}

export interface EntradaEscalado {
  readonly plan: readonly PasoPlanLaya[];
  readonly capaActual: Capa;
  readonly privada: boolean;
  readonly laya: RespuestaLayaBasta | null;
  readonly intentos: number;
}

export type ResultadoEscalado =
  | { readonly subirA: Capa; readonly motivo: string }
  | { readonly aceptar: true; readonly motivo?: string };

export const MAX_SUBIDAS = 3;

/**
 * Da el paso siguiente con el veredicto de Laya: si el noul «¿basta?» llega con
 * `answer_confidence` (calibrada, nunca `confidence`) por encima del umbral del punto,
 * se acepta; si no, se sube a la capa siguiente del plan. Nunca sube más de 3 veces
 * (a partir de ahí se queda y lo dice) y, si la capa siguiente va a la nube y el estado
 * es privado, se queda también: lo privado no sale de las neuronas y servidores propios.
 */
export function siguientePaso(e: EntradaEscalado): ResultadoEscalado {
  const umbral = puntoDecision("respuesta.basta")?.umbral ?? UMBRAL_POR_DEFECTO;
  const c = e.laya?.answer_confidence;
  if (e.laya && typeof c === "number" && Number.isFinite(c) && c >= umbral) return { aceptar: true };
  const duda = !e.laya
    ? "Laya no llegó a tiempo"
    : typeof c !== "number" || !Number.isFinite(c)
      ? "Laya no dio answer_confidence"
      : `Laya duda (${c.toFixed(2)} < ${umbral.toFixed(2)})`;
  if (e.intentos >= MAX_SUBIDAS)
    return { aceptar: true, motivo: `${duda}: techo de ${MAX_SUBIDAS} subidas, se queda en «${e.capaActual}».` };
  const destino = destinoSubida(e.plan, e.capaActual);
  if (!destino)
    return { aceptar: true, motivo: `${duda}: no hay capa más alta en el plan, se queda en «${e.capaActual}».` };
  if (e.privada && destino.donde === "api-gratis")
    return {
      aceptar: true,
      motivo: `${duda}: la capa siguiente («${destino.capa}» en nube) rompería la privacidad y el estado es privado; se queda en «${e.capaActual}».`,
    };
  return { subirA: destino.capa, motivo: `${duda}: se sube a «${destino.capa}» (${destino.modelo} en ${destino.donde}).` };
}

/** Primer paso del plan que queda por ENCIMA de la capa actual en la cadena; null si no hay más altura. */
export function destinoSubida(plan: readonly PasoPlanLaya[], capaActual: Capa): PasoPlanLaya | null {
  const actual = CADENA_SUBIDA.indexOf(capaActual);
  if (actual < 0) return null;
  return plan.find((paso) => CADENA_SUBIDA.indexOf(paso.capa) > actual) ?? null;
}
