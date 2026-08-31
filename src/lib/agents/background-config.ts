"use client";

/**
 * AGENTES EN SEGUNDO PLANO (Adenda 193) — la última pestaña del rito.
 * ----------------------------------------------------------------------------
 * Deja la neurona VIVA desde el primer minuto: los agentes corren procesos
 * imaginativos e intuitivos de fondo, se automejoran, y cada uno sabe con qué
 * personalidad trabaja, a qué cerebro está atado y qué puede tocar.
 *
 * Todo llega AUTO-SELECCIONADO según el equipo real (núcleos y RAM), los
 * cerebros que existan y las carpetas vinculadas en Permisos — el usuario solo
 * acepta, o abre y cambia lo que quiera. Se persiste local por neurona y se
 * aplica de verdad: `startAutonomy` (ciclo de automejora del OS) y la config de
 * imaginación del backend 1.58 cuando esta neurona lo tiene vivo.
 *
 * Honesto: si el backend 1.58 no responde, la elección queda guardada y se
 * aplica en cuanto exista — nunca se finge un proceso que no corre.
 */

import type { Agent } from "@/lib/agents/model";

export type IntensidadFondo = "eco" | "adaptativo" | "rendimiento";

export interface PermisosAgente {
  /** Leer las carpetas vinculadas del cerebro (conocimiento local). */
  carpetas: boolean;
  /** Buscar en la red (fuentes públicas, catálogos). */
  red: boolean;
  /** Avisarte de lo que encuentre o proponga. */
  avisos: boolean;
}

export interface AgenteFondo {
  agentId: string;
  nombre: string;
  /** Corre procesos de fondo (imaginación/intuición) para ti. */
  activo: boolean;
  /** Para qué lo usa esta neurona (frase corta, editable). */
  uso: string;
  /** Id de personalidad de Aurora, o "auto" para que Astraura elija. */
  personalidad: string;
  /** Cerebro al que se ata (memorias y carpetas). null = el principal. */
  cerebroId: string | null;
  permisos: PermisosAgente;
}

export interface ConfigAgentesFondo {
  /** Imaginación intuitiva siempre-activa. */
  imaginacion: boolean;
  /** Ciclo de automejora autónoma del OS. */
  automejora: boolean;
  intensidad: IntensidadFondo;
  /** Minutos entre ciclos (derivado de la intensidad, editable). */
  frecuenciaMin: number;
  agentes: AgenteFondo[];
  actualizado: number;
}

const LS_KEY = "starseed.agentes.fondo.v1";

export const INTENSIDADES: { id: IntensidadFondo; label: string; desc: string; min: number }[] = [
  { id: "eco", label: "Eco", desc: "Muy poco consumo; ciclos espaciados.", min: 90 },
  { id: "adaptativo", label: "Adaptativo", desc: "Se ajusta a la carga del equipo (recomendado).", min: 30 },
  { id: "rendimiento", label: "Rendimiento", desc: "Ciclos frecuentes; equipo potente y enchufado.", min: 10 },
];

/** Usos sugeridos por agente (se preseleccionan; el usuario puede reescribir). */
const USO_POR_ICONO: Record<string, string> = {
  Sparkles: "Acompañarte y orientarte en la red",
  Palette: "Crear e ilustrar lo que publicas",
  ClipboardList: "Planificar y ordenar tu trabajo",
};

/** Hardware mínimo que necesita esta decisión (mismo shape que el rito). */
export interface HWFondo { nucleos?: number | null; ramGB?: number | null }

/** Intensidad que corresponde a este equipo, sin preguntar nada. */
export function intensidadAutomatica(hw?: HWFondo | null): IntensidadFondo {
  const n = hw?.nucleos ?? 0;
  const ram = hw?.ramGB ?? 0;
  if (n >= 8 && ram >= 8) return "rendimiento";
  if (n <= 2 || (ram > 0 && ram <= 4)) return "eco";
  return "adaptativo";
}

/**
 * Config COMPLETA auto-seleccionada: imaginación y automejora encendidas,
 * intensidad según el equipo, y cada agente con su uso, su cerebro y sus
 * permisos ya puestos (carpetas solo si de verdad vinculaste alguna).
 */
export function configAutomatica(opts: {
  agentes: Agent[];
  hw?: HWFondo | null;
  cerebroId?: string | null;
  hayCarpetas?: boolean;
}): ConfigAgentesFondo {
  const intensidad = intensidadAutomatica(opts.hw);
  const min = INTENSIDADES.find((i) => i.id === intensidad)?.min ?? 30;
  return {
    imaginacion: true,
    automejora: true,
    intensidad,
    frecuenciaMin: min,
    agentes: opts.agentes.map((a) => ({
      agentId: a.id,
      nombre: a.name,
      activo: true,
      uso: USO_POR_ICONO[a.icon] ?? (a.description.split(":")[0] || a.name).slice(0, 60),
      personalidad: "auto",
      cerebroId: opts.cerebroId ?? null,
      permisos: { carpetas: !!opts.hayCarpetas, red: true, avisos: true },
    })),
    actualizado: Date.now(),
  };
}

/** Lee la config guardada de esta neurona (null si nunca se configuró). */
export function getConfigAgentesFondo(): ConfigAgentesFondo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as ConfigAgentesFondo;
    return c && Array.isArray(c.agentes) ? c : null;
  } catch {
    return null;
  }
}

/** Guarda la config y la APLICA (autonomía + imaginación 1.58 si está viva). */
export async function saveConfigAgentesFondo(config: ConfigAgentesFondo): Promise<void> {
  const c: ConfigAgentesFondo = { ...config, actualizado: Date.now() };
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch { /* sigue en memoria */ }
  await aplicarConfigAgentesFondo(c);
}

/**
 * Aplica la config a los motores REALES. Nunca lanza: si un motor no está
 * disponible en esta neurona, la elección queda guardada para cuando lo esté.
 */
export async function aplicarConfigAgentesFondo(c: ConfigAgentesFondo): Promise<void> {
  // 1) Ciclo de automejora/sugerencias del OS.
  try {
    const autonomy = await import("@/ai/astraura/autonomy");
    if (c.automejora) autonomy.startAutonomy(c.frecuenciaMin);
    else autonomy.stopAutonomy();
  } catch { /* el módulo no está disponible en este medio */ }

  // 2) Imaginación intuitiva del backend soberano 1.58 (si responde).
  try {
    const cli = await import("@/lib/astraura/astraura-158-client");
    const target = cli.astraura158LocalEnabled() ? "local" : "nube";
    const cerebros = Array.from(new Set(c.agentes.map((a) => a.cerebroId).filter(Boolean))) as string[];
    await cli.updateAstraura158ImaginationConfig(target as never, {
      is_always_on: c.imaginacion,
      cycle_frequency_minutes: c.frecuenciaMin,
      operation_mode: c.intensidad === "rendimiento" ? "performance" : c.intensidad === "eco" ? "eco" : "adaptive",
      ...(cerebros.length ? { associated_brain_ids: cerebros } : {}),
    });
  } catch { /* backend 1.58 dormido: se aplicará cuando despierte */ }
}

/** ¿Ya pasó esta neurona por la pestaña de agentes? */
export function agentesFondoConfigurados(): boolean {
  return !!getConfigAgentesFondo();
}
