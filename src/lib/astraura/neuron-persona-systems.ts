"use client";

/**
 * SISTEMAS DE ASTRAURA POR NEURONA × PERSONALIDAD (Adenda 149).
 * ============================================================================
 * SOP: `architecture/astraura-config-sistemas-neurona.md`.
 *
 * Capa ALTA de la ventana «Configuración/actualización de sistemas de Astraura
 * en esta neurona»: resolución con PROCEDENCIA, inventario de antenas,
 * clasificación de novedades y título dinámico. El STORE (tipos + persistencia
 * + fusión/poda de overrides) vive en `neuron-persona-store.ts` — módulo sin
 * dependencias que los consumidores de runtime (router LLM, registro de voz,
 * compilador de memoria, mesh) importan sin ciclos; aquí se RE-EXPORTA entero.
 *
 * Mismo patrón que `PersonalityIntelligence` (Adenda 67): **por defecto todo es
 * `auto` y esta capa no cambia absolutamente nada** — el router gratis-primero,
 * la cadena de voz, la política de memoria y la conectividad actuales mandan.
 * Solo al editar aparece un override, que va PRIMERO pero nunca es exclusivo
 * (si el sistema fijado no está disponible, se cae al siguiente: Astraura no se
 * queda muda ni ciega por un pin obsoleto).
 *
 * Precedencia (de más específica a más general):
 *   1. Override neurona×personalidad (store)
 *   2. Override neurona `"*"` («Todas las personalidades» en este dispositivo)
 *   3. La personalidad (intelligence / voiceStyle / memoryPolicy / connectivity)
 *   4. La neurona (NeuronSettings · voz por neurona · orden de modelos por neurona)
 *   5. La cuenta (preferencias globales)
 *   6. AUTO — recomendadores existentes (tier/scout/cadena de voz/defaults)
 *
 * Módulo LIVIANO: datos + lógica pura (sin React). SSR-safe. Nunca lanza.
 */

import { thisDeviceId, settingsFor, type NeuronCapabilities, type NeuronSettings } from "@/lib/neurons/neurons";
import {
  getPersonalityProfile, listPersonalityProfiles, getActivePersonality,
  type PersonalityProfile,
} from "@/lib/aurora/personalities";
import {
  getModelPreferences, getNeuronModelPreferences,
  MODEL_ACCESS_CLASSES, type ModelAccessClass,
} from "@/lib/astraura/model-preferences";
import { fitFor, ALL_LLM_SPECS, ALL_VOICE_SPECS, type ModelSpec } from "@/ai/astraura/model-requirements";
import { resolveActiveVoiceEngine, PRIMARY_VOICE_ENGINE } from "@/lib/aurora/tts-oss/engine-registry";
import { isVoiceEngineId, type AuroraVoiceEngine } from "@/lib/aurora/tts-oss/voice-config";
import { readNeuronVoiceChoice, type NeuronVoiceMode } from "@/lib/aurora/tts-oss/neuron-voice-constants";
import {
  externalLink, bluetoothLink,
  getConnectivitySettings, normalizeConnectivityConfig, DEFAULT_CONNECTIVITY_CONFIG,
  type ConnectivityConfig, type ConnectivityLink,
} from "@/ai/astraura/mesh";
import { newIntegrationsSince, newModelIdsSince, updateReason } from "@/lib/astraura/startup-updates";
import {
  ALL_PERSONAS, getOverrides,
  type AntennaRule, type AntennaRouteMode,
} from "@/lib/astraura/neuron-persona-store";

/* Re-export del STORE completo: los consumidores de UI importan de aquí. */
export {
  NEURON_PERSONA_KEY, NEURON_PERSONA_EVENT, ALL_PERSONAS,
  getRawOverrides, getOverrides, saveOverrides, clearOverrides, subscribeNeuronPersona,
} from "@/lib/astraura/neuron-persona-store";
export type {
  AntennaRule, AntennaRouteMode, PersonaNeuronOverrides,
} from "@/lib/astraura/neuron-persona-store";

/* ═══════════════════ 1 · Antenas de la neurona ═══════════════════ */

export type NeuronAntennaId = "wifi" | "bluetooth" | "serial" | "lora" | "daemon";

export interface NeuronAntenna {
  id: NeuronAntennaId;
  label: string;
  /** Disponibilidad honesta en ESTE dispositivo/navegador. */
  availability: ConnectivityLink["availability"];
  detail: string;
  /** Rutas que esta antena puede servir de verdad. */
  rutas: AntennaRouteMode[];
}

/**
 * Inventario de antenas de ESTE dispositivo para la pestaña Señales. Reutiliza
 * las sondas del subsistema de conectividad (`externalLink`/`bluetoothLink`) —
 * capacidad, no conexión: no abre ningún enlace. La radio LoRa llega por
 * serial/BLE/daemon; el daemon (meshtasticd por Wi-Fi/TCP) se declara según los
 * ajustes de conectividad de la neurona.
 */
export function detectAntennas(): NeuronAntenna[] {
  const out: NeuronAntenna[] = [];
  try {
    const ext = externalLink();
    out.push({
      id: "wifi",
      label: "Wi-Fi / Red externa",
      availability: ext.availability,
      detail: ext.detail,
      rutas: ["auto", "privada", "servidor", "mesh"],
    });
  } catch { /* */ }
  try {
    const bt = bluetoothLink();
    out.push({
      id: "bluetooth",
      label: "Bluetooth / BLE",
      availability: bt.availability,
      detail: bt.detail,
      rutas: ["auto", "privada", "mesh"],
    });
  } catch { /* */ }
  try {
    // `serialLink()` es async (enumera puertos); aquí basta la CAPACIDAD (sync).
    const serialSupported = typeof navigator !== "undefined" && "serial" in navigator;
    out.push({
      id: "serial",
      label: "Serie / USB (radio LoRa)",
      availability: serialSupported ? "available" : "unsupported",
      detail: serialSupported
        ? "Web Serial disponible: conecta una radio LoRa por USB"
        : "este navegador no expone Web Serial (usa BLE, daemon o la app nativa)",
      rutas: ["auto", "mesh"],
    });
  } catch { /* */ }
  try {
    const cs = getConnectivitySettings();
    const meshOn = cs.meshEnabled !== false;
    out.push({
      id: "lora",
      label: "Radio LoRa (malla P2P)",
      availability: meshOn ? "available" : "off",
      detail: meshOn ? "malla StarSeed activa: sync y mensajes por radio libre" : "malla desactivada en esta neurona",
      rutas: ["auto", "mesh"],
    });
    out.push({
      id: "daemon",
      label: "Nodo por Wi-Fi/TCP (daemon)",
      availability: meshOn ? "available" : "off",
      detail: "meshtasticd u otro nodo de malla alcanzable por IP local",
      rutas: ["auto", "mesh", "servidor"],
    });
  } catch { /* */ }
  return out;
}

/** Regla efectiva de una antena (defaults: activada, entrada+salida, ruta auto). */
export function effectiveAntennaRule(rules: Record<string, AntennaRule> | undefined, id: string): Required<AntennaRule> {
  const r = rules?.[id] ?? {};
  return {
    enabled: r.enabled !== false,
    entrada: r.entrada !== false,
    salida: r.salida !== false,
    ruta: r.ruta ?? "auto",
  };
}

/* ═══════════════════ 2 · Resolución con procedencia ═══════════════════ */

/** De dónde sale el valor efectivo (para mostrarlo y poder «volver a auto»). */
export type Provenance = "neurona" | "personalidad" | "cuenta" | "auto";

export interface ResolvedLlm {
  fuente?: string;
  modelo?: string;
  /** Etiqueta legible del sistema efectivo ("Automático (gratis-primero)"…). */
  label: string;
  provenance: Provenance;
}

export interface ResolvedAstraura {
  modo: "auto" | "fija";
  permitirPago: boolean;
  orden: ModelAccessClass[];
  /** De dónde sale el orden: override de neurona o preferencia de cuenta. */
  ordenScope: "neurona" | "cuenta";
  provenance: Provenance;
}

export interface ResolvedVoz {
  motor: AuroraVoiceEngine;
  /** Vía preferida de ESTA neurona (nube gratis ⟷ motor local). */
  via: NeuronVoiceMode | "auto";
  provenance: Provenance;
}

export interface ResolvedCerebro {
  usarMemorias: boolean;
  nivelContexto: "breve" | "completo";
  cerebrosPermitidos: "todos" | string[];
  almacen: "auto" | "local" | "servidor";
  /** Sync de cerebros con esta neurona: SIEMPRE el ajuste real de la neurona
   *  (`NeuronSettings.syncBrains`) — una sola fuente de verdad (rev. A149·M1). */
  syncBrains: boolean;
  provenance: Provenance;
}

export interface ResolvedSenales {
  porAntena: Record<string, Required<AntennaRule>>;
  connectivity: ConnectivityConfig;
  provenance: Provenance;
}

export interface ResolvedPersonaSystems {
  personaId: string;
  deviceId: string;
  llm: ResolvedLlm;
  astraura: ResolvedAstraura;
  voz: ResolvedVoz;
  cerebro: ResolvedCerebro;
  senales: ResolvedSenales;
}

function personaOrNull(personaId: string): PersonalityProfile | null {
  if (!personaId || personaId === ALL_PERSONAS) return null;
  try { return getPersonalityProfile(personaId); } catch { return null; }
}

/**
 * Resuelve los sistemas EFECTIVOS de una personalidad en una neurona, con la
 * procedencia de cada plano. Sin overrides ⇒ describe lo que el OS ya hace
 * (routers/cadenas actuales): esta función NUNCA altera el comportamiento.
 */
export function resolvePersonaSystems(
  personaId: string,
  deviceId: string = thisDeviceId(),
  caps?: NeuronCapabilities | null,
): ResolvedPersonaSystems {
  const ov = getOverrides(deviceId, personaId);
  const p = personaOrNull(personaId);
  const settings: NeuronSettings = (() => { try { return settingsFor(deviceId); } catch { return {}; } })();

  /* ── LLM ── */
  let llm: ResolvedLlm;
  if (ov.llm && (ov.llm.fuente || ov.llm.modelo)) {
    llm = { ...ov.llm, label: ov.llm.modelo || ov.llm.fuente || "fijado", provenance: "neurona" };
  } else if (p && p.intelligence.modo === "fija" && (p.intelligence.global?.fuente || p.intelligence.global?.modelo)) {
    const pin = p.intelligence.global;
    llm = { fuente: pin?.fuente, modelo: pin?.modelo, label: pin?.modelo || pin?.fuente || "fijado", provenance: "personalidad" };
  } else {
    llm = { label: "Automático (mejor opción gratis disponible)", provenance: "auto" };
  }

  /* ── Astraura (router / orden de clases) ── */
  const neuronPrefs = (() => { try { return getNeuronModelPreferences(deviceId); } catch { return null; } })();
  const accountPrefs = (() => { try { return getModelPreferences(); } catch { return null; } })();
  const orden = neuronPrefs?.order?.length
    ? [...neuronPrefs.order]
    : accountPrefs?.order?.length
      ? [...accountPrefs.order]
      : [...MODEL_ACCESS_CLASSES];
  const modo = ov.astraura?.modo ?? (p?.intelligence.modo ?? "auto");
  const permitirPago = ov.astraura?.permitirPago ?? (p?.intelligence.permitirPago ?? false);
  const astraura: ResolvedAstraura = {
    modo,
    permitirPago,
    orden,
    ordenScope: neuronPrefs?.order?.length ? "neurona" : "cuenta",
    provenance: ov.astraura ? "neurona" : p && p.intelligence.modo !== "auto" ? "personalidad" : neuronPrefs ? "neurona" : "cuenta",
  };

  /* ── Voz (OpenVoice y compañía) ── */
  let voz: ResolvedVoz;
  const ovMotor = ov.voz?.motor && isVoiceEngineId(ov.voz.motor) ? (ov.voz.motor as AuroraVoiceEngine) : null;
  const personaMotor = p?.intelligence.motorVoz && isVoiceEngineId(p.intelligence.motorVoz)
    ? (p.intelligence.motorVoz as AuroraVoiceEngine)
    : null;
  const via: NeuronVoiceMode | "auto" = ov.voz?.modo ?? (() => {
    try { const c = readNeuronVoiceChoice(); return c && c.mode !== "later" ? c.mode : "auto"; } catch { return "auto"; }
  })();
  if (ovMotor) voz = { motor: ovMotor, via, provenance: "neurona" };
  else if (personaMotor && p?.intelligence.modo === "fija") voz = { motor: personaMotor, via, provenance: "personalidad" };
  else {
    let motor: AuroraVoiceEngine = PRIMARY_VOICE_ENGINE;
    try { motor = resolveActiveVoiceEngine(); } catch { /* */ }
    voz = { motor, via, provenance: via !== "auto" ? "neurona" : "auto" };
  }

  /* ── Cerebro (memoria y almacenes) ── */
  const mp = p?.memoryPolicy;
  const cerebro: ResolvedCerebro = {
    usarMemorias: ov.cerebro?.usarMemorias ?? (mp ? mp.usarMemorias !== false : true),
    nivelContexto: ov.cerebro?.nivelContexto ?? (mp?.nivelContexto === "completo" ? "completo" : "breve"),
    cerebrosPermitidos: ov.cerebro?.cerebrosPermitidos ?? (mp?.cerebrosPermitidos ?? "todos"),
    almacen: ov.cerebro?.almacen ?? "auto",
    // Una sola fuente de verdad: el ajuste REAL de la neurona (rev. A149·M1).
    syncBrains: settings.syncBrains !== false,
    provenance: ov.cerebro ? "neurona" : mp ? "personalidad" : "auto",
  };

  /* ── Señales (antenas y rutas) ── */
  const antennas = detectAntennas();
  const porAntena: Record<string, Required<AntennaRule>> = {};
  for (const a of antennas) porAntena[a.id] = effectiveAntennaRule(ov.senales?.porAntena, a.id);
  const connectivity: ConnectivityConfig = (() => {
    try {
      if (p?.connectivity) return normalizeConnectivityConfig(p.connectivity);
      if (settings.connectivity) return normalizeConnectivityConfig(settings.connectivity);
    } catch { /* */ }
    return { ...DEFAULT_CONNECTIVITY_CONFIG };
  })();
  const senales: ResolvedSenales = {
    porAntena,
    connectivity,
    provenance: ov.senales ? "neurona" : p?.connectivity ? "personalidad" : settings.connectivity ? "neurona" : "auto",
  };

  return { personaId, deviceId, llm, astraura, voz, cerebro, senales };
}

/* ═══════════════════ 3 · Novedades por sistema ═══════════════════ */

export type UpdateMode = "primera-vez" | "actualizacion" | "recomendaciones" | "al-dia";

export interface ClassifiedUpdates {
  mode: UpdateMode;
  /** Novedades que tocan sistemas EN USO/instalados en esta neurona. */
  sistemas: ModelSpec[];
  /** Novedades solo-catálogo que SÍ le vendrían bien a este hardware. */
  recomendadas: ModelSpec[];
  /** Resto de novedades (no encajan aquí; se listan sin insistir). */
  otras: ModelSpec[];
  nuevasFuentes: number;
}

function specById(id: string): ModelSpec | undefined {
  return ALL_LLM_SPECS.find((s) => s.id === id) ?? ALL_VOICE_SPECS.find((s) => s.id === id);
}

/**
 * Clasifica las novedades del catálogo (Adenda 111) para el TÍTULO y el resumen
 * de la ventana: «actualización» si tocan sistemas en uso en esta neurona
 * (motor de voz efectivo, IA local instalada), «recomendaciones» si son
 * solo-catálogo pero encajan con este hardware (`fitFor`). Los `engine` de los
 * specs reales son "WebGPU" · "Ollama" · "Chrome AI" · "Kokoro"… (rev. A149·B1).
 * Heurística honesta y defensiva: ante la duda, recomendación.
 */
export function classifyUpdates(caps?: NeuronCapabilities | null, personaId?: string): ClassifiedUpdates {
  const reason = (() => { try { return updateReason(); } catch { return "al-dia"; } })();
  if (reason === "primera-vez") {
    return { mode: "primera-vez", sistemas: [], recomendadas: [], otras: [], nuevasFuentes: 0 };
  }
  let ids: string[] = [];
  let fuentes = 0;
  try { ids = newModelIdsSince(); } catch { /* */ }
  try { fuentes = newIntegrationsSince().length; } catch { /* */ }
  if (reason === "al-dia" || (ids.length === 0 && fuentes === 0)) {
    return { mode: "al-dia", sistemas: [], recomendadas: [], otras: [], nuevasFuentes: fuentes };
  }

  const activeId = personaId ?? (() => { try { return getActivePersonality()?.id ?? ALL_PERSONAS; } catch { return ALL_PERSONAS; } })();
  const resolved = resolvePersonaSystems(activeId, thisDeviceId(), caps ?? null);
  // Motores EN USO en esta neurona, con los nombres reales de `ModelSpec.engine`.
  const enginesEnUso = new Set<string>();
  try { enginesEnUso.add(String(resolved.voz.motor).toLowerCase()); } catch { /* */ }
  if (caps?.ollama) enginesEnUso.add("ollama");
  if (caps?.webgpu) enginesEnUso.add("webgpu");
  if (caps?.chromeAi) enginesEnUso.add("chrome ai");

  const sistemas: ModelSpec[] = [];
  const recomendadas: ModelSpec[] = [];
  const otras: ModelSpec[] = [];
  for (const raw of ids) {
    const spec = specById(raw.replace(/^[LV]:/, ""));
    if (!spec) continue;
    const engine = (spec.engine || "").toLowerCase();
    if (engine && [...enginesEnUso].some((e) => engine.includes(e) || e.includes(engine))) {
      sistemas.push(spec);
    } else if (caps && (() => { try { return fitFor(caps, spec).fits; } catch { return false; } })()) {
      recomendadas.push(spec);
    } else {
      otras.push(spec);
    }
  }
  const mode: UpdateMode = sistemas.length > 0 ? "actualizacion" : "recomendaciones";
  return { mode, sistemas, recomendadas, otras, nuevasFuentes: fuentes };
}

/* ═══════════════════ 4 · Título dinámico de la ventana ═══════════════════ */

export interface WindowHeading {
  title: string;
  subtitle: string;
  mode: UpdateMode;
}

/** Título/subtítulo según el contexto (§2 del SOP). */
export function windowHeading(updates: ClassifiedUpdates): WindowHeading {
  switch (updates.mode) {
    case "primera-vez":
      return {
        mode: updates.mode,
        title: "Configuración de sistemas de Astraura en esta neurona",
        subtitle: "Bienvenida a esta neurona: selecciones automáticas según su hardware para cada personalidad — todo editable.",
      };
    case "actualizacion":
      return {
        mode: updates.mode,
        title: "Actualización de sistemas de Astraura en esta neurona",
        subtitle: `Hay novedades para ${updates.sistemas.length} sistema(s) en uso en esta neurona. Revisa y aplica lo que prefieras.`,
      };
    case "recomendaciones":
      return {
        mode: updates.mode,
        title: "Recomendaciones para esta neurona",
        subtitle: "Novedades adecuadas para este dispositivo, detectadas y sugeridas automáticamente.",
      };
    default:
      return {
        mode: "al-dia",
        title: "Sistemas de Astraura en esta neurona",
        subtitle: "Todo al día. Ajusta los sistemas de cada personalidad en esta neurona.",
      };
  }
}

/* ═══════════════════ 5 · Utilidades para la UI ═══════════════════ */

export interface PersonaChip {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

/** Personalidades para el selector (activa primero; incluye Aurora/Hermione). */
export function personaChips(): PersonaChip[] {
  try {
    const activeId = (() => { try { return getActivePersonality()?.id ?? null; } catch { return null; } })();
    const list = listPersonalityProfiles();
    return list
      .map((p) => ({ id: p.id, name: p.name, icon: p.icon || "Sparkles", active: p.id === activeId }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  neurona: "ajuste de esta neurona",
  personalidad: "definido por la personalidad",
  cuenta: "preferencia de la cuenta",
  auto: "automático (mejor disponible)",
};
