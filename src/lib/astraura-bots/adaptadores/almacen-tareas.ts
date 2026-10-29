"use client";
/**
 * Almacén de TAREAS por bot (BOT1011X · contrato architecture/astraura-bots.md §8).
 * localStorage `starseed.astraura.bots.tareas.v1` + espejo best-effort a la cuenta con
 * `mergeUserPrefs`. SSR-safe y sin lanzar: el espejo nunca bloquea ni rompe la pantalla.
 * El estado que manda lo deriva `estadoDe` (tareas-bot.ts), nunca lo guardado a mano.
 */
import type { EstadoTarea, Tarea } from "../tipos";
import { estadoDe, type EstadoVerificacion, type Marca } from "../tareas-bot";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

export const CLAVE_TAREAS = "starseed.astraura.bots.tareas.v1";
export const VERSION_TAREAS = 1;
export const EVENTO_TAREAS = "starseed:astraura-bots-tareas";

interface RegistroTarea {
  tarea: Tarea;
  verif?: EstadoVerificacion;
  actualizado: number;
}
interface Envoltorio {
  version: number;
  porBot: Record<string, RegistroTarea[]>;
}
export interface TareaGuardada {
  tarea: Tarea;
  verif?: EstadoVerificacion;
  estado: EstadoTarea;
  actualizado: number;
}

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const esRegistro = (x: unknown): x is RegistroTarea =>
  esObjeto(x) && esObjeto(x.tarea) && typeof x.tarea.id === "string" &&
  typeof x.tarea.director === "string" && typeof x.actualizado === "number";

function leerEnvoltorio(): Envoltorio {
  const vacio: Envoltorio = { version: VERSION_TAREAS, porBot: {} };
  if (typeof window === "undefined") return vacio;
  try {
    const crudo: unknown = JSON.parse(window.localStorage.getItem(CLAVE_TAREAS) ?? "null");
    if (!esObjeto(crudo) || !esObjeto(crudo.porBot)) return vacio;
    const porBot: Record<string, RegistroTarea[]> = {};
    for (const [botId, lista] of Object.entries(crudo.porBot)) {
      if (!Array.isArray(lista)) continue;
      const limpias = lista.filter(esRegistro);
      if (limpias.length > 0) porBot[botId] = limpias;
    }
    return { version: VERSION_TAREAS, porBot };
  } catch {
    return vacio;
  }
}

/** Quién puede verificar ese criterio: nunca el director ni el bot que lo hizo. */
export function quienVerifica(t: Tarea, v: EstadoVerificacion | undefined, criterio: string): Marca["por"] | null {
  if (t.verificador === "persona") return { tipo: "persona", id: "persona" };
  if (t.verificador === "pruebas") return { tipo: "pruebas", id: "pruebas" };
  const hecho = v?.hechoPor[criterio];
  const otro = t.agentes.find((a) => a !== hecho && a !== t.director);
  return otro ? { tipo: "bot", id: otro } : null;
}

/** Tareas del bot director, la más reciente primero, con su estado revalidado. */
export function listar(botId: string): TareaGuardada[] {
  const registros = leerEnvoltorio().porBot[botId] ?? [];
  return registros
    .map((r) => ({ ...r, estado: estadoDe(r.tarea, r.verif) }))
    .sort((a, b) => b.actualizado - a.actualizado);
}

/** Crea o actualiza la tarea del bot `tarea.director`, emite el evento y espeja best-effort. */
export function guardar(tarea: Tarea, verif?: EstadoVerificacion): TareaGuardada[] {
  const envoltorio = leerEnvoltorio();
  const botId = tarea.director;
  const previas = envoltorio.porBot[botId] ?? [];
  const registro: RegistroTarea = { tarea, ...(verif ? { verif } : {}), actualizado: Date.now() };
  envoltorio.porBot[botId] = [registro, ...previas.filter((r) => r.tarea.id !== tarea.id)];
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CLAVE_TAREAS, JSON.stringify(envoltorio));
    } catch {
      return listar(botId);
    }
    try {
      window.dispatchEvent(new CustomEvent(EVENTO_TAREAS, { detail: { botId } }));
    } catch { /* sin observadores no pasa nada */ }
    void mergeUserPrefs({ [CLAVE_TAREAS]: envoltorio }).catch(() => undefined);
  }
  return listar(botId);
}
