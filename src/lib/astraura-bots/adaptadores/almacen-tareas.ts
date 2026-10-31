"use client";
/**
 * Tareas por bot (BOT1011X · contrato architecture/astraura-bots.md §8).
 * Cada tarea pertenece al bot que la dirige (`tarea.director`). Se guarda en el
 * localStorage de ESTE aparato y, con sesión, se espeja best-effort a la cuenta
 * con `mergeUserPrefs` (el espejo nunca lanza ni bloquea el guardado local).
 * Un bot de grupo NO usa esta clave personal: sus tareas viven en su entidad.
 */
import type { Tarea } from "../tipos";
import type { EstadoVerificacion } from "../tareas-bot";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

export const CLAVE_TAREAS = "starseed.astraura.bots.tareas.v1";
export const EVENTO_TAREAS = "starseed:astraura-bots-tareas";

export interface TareaGuardada {
  tarea: Tarea;
  verificacion?: EstadoVerificacion;
}

interface Envoltorio {
  version: number;
  porBot: Record<string, TareaGuardada[]>;
}

const vacio = (): Envoltorio => ({ version: 1, porBot: {} });

function esTarea(x: unknown): x is Tarea {
  if (!x || typeof x !== "object") return false;
  const t = x as { id?: unknown; titulo?: unknown; criterios?: unknown; director?: unknown };
  return typeof t.id === "string" && typeof t.titulo === "string" &&
    typeof t.director === "string" && Array.isArray(t.criterios);
}

function esVerificacion(x: unknown): x is EstadoVerificacion {
  if (!x || typeof x !== "object") return false;
  const v = x as { tareaId?: unknown; criterios?: unknown; marcas?: unknown };
  return typeof v.tareaId === "string" && Array.isArray(v.criterios) &&
    !!v.marcas && typeof v.marcas === "object";
}

function leer(): Envoltorio {
  if (typeof window === "undefined") return vacio();
  try {
    const bruto = window.localStorage.getItem(CLAVE_TAREAS);
    const crudo: unknown = bruto === null ? null : JSON.parse(bruto);
    if (!crudo || typeof crudo !== "object") return vacio();
    const crudoPorBot = (crudo as { porBot?: unknown }).porBot;
    const porBot: Record<string, TareaGuardada[]> = {};
    if (crudoPorBot && typeof crudoPorBot === "object" && !Array.isArray(crudoPorBot)) {
      for (const [botId, lista] of Object.entries(crudoPorBot as Record<string, unknown>)) {
        if (!Array.isArray(lista)) continue;
        porBot[botId] = lista.flatMap((x): TareaGuardada[] => {
          if (!x || typeof x !== "object") return [];
          const g = x as { tarea?: unknown; verificacion?: unknown };
          if (!esTarea(g.tarea)) return [];
          return [{ tarea: g.tarea, verificacion: esVerificacion(g.verificacion) ? g.verificacion : undefined }];
        });
      }
    }
    return { version: 1, porBot };
  } catch {
    return vacio();
  }
}

/** Tareas que dirige ese bot, en el orden en que se guardaron. */
export function listar(botId: string): TareaGuardada[] {
  return leer().porBot[botId] ?? [];
}

/** Alta o actualización por `tarea.id` dentro del bot que la dirige. */
export function guardar(tarea: Tarea, verif?: EstadoVerificacion): void {
  if (typeof window === "undefined") return;
  const actual = leer();
  const botId = tarea.director;
  const previas = actual.porBot[botId] ?? [];
  const entrada: TareaGuardada = verif ? { tarea, verificacion: verif } : { tarea };
  const lista = previas.some((g) => g.tarea.id === tarea.id)
    ? previas.map((g) => (g.tarea.id === tarea.id ? entrada : g))
    : [...previas, entrada];
  const envoltorio: Envoltorio = { version: 1, porBot: { ...actual.porBot, [botId]: lista } };
  try {
    window.localStorage.setItem(CLAVE_TAREAS, JSON.stringify(envoltorio));
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_TAREAS));
  } catch {
    /* sin observadores no pasa nada */
  }
  void mergeUserPrefs({ [CLAVE_TAREAS]: envoltorio }).catch(() => undefined);
}

/** Cambios del almacén en esta pestaña. Devuelve la desuscripción. */
export function suscribirTareas(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENTO_TAREAS, cb);
  return () => window.removeEventListener(EVENTO_TAREAS, cb);
}
