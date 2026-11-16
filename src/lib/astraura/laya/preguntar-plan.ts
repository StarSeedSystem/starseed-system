// (Ola 1018L · Tarea JLA1116A) Módulo PURO para solicitar y procesar respuestasLaya.
// Inyecta dependencias para mantener la pureza y permitir pruebas con fetch y reloj falsos.
import type { PerfilMedio } from "@/lib/astraura/capas/perfil-medio";
import { preguntarALaya, type DepsLaya, type SalidaLaya } from "./cliente-laya";
import { puntoDecision, type IdPuntoDecision } from "./puntos-decision";
import { refinarConLaya, type RespuestasLaya } from "@/ai/astraura/router-laya";
import type { TaskProfile } from "@/ai/astraura/router";

/**
 * Solicita respuestas a Laya para el punto de plan.dificultad y refina el perfil.
 * Las dependencias (fetch, reloj, etc.) se inyectan para permitir pruebas.
 */
export async function respuestasParaPlan(
  textoTarea: string,
  deps: DepsLaya,
  medio: "a1" | "mac" | "navegador" | "malla" = "a1",
): Promise<TaskProfile | null> {
  const punto = puntoDecision("plan.dificultad");
  if (!punto) return null;

  try {
    const salida = await preguntarALaya(
      {
        punto: "plan.dificultad",
        estado: { texto: textoTarea },
        medio,
        privado: false,
      },
      deps
    );

    if (!salida.respuestas) return null;

    // refinarConLaya maneja internamente la lógica de validación
    return refinarConLaya({ difficulty: 0.5 } as TaskProfile, salida.respuestas);
  } catch {
    return null;
  }
}
