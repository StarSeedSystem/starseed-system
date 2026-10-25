"use client";
/**
 * Tareas por bot (BOT1011X · architecture/astraura-bots.md §8): localStorage
 * `starseed.astraura.bots.tareas.v1` y espejo best-effort a la cuenta con
 * `mergeUserPrefs`. Cada tarea guarda su verificación aparte para que el estado
 * se derive con `estadoDe` y nunca se confíe en un `estado` persistido.
 */
import type { Tarea } from "../tipos";
import type { EstadoVerificacion, Marca, Verificador } from "../tareas-bot";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

export const CLAVE_TAREAS = "starseed.astraura.bots.tareas.v1";
export const EVENTO_TAREAS = "starseed:astraura-tareas";
export const VERSION_TAREAS = 1;

export interface TareaGuardada {
  tarea: Tarea;
  verif?: EstadoVerificacion;
}

interface Envoltorio {
  version: number;
  porBot: Record<string, TareaGuardada[]>;
}

const obj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown): string => (typeof x === "string" ? x : "");
const listaTexto = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : [];

const VERIFICADORES: readonly string[] = ["persona", "bot", "pruebas"];
const ORIGENES: readonly string[] = ["genesis", "poligenesis"];
const ESTADOS: readonly string[] = ["propuesta", "en-curso", "verificando", "hecha", "rechazada"];

function sanearTarea(x: unknown): Tarea | null {
  if (!obj(x)) return null;
  const id = texto(x.id), titulo = texto(x.titulo), director = texto(x.director);
  const criterios = listaTexto(x.criterios);
  if (!id || !titulo || !director || criterios.length === 0) return null;
  const verificador = VERIFICADORES.includes(texto(x.verificador)) ? (x.verificador as Verificador) : "persona";
  const origen = ORIGENES.includes(texto(x.origen)) ? (x.origen as Tarea["origen"]) : "genesis";
  const estado = ESTADOS.includes(texto(x.estado)) ? (x.estado as Tarea["estado"]) : "propuesta";
  return { id, titulo, director, agentes: listaTexto(x.agentes), criterios, verificador, origen, estado };
}

function sanearVerif(x: unknown): EstadoVerificacion | undefined {
  if (!obj(x) || !texto(x.tareaId) || !obj(x.marcas) || !obj(x.hechoPor)) return undefined;
  const marcas: Record<string, Marca> = {};
  for (const [c, m] of Object.entries(x.marcas)) {
    if (!obj(m) || !obj(m.por) || !VERIFICADORES.includes(texto(m.por.tipo)) || !texto(m.por.id)) continue;
    if (typeof m.ok !== "boolean" || typeof m.evidencia !== "string") continue;
    marcas[c] = { por: { tipo: m.por.tipo as Verificador, id: texto(m.por.id) }, ok: m.ok, evidencia: m.evidencia };
  }
  const hechoPor: Record<string, string> = {};
  for (const [c, a] of Object.entries(x.hechoPor)) if (typeof a === "string") hechoPor[c] = a;
  const verificador = VERIFICADORES.includes(texto(x.verificador)) ? (x.verificador as Verificador) : "persona";
  return { tareaId: texto(x.tareaId), director: texto(x.director), verificador, criterios: listaTexto(x.criterios), hechoPor, marcas };
}

function leer(): Envoltorio {
  const vacio: Envoltorio = { version: VERSION_TAREAS, porBot: {} };
  if (typeof window === "undefined") return vacio;
  try {
    const bruto: unknown = JSON.parse(window.localStorage.getItem(CLAVE_TAREAS) ?? "null");
    if (!obj(bruto) || !obj(bruto.porBot)) return vacio;
    const porBot: Record<string, TareaGuardada[]> = {};
    for (const [botId, lista] of Object.entries(bruto.porBot)) {
      if (!Array.isArray(lista)) continue;
      const guardadas: TareaGuardada[] = [];
      for (const item of lista) {
        if (!obj(item)) continue;
        const tarea = sanearTarea("tarea" in item ? item.tarea : item);
        if (!tarea) continue;
        const verif = sanearVerif(item.verif);
        guardadas.push({ tarea, ...(verif ? { verif } : {}) });
      }
      if (guardadas.length > 0) porBot[botId] = guardadas;
    }
    return { version: VERSION_TAREAS, porBot };
  } catch {
    return vacio;
  }
}

/** Tareas de un bot (las más recientes primero). */
export function listar(botId: string): TareaGuardada[] {
  return leer().porBot[botId] ?? [];
}

/** Guarda o reemplaza la tarea de su director, emite el evento y espeja sin bloquear. */
export function guardar(tarea: Tarea, verif?: EstadoVerificacion): void {
  if (typeof window === "undefined") return;
  const anterior = leer();
  const previas = anterior.porBot[tarea.director] ?? [];
  const nueva: TareaGuardada = { tarea, ...(verif ? { verif } : {}) };
  const siguiente: Envoltorio = {
    version: VERSION_TAREAS,
    porBot: { ...anterior.porBot, [tarea.director]: [nueva, ...previas.filter((g) => g.tarea.id !== tarea.id)] },
  };
  try {
    window.localStorage.setItem(CLAVE_TAREAS, JSON.stringify(siguiente));
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_TAREAS));
  } catch {
    /* sin observadores no pasa nada */
  }
  void mergeUserPrefs({ [CLAVE_TAREAS]: siguiente }).catch(() => undefined);
}

/** Suscripción a cambios del almacén (mismo documento). Devuelve desuscripción. */
export function suscribirTareas(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENTO_TAREAS, cb);
  return () => window.removeEventListener(EVENTO_TAREAS, cb);
}
