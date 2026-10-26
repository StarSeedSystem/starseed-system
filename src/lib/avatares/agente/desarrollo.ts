/**
 * Desarrollo de un agente del Mundo de los avatares (Ola 1025U · U2) — módulo PURO, de solo lectura para la ficha.
 * Contrato: architecture/ficha-agente-mundo.md.
 *
 * Reúne dos cosas honestas:
 *   · las MEMORIAS recientes que el agente guarda (`RecuerdoBot` de `astraura-bots/memoria-bot.ts`), filtradas por lo
 *     que su actor puede ver (`nucleo/alcance-memoria.ts`: personal › perfil › grupo › pública, nunca al revés);
 *   · la EVOLUCIÓN de sus rasgos (`percepcion.ts`): valor base de la persona, deriva por experiencia, cupo del día.
 * Sin datos, la vista dice que no hay datos: no inventa actividad. Sin React, sin red, sin disco y sin reloj propio.
 */
import type { AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";
import { ORDEN_ALCANCE, alcanceVisiblePara, puedeEscribirEn } from "@/lib/nucleo/alcance-memoria";
import { cuotaPara, regular, type RecuerdoBot } from "@/lib/astraura-bots/memoria-bot";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { actorMemoriaDe, limpiarTexto, type ConfigAgente } from "./config-agente";
import {
  ETIQUETA_RASGO, RASGOS_PERCEPCION, TOPE_DIARIO, rasgosEfectivos, restanteHoy, usadoHoy,
  type EntradaEvolucion, type RasgoPercepcion,
} from "./percepcion";

export const MAX_RECUERDOS = 300;
export const MAX_TEXTO_RECUERDO = 400;
export const MAX_ORIGEN_RECUERDO = 60;
export const RECUERDOS_RECIENTES = 8;
export const PASOS_RECIENTES = 10;

export const ETIQUETA_ALCANCE: Record<AlcanceMemoria, string> = {
  personal: "Personal", perfil: "Perfil", grupo: "Grupo", publica: "Pública",
};

const esRegistro = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function bytesDe(texto: string): number {
  try {
    return new TextEncoder().encode(texto).length;
  } catch {
    return texto.length * 2;
  }
}

/** Lee lo guardado sin fiarse: lo roto se descarta, el alcance desconocido se descarta (nunca se abre por error). */
export function sanearRecuerdos(raw: unknown, agente: Pick<AgenteMundoRef, "id">): RecuerdoBot[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const out: RecuerdoBot[] = [];
  for (const item of raw) {
    if (!esRegistro(item)) continue;
    const id = limpiarTexto(item.id, 80);
    const texto = limpiarTexto(item.texto, MAX_TEXTO_RECUERDO);
    const alcance = item.alcance as AlcanceMemoria;
    if (!id || ids.has(id) || !texto || !ORDEN_ALCANCE.includes(alcance)) continue;
    if (typeof item.at !== "number" || !Number.isFinite(item.at) || item.at < 0) continue;
    ids.add(id);
    const usos = typeof item.usos === "number" && Number.isFinite(item.usos) ? Math.max(0, Math.round(item.usos)) : 0;
    const grupoId = typeof item.grupoId === "string" && item.grupoId ? limpiarTexto(item.grupoId, 160) : undefined;
    out.push({
      id, botId: agente.id, alcance, texto, origen: limpiarTexto(item.origen, MAX_ORIGEN_RECUERDO) || "conversación",
      at: item.at, bytes: bytesDe(texto), usos, ...(item.fijado === true ? { fijado: true } : {}), ...(grupoId ? { grupoId } : {}),
    });
    if (out.length >= MAX_RECUERDOS) break;
  }
  return out;
}

/** Lo que este agente puede ver de sus recuerdos: solo los alcances de su actor y, en grupo, solo los de SU grupo. */
export function recuerdosVisibles(recuerdos: RecuerdoBot[], agente: AgenteMundoRef): RecuerdoBot[] {
  const actor = actorMemoriaDe(agente);
  const permitidos = alcanceVisiblePara(actor);
  return recuerdos.filter((r) => {
    if (!permitidos.includes(r.alcance)) return false;
    if (r.alcance === "grupo" && r.grupoId && actor.grupoId && r.grupoId !== actor.grupoId) return false;
    return true;
  });
}

/** Los más recientes primero. */
export function memoriasRecientes(recuerdos: RecuerdoBot[], agente: AgenteMundoRef, limite = RECUERDOS_RECIENTES): RecuerdoBot[] {
  return [...recuerdosVisibles(recuerdos, agente)].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)).slice(0, Math.max(0, limite));
}

export interface NuevoRecuerdo { texto: string; alcance: AlcanceMemoria; origen?: string }

/**
 * Guarda un recuerdo con las reglas del OS: nadie escribe donde no puede leer (un agente público no escribe en lo
 * personal; uno de grupo declara su grupo) y la cuota del medio regula lo que se olvida, sin tocar lo fijado.
 * Devuelve la lista NUEVA; no escribe en disco.
 */
export function agregarRecuerdo(
  actuales: RecuerdoBot[], agente: AgenteMundoRef, nuevo: NuevoRecuerdo, ahora: number, cuotaBytes: number = cuotaPara("web"),
): { ok: true; recuerdos: RecuerdoBot[]; olvidados: RecuerdoBot[] } | { ok: false; motivo: string } {
  const actor = actorMemoriaDe(agente);
  if (!ORDEN_ALCANCE.includes(nuevo.alcance)) return { ok: false, motivo: "Alcance de memoria desconocido." };
  if (!puedeEscribirEn(actor, nuevo.alcance)) return { ok: false, motivo: "Este agente no puede escribir en ese alcance de memoria." };
  const texto = limpiarTexto(nuevo.texto, MAX_TEXTO_RECUERDO);
  if (!texto) return { ok: false, motivo: "El recuerdo está vacío." };
  const n = actuales.reduce((m, r) => Math.max(m, Number(r.id.split("-").pop()) || 0), 0) + 1;
  const recuerdo: RecuerdoBot = {
    id: `rec-${ahora}-${n}`, botId: agente.id, alcance: nuevo.alcance, texto, origen: limpiarTexto(nuevo.origen, MAX_ORIGEN_RECUERDO) || "conversación",
    at: ahora, bytes: bytesDe(texto), usos: 0, ...(nuevo.alcance === "grupo" && actor.grupoId ? { grupoId: actor.grupoId } : {}),
  };
  const { conservar, olvidar } = regular([...actuales, recuerdo], cuotaBytes, ahora);
  const recuerdos = [...conservar].sort((a, b) => a.at - b.at).slice(-MAX_RECUERDOS);
  const olvidados = [...olvidar, ...conservar.filter((r) => !recuerdos.includes(r))];
  return { ok: true, recuerdos, olvidados };
}

/* ── Evolución, en filas listas para pintar ──────────────────────────────── */

export interface FilaEvolucion {
  rasgo: RasgoPercepcion;
  nombre: string;
  base: number;
  deriva: number;
  efectivo: number;
  usadoHoy: number;
  restanteHoy: number;
}

export interface VistaDesarrollo {
  /** Memorias más recientes que el agente puede ver, la más nueva primero. */
  memorias: RecuerdoBot[];
  totalMemorias: number;
  evolucion: FilaEvolucion[];
  /** Pasos de evolución, el más reciente primero (incluye los deshechos, marcados). */
  pasos: EntradaEvolucion[];
  /** ¿Alguna vez se movió algún rasgo por la experiencia? */
  hayEvolucion: boolean;
  /** Sin recuerdos ni evolución: la ficha lo dice, no inventa. */
  sinDatos: boolean;
  topeDiario: number;
}

export function vistaDesarrollo(args: { recuerdos: RecuerdoBot[]; agente: AgenteMundoRef; config: ConfigAgente; ahora: number }): VistaDesarrollo {
  const { recuerdos, agente, config, ahora } = args;
  const visibles = recuerdosVisibles(recuerdos, agente);
  const efectivos = rasgosEfectivos(config);
  const evolucion: FilaEvolucion[] = RASGOS_PERCEPCION.map((rasgo) => ({
    rasgo, nombre: ETIQUETA_RASGO[rasgo].nombre, base: config.percepcion.rasgos[rasgo], deriva: config.desarrollo.deriva[rasgo] ?? 0,
    efectivo: efectivos[rasgo], usadoHoy: usadoHoy(config.desarrollo, rasgo, ahora), restanteHoy: restanteHoy(config.desarrollo, rasgo, ahora),
  }));
  const pasos = [...config.desarrollo.historial].sort((a, b) => b.at - a.at).slice(0, PASOS_RECIENTES);
  const hayEvolucion = config.desarrollo.historial.length > 0;
  return {
    memorias: memoriasRecientes(recuerdos, agente), totalMemorias: visibles.length, evolucion, pasos, hayEvolucion,
    sinDatos: visibles.length === 0 && !hayEvolucion, topeDiario: TOPE_DIARIO,
  };
}

/** «hace 3 min», «hace 2 h»… sin inventar: si la marca de tiempo está en el futuro, dice «ahora». */
export function haceCuanto(at: number, ahora: number): string {
  const s = Math.max(0, Math.floor((ahora - at) / 1000));
  if (s < 60) return "hace un momento";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}
