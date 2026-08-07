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
import {
  newIntegrationsSince, newModelIdsSince, updateReason, pendingConfiguration,
  type PendingConfigItem,
} from "@/lib/astraura/startup-updates";
import {
  ALL_PERSONAS, getOverrides,
  type AntennaRule, type AntennaRouteMode,
} from "@/lib/astraura/neuron-persona-store";

/* Imports ADITIVOS de la ola 3 (resonancia + divergencia, §6-7 al final del
 * archivo). Van aparte para no tocar el bloque original: todos son módulos que
 * este archivo ya arrastra (`engine-registry`, `neurons`) o liviano sin ciclos
 * (`persona-coherence` solo importa tipos de voz + safe-storage). */
import { listVoiceEngines } from "@/lib/aurora/tts-oss/engine-registry";
import { engineSupportsRef } from "@/lib/aurora/persona-coherence";
import { listNeurons } from "@/lib/neurons/neurons";
import { getRawOverrides, saveOverrides, type PersonaNeuronOverrides } from "@/lib/astraura/neuron-persona-store";

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
  /** Configuración PENDIENTE de esta neurona (A149 · olas): mientras haya algo
   *  sin configurar, la ventana reaparece al reiniciar y lo lista aquí. */
  pendientes: PendingConfigItem[];
}

function pendientesSafe(): PendingConfigItem[] {
  try { return pendingConfiguration(); } catch { return []; }
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
  const pendientes = pendientesSafe();
  if (reason === "primera-vez") {
    return { mode: "primera-vez", sistemas: [], recomendadas: [], otras: [], nuevasFuentes: 0, pendientes };
  }
  let ids: string[] = [];
  let fuentes = 0;
  try { ids = newModelIdsSince(); } catch { /* */ }
  try { fuentes = newIntegrationsSince().length; } catch { /* */ }
  if (reason === "al-dia" || (ids.length === 0 && fuentes === 0)) {
    return { mode: "al-dia", sistemas: [], recomendadas: [], otras: [], nuevasFuentes: fuentes, pendientes };
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
  return { mode, sistemas, recomendadas, otras, nuevasFuentes: fuentes, pendientes };
}

/* ═══════════════════ 4 · Título dinámico de la ventana ═══════════════════ */

export interface WindowHeading {
  title: string;
  subtitle: string;
  mode: UpdateMode;
}

/** Frase corta con lo pendiente («la vía de voz… y la configuración inicial»). */
function pendientesFrase(p: PendingConfigItem[]): string {
  return p.map((x) => x.label).join(" y ");
}

/**
 * Título/subtítulo según el contexto (§2 del SOP). Si la neurona tiene
 * CONFIGURACIÓN PENDIENTE, la ventana lo dice siempre — y cuando no hay
 * novedades de catálogo, lo pendiente ES el motivo de la reaparición.
 */
export function windowHeading(updates: ClassifiedUpdates): WindowHeading {
  const pend = updates.pendientes ?? [];
  const pendSufijo = pend.length > 0 ? ` Pendiente: ${pendientesFrase(pend)}.` : "";
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
        subtitle: `Hay novedades para ${updates.sistemas.length} sistema(s) en uso en esta neurona. Revisa y aplica lo que prefieras.${pendSufijo}`,
      };
    case "recomendaciones":
      return {
        mode: updates.mode,
        title: "Recomendaciones para esta neurona",
        subtitle: `Novedades adecuadas para este dispositivo, detectadas y sugeridas automáticamente.${pendSufijo}`,
      };
    default:
      if (pend.length > 0) {
        // Sin novedades de catálogo pero con configuración a medias: la ventana
        // reaparece al reiniciar precisamente por esto (A149 · olas).
        return {
          mode: "al-dia",
          title: "Configuración de sistemas de Astraura en esta neurona",
          subtitle: `Falta por configurar ${pendientesFrase(pend)} — con recomendaciones automáticas según este dispositivo. El resto sigue en automático inteligente.`,
        };
      }
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

/* ═══════════════════ 6 · Resonancia: ¿encaja lo configurado? ═══════════════════ */

/** Clave de sistema del store (llm · astraura · voz · cerebro · senales). */
export type SystemKey = keyof PersonaNeuronOverrides;

export const SYSTEM_KEYS: SystemKey[] = ["llm", "astraura", "voz", "cerebro", "senales"];

/** Antenas que sirven la malla P2P (las que importan para `meshEnabled`). */
const MESH_ANTENNAS: NeuronAntennaId[] = ["lora", "serial", "bluetooth", "daemon"];

/**
 * Un desajuste REAL y comprobable entre lo que pide la personalidad y lo que
 * hace esta neurona. `arreglo()` aplica el cambio MENOS destructivo posible
 * (primero intenta BORRAR el campo que sobra; solo si tras borrarlo la
 * contradicción persiste —porque venía de «Todas»— escribe el valor mínimo).
 */
export interface ResonanceMismatch {
  id: "voz-sin-clonacion" | "memoria-contradicha" | "pin-anulado" | "mesh-sin-salida";
  /** Frase corta para la lista (español, sin jerga). */
  label: string;
  /** Explicación de una línea del porqué. */
  detail: string;
  /** Sistema/pestaña donde se arregla. */
  system: SystemKey;
  /** Puntos que resta a la resonancia (0-100). */
  weight: number;
  /** Etiqueta del botón de arreglo. */
  arregloLabel: string;
  /** Aplica el arreglo mínimo. Nunca lanza. */
  arreglo: () => void;
}

export interface ResonanceResult {
  /** 0-100: 100 = todo lo configurado apunta en la misma dirección. */
  score: number;
  level: "resonante" | "leve" | "disonante";
  /** Etiqueta legible del nivel. */
  label: string;
  mismatches: ResonanceMismatch[];
}

/** Primer motor de voz que SÍ sabe clonar y está usable en esta neurona. */
function bestRefEngine(): AuroraVoiceEngine | null {
  const supports = (e: AuroraVoiceEngine) => { try { return engineSupportsRef(e); } catch { return false; } };
  try {
    const list = listVoiceEngines();
    const usable = list.find((e) => supports(e.meta.id) && (e.availability === "ready" || e.availability === "configured"));
    if (usable) return usable.meta.id;
    const any = list.find((e) => supports(e.meta.id));
    if (any) return any.meta.id;
  } catch { /* */ }
  return supports(PRIMARY_VOICE_ENGINE) ? PRIMARY_VOICE_ENGINE : null;
}

/** Antena de malla más "abrible" de las que este dispositivo detecta. */
function bestMeshAntenna(): NeuronAntennaId | null {
  try {
    const detected = detectAntennas();
    const score = (id: NeuronAntennaId) => {
      const a = detected.find((x) => x.id === id);
      if (!a) return -1;
      return a.availability === "available" ? 2 : a.availability === "off" ? 1 : 0;
    };
    const ordered = [...MESH_ANTENNAS].sort((a, b) => score(b) - score(a));
    return score(ordered[0]) >= 0 ? ordered[0] : null;
  } catch {
    return null;
  }
}

/**
 * MODO RESONANCIA (idea 2.10:134): cuánto encaja la configuración de esta
 * neurona con lo que la PERSONALIDAD pide. No es una nota estética: cada punto
 * restado corresponde a una contradicción detectable en el código, con su
 * arreglo. Sin desajustes ⇒ 100 y lista vacía. Pura, SSR-safe, nunca lanza.
 */
export function resonanceScore(personaId: string, deviceId: string = thisDeviceId()): ResonanceResult {
  const mismatches: ResonanceMismatch[] = [];
  try {
    const p = personaOrNull(personaId);
    const resolved = resolvePersonaSystems(personaId, deviceId, null);
    const eff = getOverrides(deviceId, personaId);

    /* 1 · Voz de referencia asignada… con un motor que no sabe clonar. */
    const ref = p?.voiceStyle?.audioRef;
    const hasRef = !!ref && (ref.kind === "builtin" ? !!ref.voiceId : !!ref.dataUrl);
    if (hasRef && !(() => { try { return engineSupportsRef(resolved.voz.motor); } catch { return true; } })()) {
      const target = bestRefEngine();
      mismatches.push({
        id: "voz-sin-clonacion",
        label: "La voz de referencia no se puede clonar con el motor actual",
        detail: `«${p?.name ?? "Esta personalidad"}» tiene una voz asignada, pero ${resolved.voz.motor} no admite referencia de audio: sonará con su propio timbre.`,
        system: "voz",
        weight: 28,
        arregloLabel: target ? `Usar ${target}` : "Sin motor que clone",
        arreglo: () => {
          try { if (target) saveOverrides(deviceId, personaId, { voz: { motor: target } }); } catch { /* */ }
        },
      });
    }

    /* 2 · La neurona contradice la política de memorias de la personalidad. */
    const personaUsa = p ? p.memoryPolicy?.usarMemorias !== false : null;
    const ovUsa = eff.cerebro?.usarMemorias;
    if (personaUsa !== null && typeof ovUsa === "boolean" && ovUsa !== personaUsa) {
      mismatches.push({
        id: "memoria-contradicha",
        label: ovUsa
          ? "Esta neurona enciende memorias que la personalidad apaga"
          : "Esta neurona apaga las memorias que la personalidad usa",
        detail: "El ajuste de neurona manda sobre la política de memoria de la personalidad; aquí van en direcciones opuestas.",
        system: "cerebro",
        weight: 22,
        arregloLabel: "Devolver a la personalidad",
        arreglo: () => {
          try {
            // Menos destructivo: BORRAR el campo (vuelve a heredar).
            saveOverrides(deviceId, personaId, { cerebro: { usarMemorias: undefined } });
            // Si la contradicción venía de «Todas», fijar el mínimo necesario.
            const after = getOverrides(deviceId, personaId).cerebro?.usarMemorias;
            if (typeof after === "boolean" && after !== personaUsa) {
              saveOverrides(deviceId, personaId, { cerebro: { usarMemorias: personaUsa } });
            }
          } catch { /* */ }
        },
      });
    }

    /* 3 · Personalidad con inteligencia «fija» puesta en «auto» por la neurona. */
    if (p && p.intelligence?.modo === "fija" && eff.astraura?.modo === "auto") {
      mismatches.push({
        id: "pin-anulado",
        label: "La neurona pone en automático una personalidad de inteligencia fija",
        detail: `«${p.name}» fija su fuente/modelo, pero esta neurona la devuelve a automático: el pin no se aplica aquí.`,
        system: "astraura",
        weight: 25,
        arregloLabel: "Respetar «fija»",
        arreglo: () => {
          try {
            saveOverrides(deviceId, personaId, { astraura: { modo: undefined } });
            const after = getOverrides(deviceId, personaId).astraura?.modo;
            if (after === "auto") saveOverrides(deviceId, personaId, { astraura: { modo: "fija" } });
          } catch { /* */ }
        },
      });
    }

    /* 4 · Malla encendida… con TODAS las antenas de malla cerradas de salida. */
    if (resolved.senales.connectivity?.meshEnabled) {
      const presentes = MESH_ANTENNAS.filter((id) => !!resolved.senales.porAntena[id]);
      const cerradas = presentes.filter((id) => {
        const r = resolved.senales.porAntena[id];
        return !r.enabled || !r.salida;
      });
      if (presentes.length > 0 && cerradas.length === presentes.length) {
        const target = bestMeshAntenna();
        mismatches.push({
          id: "mesh-sin-salida",
          label: "Malla activada pero sin ninguna antena que pueda emitir",
          detail: "La conectividad de esta personalidad participa en la malla, pero sus antenas de radio están cerradas de salida: solo recibiría.",
          system: "senales",
          weight: 18,
          arregloLabel: target ? `Abrir salida en ${target}` : "Sin antena que abrir",
          arreglo: () => {
            try {
              if (!target) return;
              saveOverrides(deviceId, personaId, {
                senales: { porAntena: { [target]: { enabled: true, salida: true } } },
              });
            } catch { /* */ }
          },
        });
      }
    }
  } catch { /* ante la duda, no inventamos desajustes */ }

  const penal = mismatches.reduce((n, m) => n + m.weight, 0);
  const score = Math.max(0, Math.min(100, 100 - penal));
  const level: ResonanceResult["level"] = score >= 90 ? "resonante" : score >= 65 ? "leve" : "disonante";
  const label = level === "resonante"
    ? "En resonancia"
    : level === "leve" ? "Ligera disonancia" : "Disonante";
  return { score, level, label, mismatches };
}

/* ═══════════════════ 7 · Divergencia entre neuronas ═══════════════════ */

export interface PersonaDivergence {
  neuronId: string;
  name: string;
  /** Sistemas cuyo override CRUDO difiere del de esta neurona. */
  sistemasDistintos: SystemKey[];
}

/** Comparación estable de un sistema (orden de claves irrelevante; vacío = auto). */
function sameSystemValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): string => {
    if (v === undefined || v === null) return "";
    try {
      if (typeof v !== "object") return JSON.stringify(v) ?? "";
      const walk = (x: unknown): unknown => {
        if (!x || typeof x !== "object") return x;
        if (Array.isArray(x)) return x.map(walk);
        const o = x as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(o).sort()) {
          if (o[k] !== undefined) out[k] = walk(o[k]);
        }
        return out;
      };
      const w = walk(v);
      const s = JSON.stringify(w);
      return s === "{}" || s === "[]" ? "" : (s ?? "");
    } catch {
      return "";
    }
  };
  return norm(a) === norm(b);
}

/**
 * ¿Suena esta personalidad DISTINTA en otras neuronas de la cuenta? (idea
 * 2.10:136). `listNeurons()[].id` ES la clave `deviceId` del store y la clave
 * viaja con la cuenta (`SYNCED_KEYS`), así que la comparación es lectura pura
 * sin red extra más allá del listado de neuronas.
 *
 * Async y defensiva: sin sesión, sin otras neuronas o ante cualquier fallo
 * devuelve `[]` (nunca lanza).
 */
export async function personaDivergence(
  personaId: string,
  deviceId: string = thisDeviceId(),
): Promise<PersonaDivergence[]> {
  const out: PersonaDivergence[] = [];
  try {
    if (!personaId || !deviceId) return out;
    const mine = getRawOverrides(deviceId, personaId);
    let neurons: { id: string; name: string }[] = [];
    try {
      neurons = (await listNeurons()).map((n) => ({ id: String(n.id), name: n.name || "Neurona" }));
    } catch {
      return out;
    }
    for (const n of neurons) {
      if (!n.id || n.id === deviceId) continue;
      let other: PersonaNeuronOverrides = {};
      try { other = getRawOverrides(n.id, personaId); } catch { continue; }
      const distintos = SYSTEM_KEYS.filter((k) => !sameSystemValue(mine[k], other[k]));
      if (distintos.length > 0) {
        out.push({ neuronId: n.id, name: n.name, sistemasDistintos: distintos });
      }
    }
  } catch { /* */ }
  return out;
}
