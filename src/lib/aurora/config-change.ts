"use client";

/**
 * StarSeed OS — DIVISOR DE "AJUSTES DEL CHAT ACTUALIZADOS" (Adenda 71-ter · I1)
 * ============================================================================
 * Cuando se cambian ajustes desde el menú de Opciones de CUALQUIER chat
 * (chat-config-menu), se inserta en el hilo un mensaje persistente y sutil que
 * deja constancia de QUÉ cambió, redactado en español y sólo con los campos
 * modificados. Se guarda en `astraura_messages` con `role: 'system'` y
 * `meta.kind: 'config-change'`, así que aparece en TODAS las superficies que
 * comparten la conversación unificada.
 *
 * API:
 *   diffChatConfig(prev, next)               → { changed, summary }
 *   insertConfigChangeMessage(convId, ...)   → persiste el divisor (si cambió)
 *   CONFIG_CHANGE_KIND / CONFIG_CHANGE_PREFIX
 */

import type { ChatConfig } from "@/components/aurora/chat-config-menu";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";
import { loadConfigs } from "@/ai/client/providerStore";
import { PROVIDERS } from "@/ai/providers";
import { appendMessage } from "@/lib/aurora/conversations";

export const CONFIG_CHANGE_KIND = "config-change";
export const CONFIG_CHANGE_PREFIX = "⚙️ Ajustes del chat actualizados:";

// ── Resolución de etiquetas legibles ────────────────────────────────────────
function personalityLabel(id?: string | null): string {
  if (!id) return "por defecto";
  try {
    const hit = listPersonalityProfiles().find((p) => p.id === id);
    if (hit?.name) return hit.name;
  } catch { /* */ }
  return id;
}

function providerLabelOf(id?: string | null): string {
  if (!id) return "automático";
  try {
    const cfgs = loadConfigs() as Array<{ id: string; label?: string }>;
    const hit = cfgs.find((c) => c.id === id);
    if (hit?.label) return hit.label;
  } catch { /* */ }
  try {
    const p = (PROVIDERS as Record<string, { label?: string }>)[id];
    if (p?.label) return p.label;
  } catch { /* */ }
  return id;
}

function countTrue(rec?: Record<string, boolean>): number {
  if (!rec) return 0;
  return Object.values(rec).filter(Boolean).length;
}

function sameArray(a?: string[], b?: string[]): boolean {
  const x = [...(a ?? [])].sort();
  const y = [...(b ?? [])].sort();
  if (x.length !== y.length) return false;
  return x.every((v, i) => v === y[i]);
}

function sameRecord(a?: Record<string, boolean>, b?: Record<string, boolean>): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) if (!!a?.[k] !== !!b?.[k]) return false;
  return true;
}

// ── Diff legible ─────────────────────────────────────────────────────────────
export interface ChatConfigDiff {
  changed: boolean;
  /** Frase compacta con SÓLO los campos cambiados (sin el prefijo ⚙️). */
  summary: string;
  /** Partes individuales ("personalidad → X", …). */
  parts: string[];
}

/** Compara dos configs y describe en español SÓLO lo que cambió. */
export function diffChatConfig(prev: ChatConfig | undefined, next: ChatConfig): ChatConfigDiff {
  const p = prev ?? {};
  const parts: string[] = [];

  if ((p.personalityId ?? null) !== (next.personalityId ?? null)) {
    parts.push(`personalidad → ${personalityLabel(next.personalityId)}`);
  }
  if ((p.provider ?? null) !== (next.provider ?? null)) {
    parts.push(`proveedor → ${providerLabelOf(next.provider)}`);
  }
  if ((p.voice !== false) !== (next.voice !== false)) {
    parts.push(`voz → ${next.voice === false ? "desactivada" : "activada"}`);
  }
  if ((p.log !== false) !== (next.log !== false)) {
    parts.push(`registro → ${next.log === false ? "desactivado" : "activado"}`);
  }
  if ((p.memoryScope ?? "") !== (next.memoryScope ?? "")) {
    if (next.memoryScope) parts.push(`memoria → ${next.memoryScope}`);
  }
  if (!sameArray(p.skills, next.skills)) {
    parts.push(`habilidades → ${next.skills?.length ?? 0}`);
  }
  if (!sameArray(p.connections, next.connections)) {
    parts.push(`conexiones → ${next.connections?.length ?? 0}`);
  }
  if (!sameRecord(p.senses, next.senses)) {
    parts.push(`sentidos → ${countTrue(next.senses)}`);
  }
  if (!sameRecord(p.capabilities, next.capabilities)) {
    parts.push(`capacidades → ${countTrue(next.capabilities)}`);
  }

  return { changed: parts.length > 0, summary: parts.join(" · "), parts };
}

// ── Persistencia del divisor ────────────────────────────────────────────────
/**
 * Inserta el divisor de cambio de config en el hilo (si algo cambió). Idempotente
 * por el `client_id` determinista de `appendMessage`. Nunca lanza.
 */
export async function insertConfigChangeMessage(
  convId: string | null | undefined,
  prev: ChatConfig | undefined,
  next: ChatConfig,
): Promise<void> {
  if (!convId) return;
  const diff = diffChatConfig(prev, next);
  if (!diff.changed) return;
  try {
    await appendMessage({
      role: "system",
      text: `${CONFIG_CHANGE_PREFIX} ${diff.summary}`,
      convId,
      meta: { kind: CONFIG_CHANGE_KIND, local: true },
    });
  } catch { /* best-effort: el divisor es informativo */ }
}
