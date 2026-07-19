"use client";

/**
 * StarSeed OS — Agrupación de chats por PERSONALIDAD (Agente B1)
 * ============================================================================
 * Helper REUTILIZABLE por TODAS las superficies de chats de Astraura (sidebar de
 * /agent, FoldersBrowser del Exocórtex, Portal Nexus): agrupa las conversaciones
 * por la personalidad asignada a cada una (`meta.config.personalityId`), resuelta
 * a su nombre legible vía los PersonalityProfile. Los chats sin personalidad caen
 * en «Astraura (base)». Puro, SSR-safe y defensivo: nunca lanza.
 */

import type { AiConversation } from "@/lib/aurora/conversations";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";

export interface ChatGroup {
  /** Id estable del grupo (para React keys y estado de apertura). */
  id: string;
  /** Etiqueta visible del grupo. */
  name: string;
  /** Conversaciones del grupo (orden respetado por el llamador). */
  items: AiConversation[];
}

/** Etiqueta del grupo de chats SIN personalidad asignada. */
export const BASE_PERSONALITY_LABEL = "Astraura (base)";

/** Id de personalidad asignada a un chat (`meta.config.personalityId`), o null. */
export function personalityIdOf(c: AiConversation): string | null {
  const cfg = (c.meta as { config?: { personalityId?: string | null } } | null | undefined)?.config;
  const id = cfg?.personalityId;
  return typeof id === "string" && id.trim() ? id : null;
}

/**
 * Agrupa las conversaciones por su personalidad asignada. Resuelve id→nombre con
 * los perfiles instalados; si el id no resuelve, usa el propio id (defensivo); si
 * no hay personalidad, «Astraura (base)». Grupos ordenados por actividad reciente
 * (chat más nuevo primero); «Astraura (base)» siempre al final.
 */
export function groupConversationsByPersonality(conversations: AiConversation[]): ChatGroup[] {
  const nameById = new Map<string, string>();
  try {
    for (const p of listPersonalityProfiles()) nameById.set(p.id, p.name);
  } catch {
    /* sin perfiles disponibles: todo cae a id o a base */
  }

  const buckets = new Map<string, { name: string; items: AiConversation[]; last: number; base: boolean }>();
  for (const c of conversations) {
    const pid = personalityIdOf(c);
    const key = pid ?? "__base__";
    const name = pid ? nameById.get(pid) ?? pid : BASE_PERSONALITY_LABEL;
    const b = buckets.get(key) ?? { name, items: [], last: 0, base: !pid };
    b.items.push(c);
    b.last = Math.max(b.last, c.updatedAt ?? 0);
    buckets.set(key, b);
  }

  return [...buckets.entries()]
    .map(([key, b]) => ({ id: `p:${key}`, name: b.name, items: b.items, last: b.last, base: b.base }))
    .sort((a, b) => (a.base ? 1 : 0) - (b.base ? 1 : 0) || b.last - a.last)
    .map(({ id, name, items }) => ({ id, name, items }));
}
