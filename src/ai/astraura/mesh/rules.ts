/**
 * StarSeed OS — Red Mesh · REGLAS POR NEURONA/PERSONALIDAD (Adenda 97 · SOP §7.2).
 * ============================================================================
 * Cada personalidad (y la neurona-dispositivo) define su participación en la
 * malla: rol (interactiva · relé de alertas · solo escucha · apagada),
 * prioridad de ancho de banda y permisos de voz/datos descentralizados.
 *
 * Persistencia local-first (patrón de la casa, como voice-config):
 *   clave `starseed.mesh.rules.v1` → { [personalityId | "@device"]: MeshRules }
 * Cambios → evento `starseed:mesh-rules` (la UI y el router releen).
 *
 * SSR-safe y defensivo. NUNCA lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import { DEFAULT_MESH_RULES, MESH_RULES_LS_KEY } from "./constants";
import type { MeshRules, NeuronMeshPriority, NeuronMeshRole, TrafficClass } from "./types";

export const MESH_RULES_EVENT = "starseed:mesh-rules";

/** Id reservado para las reglas de ESTA neurona-dispositivo (sin personalidad). */
export const DEVICE_RULES_ID = "@device";

type RulesMap = Record<string, MeshRules>;

function isTrafficClass(v: unknown): v is TrafficClass {
  return v === "P0" || v === "P1" || v === "P2" || v === "P3";
}

function isRole(v: unknown): v is NeuronMeshRole {
  return v === "interactive" || v === "alert-relay" || v === "listen-only" || v === "off";
}

function isPriority(v: unknown): v is NeuronMeshPriority {
  return v === "high" || v === "normal" || v === "low";
}

/** Normaliza unas reglas sueltas (datos de disco = datos hostiles). */
export function normalizeMeshRules(raw: unknown): MeshRules {
  const r = (raw ?? {}) as Partial<MeshRules>;
  return {
    role: isRole(r.role) ? r.role : DEFAULT_MESH_RULES.role,
    priority: isPriority(r.priority) ? r.priority : DEFAULT_MESH_RULES.priority,
    voiceAnnounce:
      typeof r.voiceAnnounce === "boolean" ? r.voiceAnnounce : DEFAULT_MESH_RULES.voiceAnnounce,
    allowStateSync:
      typeof r.allowStateSync === "boolean" ? r.allowStateSync : DEFAULT_MESH_RULES.allowStateSync,
    allowedClasses: Array.isArray(r.allowedClasses)
      ? r.allowedClasses.filter(isTrafficClass)
      : DEFAULT_MESH_RULES.allowedClasses.slice(),
  };
}

function readMap(): RulesMap {
  try {
    const raw = safeGet(MESH_RULES_LS_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return {};
    const out: RulesMap = {};
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      out[k] = normalizeMeshRules(v);
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: RulesMap): void {
  try {
    safeSet(MESH_RULES_LS_KEY, JSON.stringify(map));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(MESH_RULES_EVENT));
    }
  } catch {
    /* */
  }
}

/** Reglas de una personalidad (o del dispositivo con DEVICE_RULES_ID). */
export function getMeshRules(id: string | null | undefined): MeshRules {
  const key = id || DEVICE_RULES_ID;
  const map = readMap();
  return map[key] ? map[key] : { ...DEFAULT_MESH_RULES, allowedClasses: DEFAULT_MESH_RULES.allowedClasses.slice() };
}

/** ¿Tiene reglas propias guardadas (no heredadas del defecto)? */
export function hasCustomMeshRules(id: string | null | undefined): boolean {
  const key = id || DEVICE_RULES_ID;
  return !!readMap()[key];
}

/** Guarda (merge) las reglas de una personalidad/dispositivo. */
export function setMeshRules(id: string | null | undefined, patch: Partial<MeshRules>): MeshRules {
  const key = id || DEVICE_RULES_ID;
  const map = readMap();
  const next = normalizeMeshRules({ ...getMeshRules(key), ...patch });
  map[key] = next;
  writeMap(map);
  return next;
}

/** Borra las reglas propias (vuelve al defecto heredado). */
export function clearMeshRules(id: string | null | undefined): void {
  const key = id || DEVICE_RULES_ID;
  const map = readMap();
  if (map[key]) {
    delete map[key];
    writeMap(map);
  }
}

/** Mapa completo (para la UI del hub de Personalidades). */
export function listMeshRules(): RulesMap {
  return readMap();
}

/** Etiquetas legibles para la UI (Lucide en la UI; aquí solo texto). */
export const MESH_ROLE_LABELS: Record<NeuronMeshRole, { label: string; hint: string }> = {
  interactive: {
    label: "Interactiva",
    hint: "Envía y recibe según el router inteligente (por defecto).",
  },
  "alert-relay": {
    label: "Relé de alertas",
    hint: "Solo reemite alertas críticas (P0) — ideal para una neurona-antena fija.",
  },
  "listen-only": {
    label: "Solo escucha",
    hint: "Jamás transmite; escucha la malla y muestra lo que oye.",
  },
  off: { label: "Apagada", hint: "No participa en la malla." },
};

export const MESH_PRIORITY_LABELS: Record<NeuronMeshPriority, string> = {
  high: "Alta",
  normal: "Normal",
  low: "Baja",
};
