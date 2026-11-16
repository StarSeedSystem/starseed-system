// (Ola JLA1116A · Tarea JL10) Siembra de `respuestasLaya` del router: pregunta a Laya el punto
// «plan.dificultad» y devuelve sus respuestas tipadas, o null si no llega a tiempo o vienen mal.
// Módulo PURO con dependencias inyectadas (fetch y reloj): sin red, sin disco y sin reloj propio.
// Contrato §2 (architecture/jev-entrena-laya.md): nadie rellenaba `respuestasLaya` en
// `src/ai/astraura/router.ts`; el planificador NUNCA espera a Laya más que el plazo del medio.
import type { RespuestasLaya, RespuestaLaya } from "@/ai/astraura/router-laya";
import { PLAZO_MAX_MS, puntoDecision, type MedioLaya, type PuntoDecision } from "./puntos-decision";
import { preguntarALaya, type DepsLaya } from "./cliente-laya";

/** El punto que afina el plan del router (score «dificultad» + noul «basta_pequeno»). */
export const PUNTO_PLAN: PuntoDecision = puntoDecision("plan.dificultad") as PuntoDecision;

/** Dependencias del planificador: las del cliente de Laya más el medio por el que se pregunta. */
export interface DepsPlan extends DepsLaya {
  medio: MedioLaya;
  /** Lo privado nunca sale de las neuronas ni de los servidores propios (lo decide el cliente). */
  privado?: boolean;
  /** La decisión vive en un turno de conversación: el servidor local puede cargarse con prioridad. */
  conversacion?: boolean;
}

/** Plazo máximo de espera para el medio: el del catálogo del punto, sin inventar otro. */
export function plazoDelPlan(medio: MedioLaya): number {
  return PUNTO_PLAN.plazoMsPorMedio[medio] ?? PLAZO_MAX_MS;
}

const PREGUNTAS_DEL_PLAN: readonly string[] = Object.keys(PUNTO_PLAN.preguntas);

/**
 * Valida las `answers` nativas de Laya para el plan: cada respuesta debe ser un objeto (la forma
 * de `RespuestaLaya`) y tiene que venir al menos una pregunta del punto. Cualquier otra cosa es
 * «mal formada» y devuelve null, para que el router siga con sus reglas.
 */
export function respuestasDePlan(brutas: Record<string, unknown> | null | undefined): RespuestasLaya | null {
  if (!brutas || typeof brutas !== "object" || Array.isArray(brutas)) return null;
  const salida: Record<string, RespuestaLaya> = {};
  let delPlan = 0;
  for (const [nombre, respuesta] of Object.entries(brutas)) {
    if (!respuesta || typeof respuesta !== "object" || Array.isArray(respuesta)) return null;
    salida[nombre] = respuesta as RespuestaLaya;
    if (PREGUNTAS_DEL_PLAN.includes(nombre)) delPlan += 1;
  }
  return delPlan > 0 ? salida : null;
}

/**
 * Pregunta a Laya la dificultad de la tarea y devuelve `RespuestasLaya` listo para
 * `refinarConLaya`, o null si Laya no llegó dentro del plazo del medio (o falló). La carrera
 * contra el reloj inyectado garantiza que el planificador nunca espera más que ese plazo, aunque
 * el cliente caiga del servidor local a la malla.
 */
export async function respuestasParaPlan(textoTarea: string, deps: DepsPlan): Promise<RespuestasLaya | null> {
  const espera = deps.dormir(plazoDelPlan(deps.medio));
  try {
    const salida = await Promise.race([
      preguntarALaya(
        {
          punto: PUNTO_PLAN,
          estado: textoTarea,
          medio: deps.medio,
          privado: deps.privado,
          conversacion: deps.conversacion,
        },
        deps,
      ),
      espera.promesa.then((): null => null),
    ]);
    if (!salida) return null;
    return respuestasDePlan(salida.respuestas);
  } catch {
    return null;
  } finally {
    espera.cancelar();
  }
}
