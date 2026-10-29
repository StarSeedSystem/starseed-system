"use client";
/**
 * Almacén de TAREAS por bot (BOT1011X · contrato architecture/astraura-bots.md §8).
 *
 * Cada bot director guarda sus tareas y su verificación en el `localStorage` de este aparato,
 * bajo `starseed.astraura.bots.tareas.v1`. Con sesión, el envoltorio entero se espeja de forma
 * best-effort a `user_settings.prefs` con `mergeUserPrefs`; sin red o sin sesión, el guardado
 * local sigue funcionando. SSR-safe: nunca lanza hacia la interfaz.
 */
import type { Tarea } from "../tipos";
import type { EstadoVerificacion } from "../tareas-bot";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

export const CLAVE_TAREAS = "starseed.astraura.bots.tareas.v1";
export const EVENTO_TAREAS = "starseed:astraura-bots-tareas";
const VERSION = 1;

export interface RegistroTarea {
  tarea: Tarea;
  verif?: EstadoVerificacion;
}

interface Envoltorio {
  version: number;
  porBot: Record<string, RegistroTarea[]>;
  actualizado: Record<string, number>;
}

const vacio = (): Envoltorio => ({ version: VERSION, porBot: {}, actualizado: {} });

function esRegistro(x: unknown): x is RegistroTarea {
  if (!x || typeof x !== "object") return false;
  const r = x as { tarea?: unknown; verif?: unknown };
  return !!r.tarea && typeof r.tarea === "object" && typeof (r.tarea as Tarea).id === "string";
}

function normalizar(crudo: unknown): Envoltorio {
  const base = vacio();
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return base;
  const bruto = crudo as { porBot?: unknown; actualizado?: unknown };
  if (bruto.porBot && typeof bruto.porBot === "object" && !Array.isArray(bruto.porBot)) {
    for (const [botId, lista] of Object.entries(bruto.porBot as Record<string, unknown>)) {
      if (!botId || !Array.isArray(lista)) continue;
      const registros = lista.filter(esRegistro);
      if (registros.length > 0) base.porBot[botId] = registros;
    }
  }
  if (bruto.actualizado && typeof bruto.actualizado === "object" && !Array.isArray(bruto.actualizado)) {
    for (const [botId, marca] of Object.entries(bruto.actualizado as Record<string, unknown>)) {
      if (typeof marca === "number" && Number.isFinite(marca)) base.actualizado[botId] = marca;
    }
  }
  return base;
}

function leer(): Envoltorio {
  if (typeof window === "undefined") return vacio();
  try {
    const bruto = window.localStorage.getItem(CLAVE_TAREAS);
    return normalizar(bruto === null ? null : JSON.parse(bruto));
  } catch {
    return vacio();
  }
}

/** Tareas cuyo director es `botId`, de la más antigua a la más reciente. */
export function listar(botId: string): RegistroTarea[] {
  return leer().porBot[botId] ?? [];
}

/** Guarda o actualiza una tarea del bot director y su verificación (si la hay). */
export function guardar(tarea: Tarea, verif?: EstadoVerificacion): void {
  if (typeof window === "undefined" || !tarea.id || !tarea.director) return;
  const envoltorio = leer();
  const botId = tarea.director;
  const lista = [...(envoltorio.porBot[botId] ?? [])];
  const registro: RegistroTarea = verif ? { tarea, verif } : { tarea };
  const indice = lista.findIndex((r) => r.tarea.id === tarea.id);
  if (indice >= 0) lista[indice] = registro;
  else lista.push(registro);
  envoltorio.porBot[botId] = lista;
  envoltorio.actualizado[botId] = Date.now();
  try {
    window.localStorage.setItem(CLAVE_TAREAS, JSON.stringify(envoltorio));
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_TAREAS, { detail: { botId } }));
  } catch {
    /* sin observadores no pasa nada */
  }
  void mergeUserPrefs({ [CLAVE_TAREAS]: envoltorio }).catch(() => undefined);
}

/** Avisa cuando cambian las tareas (esta pestaña). Devuelve la baja. */
export function suscribirTareas(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENTO_TAREAS, cb);
  return () => window.removeEventListener(EVENTO_TAREAS, cb);
}
