// Planificador con Laya (Ola 1018L · Tarea F): pregunta al punto «plan.dificultad»
// y devuelve las respuestas (dificultad + basta_pequeno) o null si no llega a tiempo.
// Módulo puro: fetch y reloj INYECTADOS; sin red, sin disco ni reloj propio.
import { preguntarALaya, puntoDeLlamada, URL_LAYA_LOCAL, type SalidaLaya, type DepsLaya } from "./cliente-laya";
import { refinarConLaya, type RespuestasLaya } from "../../ai/astraura/router-laya";
import type { TaskProfile } from "../../ai/astraura/router";

export interface DepsPlanificador extends DepsLaya {
  planLaya?: DepsLaya["planLaya"];
}

const PUNTO_PLAN = puntoDeLlamada("plan.dificultad");

function conPlazo(
  trabajo: Promise<unknown>,
  ms: number,
  ahora: () => number,
  dormir: (ms: number) => Siesta,
): Promise<unknown> {
  const inicio = ahora();
  const msDe = (): number => Math.max(0, ahora() - inicio);
  const espera = dormir(ms);
  try {
    return Promise.race([trabajo, espera.promesa.then((): unknown => null)]);
  } finally {
    espera.cancelar();
  }
}

interface Siesta {
  promesa: Promise<void>;
  cancelar: () => void;
}

async function preguntarLayaConPlazo(
  textoTarea: string,
  estados: unknown,
  deps: DepsPlanificador,
  medio: DepsLaya["medio"],
): Promise<SalidaLaya> {
  const plazoBase = PUNTO_PLAN.plazoMsPorMedio[medio] ?? 30_000;
  const cuerpo = JSON.stringify({
    state: estados,
    questions: {
      dificultad: {
        type: "score",
        instructions: "¿Qué dificultad tiene lo que se pide?",
        criteria: ["baja", "media", "alta"],
      },
      basta_pequeno: {
        type: "noul",
        instructions: "¿Basta un modelo pequeño para responder bien a esto?",
      },
    },
  });

  return preguntarALaya(
    {
      punto: "plan.dificultad",
      estado: estados ?? textoTarea,
      medio,
    },
    deps,
  );
}

export async function respuestasParaPlan(
  textoTarea: string,
  deps: DepsPlanificador,
  clasificacion: TaskProfile,
  medio?: DepsLaya["medio"],
): Promise<RespuestasLaya | null> {
  try {
    const salida = await preguntarLayaConPlazo(textoTarea, clasificacion, deps, medio ?? "a1");
    if (!salida.respuestas) return null;
    return salida.respuestas as RespuestasLaya;
  } catch {
    return null;
  }
}

export async function preguntarALayaConRelevo(
  textoTarea: string,
  deps: DepsPlanificador & { relevoMalla: (cuerpo: string) => Promise<unknown> },
  clasificacion: TaskProfile,
): Promise<RespuestasLaya | null> {
  const salida = await preguntarLayaConPlazo(textoTarea, clasificacion, deps, "malla");
  if (!salida.respuestas) return null;
  return salida.respuestas as RespuestasLaya;
}