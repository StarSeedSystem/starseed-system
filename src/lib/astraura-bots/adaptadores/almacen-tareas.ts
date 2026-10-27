"use client";
/**
 * Almacén de tareas por bot (BOT1011X · architecture/astraura-bots.md §8).
 * localStorage personal (`starseed.astraura.bots.tareas.v1`); con sesión se
 * espeja best-effort en `user_settings.prefs` por `mergeUserPrefs`. SSR-safe:
 * nunca lanza ni bloquea. El estado NO se confía a lo guardado: se recalcula
 * con `estadoDe` contra la propia tarea y su verificación.
 */
import type { EstadoVerificacion } from "../tareas-bot";
import type { EstadoTarea, Tarea } from "../tipos";
import { estadoDe } from "../tareas-bot";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

export const CLAVE_TAREAS = "starseed.astraura.bots.tareas.v1";
export const EVENTO_TAREAS = "starseed:astraura-tareas";

/** Lo guardado de una tarea: la tarea, su verificación y cuándo cambió. */
export interface EntradaTarea {
  tarea: Tarea;
  verif?: EstadoVerificacion;
  actualizado: number;
}

/** Lo que ve la UI: el estado se recalcula, el guardado no manda. */
export interface TareaConEstado extends EntradaTarea {
  estado: EstadoTarea;
}

interface Envoltorio {
  version: 1;
  porBot: Record<string, EntradaTarea[]>;
}

const vacio = (): Envoltorio => ({ version: 1, porBot: {} });

/** Guarda en `porBot[tarea.director]`; el bot director es el dueño de sus tareas. */
export function guardar(tarea: Tarea, verif?: EstadoVerificacion, ahora = Date.now()): TareaConEstado {
  const e = leer(), botId = tarea.director, lista = e.porBot[botId] ?? [];
  const entrada: EntradaTarea = { tarea, ...(verif ? { verif } : {}), actualizado: ahora };
  const i = lista.findIndex((x) => x.tarea.id === tarea.id);
  const siguiente = i >= 0 ? lista.map((x, j) => (j === i ? entrada : x)) : [entrada, ...lista];
  escribir({ ...e, porBot: { ...e.porBot, [botId]: siguiente } });
  return { ...entrada, estado: estadoDe(tarea, verif) };
}

/** Tareas de un bot, la más reciente primero; el estado SIEMPRE se recalcula. */
export function listar(botId: string): TareaConEstado[] {
  return [...(leer().porBot[botId] ?? [])]
    .sort((a, b) => b.actualizado - a.actualizado)
    .map((e) => ({ ...e, estado: estadoDe(e.tarea, e.verif) }));
}

/** Avisos del almacén (mismo documento). Devuelve la desuscripción. */
export function suscribirTareas(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENTO_TAREAS, cb);
  return () => window.removeEventListener(EVENTO_TAREAS, cb);
}

function esEntrada(x: unknown): x is EntradaTarea {
  if (!x || typeof x !== "object") return false;
  const t = (x as { tarea?: unknown }).tarea;
  return !!t && typeof t === "object"
    && typeof (t as { id?: unknown }).id === "string"
    && typeof (t as { director?: unknown }).director === "string";
}

function leer(): Envoltorio {
  if (typeof window === "undefined") return vacio();
  try {
    const crudo: unknown = JSON.parse(window.localStorage.getItem(CLAVE_TAREAS) ?? "null");
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return vacio();
    const porBot = (crudo as { porBot?: unknown }).porBot;
    if (!porBot || typeof porBot !== "object" || Array.isArray(porBot)) return vacio();
    const limpio: Record<string, EntradaTarea[]> = {};
    for (const [bot, lista] of Object.entries(porBot as Record<string, unknown>)) {
      if (Array.isArray(lista)) limpio[bot] = lista.filter(esEntrada);
    }
    return { version: 1, porBot: limpio };
  } catch {
    return vacio();
  }
}

function escribir(e: Envoltorio): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE_TAREAS, JSON.stringify(e));
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_TAREAS));
  } catch {
    /* sin observadores no pasa nada */
  }
  try {
    void mergeUserPrefs({ [CLAVE_TAREAS]: e }).catch(() => undefined);
  } catch {
    /* sin sesión o sin red: lo local ya está guardado */
  }
}
