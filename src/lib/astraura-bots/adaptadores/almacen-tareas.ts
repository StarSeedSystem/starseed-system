/**
 * Bots/dots de Astraura · ALMACENAMIENTO DE TAREAS (BOT1011X).
 * Contrato: architecture/astraura-bots.md §8 tareas con director.
 * Almacena tareas por bot en localStorage con espejo best-effort en user_settings.prefs.
 * Ahora también almacena verificaciones de criterios.
 */

import { Tarea } from "../tipos";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

const LOCAL_STORAGE_KEY = "starseed.astraura.bots.tareas.v1";
const PREFS_KEY = "astraura.bots.tareas";

type BotStorage = {
  tareas: Tarea[];
  verificaciones: Record<string, Record<number, { verificador: string; timestamp: number }>>;
};

/** Obtiene el estado de almacenamiento para un bot. */
function obtenerEstadoBot(botId: string): BotStorage {
  const json = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!json) {
    return { tareas: [], verificaciones: {} };
  }
  try {
    const obj = JSON.parse(json);
    const estado = obj[botId];
    if (estado && typeof estado === "object") {
      // Asegurarnos de que tenga la estructura correcta
      const tareas = Array.isArray(estado.tareas) ? estado.tareas : [];
      const verificaciones = estado.verificaciones && typeof estado.verificaciones === "object" ? estado.verificaciones : {};
      return { tareas, verificaciones };
    }
    return { tareas: [], verificaciones: {} };
  } catch {
    return { tareas: [], verificaciones: {} };
  }
}

/** Guarda el estado de almacenamiento para un bot. */
function guardarEstadoBot(botId: string, estado: BotStorage): void {
  const json = localStorage.getItem(LOCAL_STORAGE_KEY);
  const obj = json ? JSON.parse(json) : {};
  obj[botId] = estado;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(obj));

  // Espejo best-effort en user_settings.prefs (solo tareas)
  try {
    mergeUserPrefs({ [PREFS_KEY]: Object.fromEntries(
      Object.entries(obj).map(([bid, est]) => [bid, est.tareas])
    )});
  } catch (e) {
    // Ignorar errores de espejo (best-effort)
    console.warn("Failed to mirror tasks to prefs:", e);
  }
}

/** Lista las tareas de un bot. */
export function listar(botId: string): Tarea[] {
  return obtenerEstadoBot(botId).tareas;
}

/** Guarda una nueva tarea. */
export function guardar(tarea: Tarea, verif: boolean): void {
  const estado = obtenerEstadoBot(tarea.director);
  // Evitar duplicados por ID
  if (!estado.tareas.some((t) => t.id === tarea.id)) {
    estado.tareas.push(tarea);
    guardarEstadoBot(tarea.director, estado);
  }
}

/** Verifica un criterio de una tarea. */
export function verificarCriterio(tareaId: string, indiceCriterio: number, verificadorId: string): void {
  // Buscar el bot que contiene esta tarea
  const json = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!json) return;
  try {
    const obj = JSON.parse(json);
    let botIdEncontrado: string | null = null;
    for (const [bid, estado] of Object.entries(obj)) {
      if (estado.tareas && Array.isArray(estado.tareas)) {
        const tarea = estado.tareas.find((t) => t.id === tareaId);
        if (tarea) {
          botIdEncontrado = bid;
          break;
        }
      }
    }
    if (!botIdEncontrado) return;

    const estado = obtenerEstadoBot(botIdEncontrado);
    if (!estado.verificaciones[tareaId]) {
      estado.verificaciones[tareaId] = {};
    }
    estado.verificaciones[tareaId][indiceCriterio] = {
      verificador: verificadorId,
      timestamp: Date.now(),
    };
    guardarEstadoBot(botIdEncontrado, estado);
  } catch (e) {
    console.error("Error al verificar criterio:", e);
  }
}

/** Obtiene las verificaciones de criterios para un bot. */
export function obtenerVerificaciones(botId: string): Record<string, Record<number, { verificador: string; timestamp: number }>> {
  return obtenerEstadoBot(botId).verificaciones;
}