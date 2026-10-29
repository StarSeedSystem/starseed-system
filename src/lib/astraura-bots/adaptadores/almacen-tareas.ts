"use client";
/**
 * Almacén de tareas POR BOT (BOT1011X · architecture/astraura-bots.md §8).
 * localStorage `starseed.astraura.bots.tareas.v1` (personal) + espejo best-effort a la
 * cuenta con `mergeUserPrefs`. La clave es el bot DIRECTOR de la tarea (`tarea.director`),
 * que es quien la gobierna en Genesis o PoliGenesis. SSR-safe y con try/catch en todo:
 * el espejo nunca lanza ni bloquea. El estado de la tarea no se guarda: se recalcula con
 * `estadoDe(tarea, verif)` para que una verificación vieja no dé una tarea por hecha.
 */
import type { Tarea } from "../tipos";
import type { EstadoVerificacion } from "../tareas-bot";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

export const CLAVE_TAREAS = "starseed.astraura.bots.tareas.v1";
export const EVENTO_TAREAS = "starseed:astraura-bots-tareas";
export const VERSION_TAREAS = 1;

export interface TareaGuardada {
  tarea: Tarea;
  verif?: EstadoVerificacion;
  actualizado: number;
}

interface Envoltorio {
  version: number;
  porBot: Record<string, TareaGuardada[]>;
  actualizado: number;
}

const vacio = (): Envoltorio => ({ version: VERSION_TAREAS, porBot: {}, actualizado: 0 });

function esTarea(x: unknown): x is Tarea {
  if (!x || typeof x !== "object") return false;
  const t = x as Partial<Tarea>;
  return typeof t.id === "string" && t.id.length > 0 &&
    typeof t.director === "string" && t.director.length > 0 &&
    Array.isArray(t.criterios) && Array.isArray(t.agentes);
}

function esGuardada(x: unknown): x is TareaGuardada {
  if (!x || typeof x !== "object") return false;
  const g = x as Partial<TareaGuardada>;
  return esTarea(g.tarea) && typeof g.actualizado === "number";
}

/** Lee el envoltorio, descartando lo que no tenga forma de tarea (una migración nunca pisa lo bueno). */
function leerEnvoltorio(): Envoltorio {
  if (typeof window === "undefined") return vacio();
  try {
    const crudo: unknown = JSON.parse(window.localStorage.getItem(CLAVE_TAREAS) ?? "null");
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return vacio();
    const bruto = crudo as { porBot?: unknown; actualizado?: unknown };
    const porBot: Record<string, TareaGuardada[]> = {};
    if (bruto.porBot && typeof bruto.porBot === "object" && !Array.isArray(bruto.porBot)) {
      for (const [botId, lista] of Object.entries(bruto.porBot as Record<string, unknown>)) {
        if (!botId || !Array.isArray(lista)) continue;
        porBot[botId] = lista.filter(esGuardada);
      }
    }
    return {
      version: VERSION_TAREAS,
      porBot,
      actualizado: typeof bruto.actualizado === "number" ? bruto.actualizado : 0,
    };
  } catch {
    return vacio();
  }
}

/** Tareas del bot director, tal cual se guardaron (copia: nadie muta el almacén por accidente). */
export function listar(botId: string): TareaGuardada[] {
  return [...(leerEnvoltorio().porBot[botId] ?? [])];
}

/** Guarda o actualiza una tarea bajo su bot director, emite el evento y espeja a la cuenta. */
export function guardar(tarea: Tarea, verif?: EstadoVerificacion): void {
  if (typeof window === "undefined" || !esTarea(tarea)) return;
  const envoltorio = leerEnvoltorio();
  const ahora = Date.now();
  const lista = envoltorio.porBot[tarea.director] ?? [];
  const previa = lista.find((g) => g.tarea.id === tarea.id);
  const entrada: TareaGuardada = {
    tarea,
    verif: verif && verif.tareaId === tarea.id ? verif : previa?.verif,
    actualizado: ahora,
  };
  envoltorio.porBot[tarea.director] = [...lista.filter((g) => g.tarea.id !== tarea.id), entrada];
  envoltorio.actualizado = ahora;
  try {
    window.localStorage.setItem(CLAVE_TAREAS, JSON.stringify(envoltorio));
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_TAREAS, { detail: { botId: tarea.director } }));
  } catch {
    /* sin observadores no pasa nada */
  }
  void mergeUserPrefs({ [CLAVE_TAREAS]: envoltorio }).catch(() => undefined);
}

/** Suscripción a cambios (mismo documento). Devuelve la desuscripción. */
export function suscribirTareas(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENTO_TAREAS, cb);
  return () => window.removeEventListener(EVENTO_TAREAS, cb);
}
