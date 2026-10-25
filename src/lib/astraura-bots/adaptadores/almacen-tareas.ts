"use client";
/**
 * Almacén de tareas por bot (BOT1011X · architecture/astraura-bots.md §8).
 * localStorage `starseed.astraura.bots.tareas.v1`; con sesión, espejo
 * best-effort en `user_settings.prefs` por `mergeUserPrefs`. La tarea se
 * archiva bajo su bot director (`tarea.director`): `listar(botId)` la lee.
 * SSR-safe y con try/catch: el espejo nunca lanza ni bloquea la interfaz.
 */
import type { Tarea } from "../tipos";
import type { EstadoVerificacion, Marca } from "../tareas-bot";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

export const CLAVE_TAREAS = "starseed.astraura.bots.tareas.v1";
export const EVENTO_TAREAS = "starseed:astraura-tareas";
export const VERSION_TAREAS = 1;

export interface EntradaTarea {
  tarea: Tarea;
  verif?: EstadoVerificacion;
}

interface Envoltorio {
  version: number;
  porBot: Record<string, EntradaTarea[]>;
}

const VACIO = (): Envoltorio => ({ version: VERSION_TAREAS, porBot: {} });
const esRegistro = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

function esTarea(x: unknown): x is Tarea {
  if (!esRegistro(x)) return false;
  return (
    typeof x.id === "string" && typeof x.titulo === "string" &&
    typeof x.director === "string" && Array.isArray(x.criterios) &&
    x.criterios.every((c) => typeof c === "string") &&
    Array.isArray(x.agentes) && typeof x.origen === "string" && typeof x.estado === "string"
  );
}

function esEntrada(x: unknown): x is EntradaTarea {
  return esRegistro(x) && esTarea(x.tarea) && (x.verif === undefined || esRegistro(x.verif));
}

function leer(): Envoltorio {
  if (typeof window === "undefined") return VACIO();
  try {
    const bruto: unknown = JSON.parse(window.localStorage.getItem(CLAVE_TAREAS) ?? "null");
    if (!esRegistro(bruto) || !esRegistro(bruto.porBot)) return VACIO();
    const porBot: Record<string, EntradaTarea[]> = {};
    for (const [botId, lista] of Object.entries(bruto.porBot)) {
      if (Array.isArray(lista)) porBot[botId] = lista.filter(esEntrada);
    }
    return { version: VERSION_TAREAS, porBot };
  } catch {
    return VACIO();
  }
}

/** Tareas de un bot (vacío si no hay ninguna o el almacén está roto). */
export function listar(botId: string): EntradaTarea[] {
  return leer().porBot[botId] ?? [];
}

/** Crea o reemplaza una tarea por su `id` bajo su bot director y espeja. */
export function guardar(tarea: Tarea, verif?: EstadoVerificacion): void {
  if (typeof window === "undefined") return;
  const env = leer();
  const lista = (env.porBot[tarea.director] ?? []).filter((e) => e.tarea.id !== tarea.id);
  const porBot = { ...env.porBot, [tarea.director]: [...lista, verif ? { tarea, verif } : { tarea }] };
  const siguiente: Envoltorio = { version: VERSION_TAREAS, porBot };
  try {
    window.localStorage.setItem(CLAVE_TAREAS, JSON.stringify(siguiente));
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_TAREAS, { detail: { botId: tarea.director } }));
  } catch {
    /* sin observadores no pasa nada */
  }
  void mergeUserPrefs({ [CLAVE_TAREAS]: siguiente }).catch(() => undefined);
}

/* ── Apoyo puro de la lista (sin React ni almacén) ──────────────────────── */

export const ETIQUETA_ESTADO: Record<Tarea["estado"], string> = {
  propuesta: "propuesta", "en-curso": "en curso", verificando: "verificando", hecha: "hecha", rechazada: "rechazada",
};

export interface Quien {
  personaId: string;
  verificadorBot: string;
}

/** Quién firma la marca según el verificador de la tarea. */
export function quienVerifica(t: Tarea, q: Quien): Marca["por"] {
  if (t.verificador === "persona") return { tipo: "persona", id: q.personaId };
  if (t.verificador === "pruebas") return { tipo: "pruebas", id: "vitest" };
  return { tipo: "bot", id: q.verificadorBot };
}

/** Un bot no verifica lo que él mismo hizo, ni su propia tarea como director. */
export function puedeVerificar(e: EntradaTarea, criterio: string, q: Quien): boolean {
  if (e.tarea.verificador !== "bot") return true;
  const por = quienVerifica(e.tarea, q), hizo = e.verif?.hechoPor[criterio];
  return !!hizo && hizo !== por.id && e.tarea.director !== por.id;
}
