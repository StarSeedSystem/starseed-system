"use client";

/**
 * StarSeed OS — INICIO / ACTUALIZACIONES unificadas de Astraura + OmniVoice (Adenda 111).
 * ============================================================================
 * Lógica de la ventana emergente que aparece en la PRIMERA entrada de una neurona
 * y REAPARECE cuando cambian los catálogos usados (nuevos modelos de LLM/voz o
 * nuevas fuentes/integraciones). Guarda por neurona (localStorage, viaja con la
 * cuenta vía settings-sync) la firma vista, las preferencias (auto-actualización
 * por defecto ON, estrategia local/servidor) y un "recordar luego".
 *
 * Módulo LIVIANO: datos + lógica pura (sin React). Nunca lanza. SSR-safe.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import { ALL_LLM_SPECS, ALL_VOICE_SPECS } from "@/ai/astraura/model-requirements";
import { INTEGRATIONS, REGISTRY_REVIEWED, type Integration } from "@/lib/integrations/integration-registry";
// (A149 · olas) Configuración PENDIENTE de la neurona: la elección de voz vive
// en su propia clave por dispositivo. Módulo liviano (localStorage), sin ciclos.
import { readNeuronVoiceChoice, neuronVoiceChoiceIsStale } from "@/lib/aurora/tts-oss/neuron-voice-constants";

export const STARTUP_UPDATES_KEY = "starseed.astraura.startup.v1";
export const STARTUP_UPDATES_EVENT = "starseed:astraura-startup";
export const STARTUP_OPEN_EVENT = "starseed:open-astraura-startup";

export type StartupStrategy = "auto" | "local" | "servidor";

export interface StartupState {
  /** Firma de catálogo vista por última vez. */
  lastSig?: string;
  /** Ids del catálogo vistos por última vez (para calcular novedades). */
  lastCatalog?: string[];
  seenAt?: number;
  firstRunDone?: boolean;
  /** Auto-actualizar modelos/fuentes por defecto. */
  autoUpdate?: boolean;
  /** Estrategia por defecto de la neurona. */
  strategy?: StartupStrategy;
  /** No volver a mostrar hasta este epoch ms ("recordar luego"). */
  snoozeUntil?: number;
}

export const DEFAULT_STARTUP: StartupState = { autoUpdate: true, strategy: "auto" };

/** Ids del catálogo actual con prefijo de tipo (L:llm · V:voz · I:integración). */
export function catalogIds(): string[] {
  return [
    ...ALL_LLM_SPECS.map((s) => "L:" + s.id),
    ...ALL_VOICE_SPECS.map((s) => "V:" + s.id),
    ...INTEGRATIONS.map((i) => "I:" + i.id),
  ].sort();
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Firma estable del catálogo (cambia si aparecen/desaparecen modelos o fuentes). */
export function catalogSignature(): string {
  const ids = catalogIds();
  return `${ids.length}.${REGISTRY_REVIEWED}.${hash(ids.join("|"))}`;
}

export function getStartupState(): StartupState {
  try {
    const raw = safeGet(STARTUP_UPDATES_KEY);
    if (!raw) return { ...DEFAULT_STARTUP };
    const p = JSON.parse(raw) as Partial<StartupState>;
    return {
      ...DEFAULT_STARTUP,
      ...p,
      autoUpdate: p.autoUpdate !== false, // por defecto ON
      strategy: p.strategy === "local" || p.strategy === "servidor" ? p.strategy : "auto",
      lastCatalog: Array.isArray(p.lastCatalog) ? p.lastCatalog.map(String) : undefined,
    };
  } catch {
    return { ...DEFAULT_STARTUP };
  }
}

export function setStartupState(patch: Partial<StartupState>): StartupState {
  const next = { ...getStartupState(), ...patch };
  try {
    safeSet(STARTUP_UPDATES_KEY, JSON.stringify(next));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STARTUP_UPDATES_EVENT, { detail: next }));
  } catch {
    /* */
  }
  return next;
}

/**
 * CONFIGURACIÓN PENDIENTE de esta neurona (A149 · olas). La ventana debe
 * REAPARECER al reiniciar mientras falte por configurar algo de la neurona,
 * con sus recomendaciones inteligentes — no solo cuando cambie el catálogo.
 * Hoy se consideran pendientes (lista honesta y ampliable):
 *   · la primera configuración completa (`firstRunDone` aún false);
 *   · la vía de voz de la neurona (nube ⟷ local) sin elegir, pospuesta
 *     («later») u obsoleta respecto a la versión del sistema de voz.
 */
export interface PendingConfigItem {
  sistema: "inicio" | "voz";
  label: string;
}

export function pendingConfiguration(): PendingConfigItem[] {
  const out: PendingConfigItem[] = [];
  try {
    if (!getStartupState().firstRunDone) {
      out.push({ sistema: "inicio", label: "la configuración inicial de esta neurona" });
    }
  } catch { /* */ }
  try {
    const choice = readNeuronVoiceChoice();
    if (!choice || choice.mode === "later" || neuronVoiceChoiceIsStale(choice)) {
      out.push({ sistema: "voz", label: "la vía de voz de esta neurona (nube gratis ⟷ motor local)" });
    }
  } catch { /* */ }
  return out;
}

/**
 * ¿Debe mostrarse la ventana ahora? Primera vez, catálogo cambiado (cualquier
 * actualización o recomendación nueva) o CONFIGURACIÓN PENDIENTE de la neurona
 * — siempre sin snooze («Recordar luego» pospone 24 h todo).
 */
export function shouldShowUpdates(now = Date.now()): boolean {
  const st = getStartupState();
  if (st.snoozeUntil && st.snoozeUntil > now) return false;
  if (!st.firstRunDone) return true;
  if (st.lastSig !== catalogSignature()) return true;
  try { return pendingConfiguration().length > 0; } catch { return false; }
}

/** Motivo por el que se muestra (para el encabezado del modal). */
export function updateReason(): "primera-vez" | "novedades" | "al-dia" {
  const st = getStartupState();
  if (!st.firstRunDone) return "primera-vez";
  return st.lastSig !== catalogSignature() ? "novedades" : "al-dia";
}

/** Marca el catálogo actual como visto (opcionalmente guarda preferencias). */
export function markUpdatesSeen(patch: Partial<StartupState> = {}): void {
  setStartupState({
    ...patch,
    lastSig: catalogSignature(),
    lastCatalog: catalogIds(),
    seenAt: Date.now(),
    firstRunDone: true,
    snoozeUntil: 0,
  });
}

/** Posponer la ventana (por defecto 24 h). */
export function snoozeUpdates(ms = 24 * 60 * 60 * 1000): void {
  setStartupState({ snoozeUntil: Date.now() + ms });
}

/** Integraciones NUEVAS desde la última vez vista (vacío en la primera ejecución). */
export function newIntegrationsSince(): Integration[] {
  const st = getStartupState();
  if (!st.firstRunDone || !st.lastCatalog) return [];
  const seen = new Set(st.lastCatalog);
  return INTEGRATIONS.filter((i) => !seen.has("I:" + i.id));
}

/** Ids de modelos (LLM/voz) NUEVOS desde la última vez vista. */
export function newModelIdsSince(): string[] {
  const st = getStartupState();
  if (!st.firstRunDone || !st.lastCatalog) return [];
  const seen = new Set(st.lastCatalog);
  return [...ALL_LLM_SPECS.map((s) => "L:" + s.id), ...ALL_VOICE_SPECS.map((s) => "V:" + s.id)].filter((id) => !seen.has(id));
}

/** Abre la ventana manualmente (desde ajustes o una notificación). */
export function openStartupUpdates(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STARTUP_OPEN_EVENT));
}

export function subscribeStartupOpen(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener(STARTUP_OPEN_EVENT, h);
  return () => window.removeEventListener(STARTUP_OPEN_EVENT, h);
}
