"use client";
/**
 * Almacén de tareas por bot (BOT1011X): localStorage
 * `starseed.astraura.bots.tareas.v1` (personal; con sesión, espejo best-effort
 * en `user_settings.prefs` por `mergeUserPrefs`).
 */
import { mergeUserPrefs } from "@/lib/sync/user-prefs";
import { crearTarea, marcarCriterio, verificacionInicial, estadoDe, type EstadoVerificacion } from "../tareas-bot";
import { META_ACCION, validarAccion, type AccionBot } from "../acciones";
import { decidirAccion, type NivelBot } from "../permisos";
import type { Tarea } from "../tipos";

const CLAVE = "starseed.astraura.bots.tareas.v1";
const MAX_REGISTRO = 200;

export interface CriterioMarca {
  ok: boolean;
  porId: string;
  evidencia: string;
}

export interface RegistroTarea {
  tarea: Tarea;
  verif: EstadoVerificacion;
  marcas: Record<string, CriterioMarca>;
  creado: number;
}

interface EnvoltorioTareas {
  version: 1;
  tareas: RegistroTarea[];
}

function leer(): EnvoltorioTareas {
  if (typeof window === "undefined") return { version: 1, tareas: [] };
  try {
    const bruto = window.localStorage.getItem(CLAVE);
    const crudo: unknown = bruto === null ? null : JSON.parse(bruto);
    if (crudo && typeof crudo === "object" && !Array.isArray(crudo)) {
      const t = (crudo as { tareas?: unknown }).tareas;
      if (Array.isArray(t)) return { version: 1, tareas: t as RegistroTarea[] };
    }
    if (Array.isArray(crudo)) return { version: 1, tareas: crudo as RegistroTarea[] };
  } catch { /* sin datos */ }
  return { version: 1, tareas: [] };
}

function guardar(env: EnvoltorioTareas): void {
  if (typeof window === "undefined") return;
  try {
    const recortado = env.tareas.slice(-MAX_REGISTRO);
    window.localStorage.setItem(CLAVE, JSON.stringify({ version: 1, tareas: recortado }));
  } catch { /* sin espacio */ }
  void mergeUserPrefs({ [CLAVE]: { version: 1, tareas: env.tareas.slice(-MAX_REGISTRO) } }).catch(() => undefined);
}

export function listar(botId: string): RegistroTarea[] {
  if (!botId) return [];
  const { tareas } = leer();
  return tareas.filter((r) => r.tarea.director === botId || (r.tarea.agentes || []).includes(botId));
}

export function guardarTarea(tarea: Tarea, verif: EstadoVerificacion): RegistroTarea | null {
  if (!tarea || !verif) return null;
  const { tareas } = leer();
  const reg: RegistroTarea = { tarea, verif, marcas: {}, creado: Date.now() };
  tareas.push(reg);
  guardar({ version: 1, tareas });
  return reg;
}

function puedeVerificar(reg: RegistroTarea, verificadorId: string): boolean {
  const v = reg.verif;
  if (v.verificador === "pruebas") return true;
  if (v.verificador === "persona") return Boolean(verificadorId);
  if (v.verificador === "bot") {
    if (verificadorId === v.director) return false;
    const hecho = v.hechoPor || {};
    for (const a of Object.values(hecho)) {
      if (a === verificadorId) return false;
    }
    return true;
  }
  return false;
}

export function verificarCriterio(
  botId: string,
  tareaId: string,
  criterio: string,
  ok: boolean,
  evidencia: string,
): { ok: boolean; tarea?: Tarea; problemas?: string[] } {
  if (!botId || !tareaId) return { ok: false, problemas: ["Faltan datos."] };
  const { tareas } = leer();
  const idx = tareas.findIndex((r) => r.tarea.id === tareaId);
  if (idx < 0) return { ok: false, problemas: ["Tarea no encontrada."] };
  const reg = tareas[idx];
  if (!puedeVerificar(reg, botId)) return { ok: false, problemas: ["No puedes verificar esta tarea."] };
  const hecho = reg.verif.hechoPor || {};
  if (reg.verif.verificador === "bot") {
    if (botId === reg.verif.director) return { ok: false, problemas: ["Un bot no verifica lo que él mismo hizo."] };
    for (const a of Object.values(hecho)) {
      if (a === botId) return { ok: false, problemas: ["Un bot no verifica lo que él mismo hizo."] };
    }
  }
  const res = marcarCriterio(reg.verif, criterio, { tipo: reg.verif.verificador, id: botId }, ok, evidencia);
  if ("problemas" in res) return { ok: false, problemas: res.problemas };
  const nuevoVerif = res;
  const nuevoEstado = estadoDe(reg.tarea, nuevoVerif);
  const nuevaTarea = { ...reg.tarea, estado: nuevoEstado };
  const marcas = { ...(reg.marcas || {}) };
  marcas[criterio] = { ok, porId: botId, evidencia: evidencia.trim() };
  tareas[idx] = { ...reg, tarea: nuevaTarea, verif: nuevoVerif, marcas };
  guardar({ version: 1, tareas });
  return { ok: true, tarea: nuevaTarea };
}

export function crearTareaDesdeAccion(
  botId: string,
  args: Readonly<Record<string, unknown>>,
  origen: Tarea["origen"] = "genesis",
): { ok: boolean; tarea?: Tarea; problemas?: string[] } {
  if (!botId) return { ok: false, problemas: ["Falta el bot."] };
  const accion: AccionBot = { tipo: "tarea.crear", args };
  const v = validarAccion(accion);
  if (!v.accion) return { ok: false, problemas: v.problemas };
  const meta = META_ACCION["tarea.crear"];
  const nivel: NivelBot = "proponer";
  const decision = decidirAccion({ bot: { id: botId, activo: true, origen: "astraura", dueno: { tipo: "perfil", id: botId, cuentaId: botId }, gobierno: "jerarquico", personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 }, cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: ["red"], voz: undefined } as any, accion: v.accion, rol: "dueno", nivel });
  if (decision.requiere === "nunca" || (decision.requiere === "confirmacion" && nivel === "proponer")) {
    // se deja como propuesta; crearTarea valida igual
  }
  const res = crearTarea(v.accion.args, botId, origen);
  if ("problemas" in res) return { ok: false, problemas: res.problemas };
  const pasos: Array<{ criterio: string; agente: string }> = res.criterios.map((c) => ({ criterio: c, agente: botId }));
  const verif = verificacionInicial(res, pasos as any);
  const reg = guardarTarea(res, verif);
  if (!reg) return { ok: false, problemas: ["No se pudo guardar la tarea."] };
  return { ok: true, tarea: res };
}
