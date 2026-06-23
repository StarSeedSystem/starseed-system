"use client";

// src/lib/notifications/notifications.ts
// -----------------------------------------------------------------------------
// Capa de datos del CENTRO DE NOTIFICACIONES (Módulo 2) de StarSeed OS.
//
// Unifica DOS fuentes realtime de Supabase en un modelo común:
//   • notifications(id, user_id, kind, title, body, link, seen, created_at)
//       → fuente "general" (sistema / menciones / invitaciones / etc.).
//   • proposal_notifications(id, proposal_id, user_id, kind, message, seen,
//       created_at) → fuente "proposal" (gobernanza / ontocracia).
//
// Ambas tablas tienen RLS por usuario, así que con el cliente del navegador
// sólo se reciben las filas propias. Aun así, todas las consultas filtran
// explícitamente por `user_id` tras `auth.getUser()` y NUNCA lanzan: ante
// cualquier error degradan a lista vacía / no-op (privacidad y robustez).
//
// Forma normalizada común (`UnifiedNotification`):
//   { id, source, kind, title, body, link, seen, created_at, proposalId?,
//     rawId }
//
// Las de `proposal_notifications` se normalizan: enlazan a `/decisiones`
// (opcionalmente `?id=<proposal_id>`), su `title` se deriva del `kind`, y su
// `body` toma el `message`.
//
// Categorización (para las pestañas del centro):
//   categorize(item) → 'menciones' | 'politica' | 'invitaciones' | 'otras'.
//
// Agrupación: `groupSimilar()` colapsa casi-duplicados (misma categoría +
// mismo "tema") en un único grupo con conteo, conservando el más reciente.
//
// Resumen IA opcional: `summarize()` usa `chat()` para producir una síntesis
// breve en español; ante error devuelve "".
// -----------------------------------------------------------------------------

import { createClient } from "@/utils/supabase/client";
import { chat } from "@/ai/client/chat";

// ----------------------------- Tipos ----------------------------------------

export type NotificationSource = "general" | "proposal";

/** Categorías de las pestañas del Centro de Notificaciones. */
export type NotificationCategoryKey =
  | "menciones"
  | "politica"
  | "invitaciones"
  | "otras";

/** Forma común a la que se normalizan ambas tablas. */
export interface UnifiedNotification {
  /** Id estable y único entre fuentes: `${source}:${rawId}`. */
  id: string;
  /** Id real de la fila en su tabla de origen. */
  rawId: string;
  source: NotificationSource;
  /** Tipo/kind libre proveniente de la fila original. */
  kind: string | null;
  title: string;
  body: string | null;
  /** Enlace de destino (puede ser null). */
  link: string | null;
  seen: boolean;
  /** ISO timestamp. */
  created_at: string;
  /** Sólo para `proposal`: id de la propuesta asociada. */
  proposalId?: string | null;
}

/** Grupo de notificaciones casi-duplicadas. */
export interface NotificationGroup {
  /** Clave de agrupación. */
  key: string;
  /** Representante (el más reciente del grupo). */
  head: UnifiedNotification;
  /** Todos los items del grupo, recientes primero. */
  items: UnifiedNotification[];
  /** Número de items (>= 1). */
  count: number;
  /** Cuántos del grupo están sin leer. */
  unread: number;
  /** Categoría común del grupo. */
  category: NotificationCategoryKey;
}

// --------------------------- Utilidades --------------------------------------

function safeStr(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

/** Convierte un `kind` técnico en un título legible en español. */
function proposalTitleFromKind(kind: string | null, message: string | null): string {
  const k = (kind || "").toLowerCase();
  const map: Record<string, string> = {
    new_proposal: "Nueva propuesta",
    proposal_created: "Nueva propuesta",
    created: "Nueva propuesta",
    vote: "Nuevo voto en una propuesta",
    new_vote: "Nuevo voto en una propuesta",
    voted: "Nuevo voto en una propuesta",
    comment: "Nuevo comentario en una propuesta",
    new_comment: "Nuevo comentario en una propuesta",
    deliberation: "Fase de deliberación abierta",
    passed: "Propuesta aprobada",
    approved: "Propuesta aprobada",
    rejected: "Propuesta rechazada",
    closed: "Propuesta cerrada",
    quorum: "Quórum alcanzado",
    mention: "Te han mencionado en una propuesta",
    invite: "Invitación a participar en una propuesta",
  };
  if (map[k]) return map[k];
  // Fallback: usa el mensaje (recortado) o un genérico de gobernanza.
  const msg = safeStr(message).trim();
  if (msg) return msg.length > 80 ? `${msg.slice(0, 77)}…` : msg;
  return "Actividad en una propuesta";
}

/** Normaliza una fila de `notifications` (general). */
function normalizeGeneral(row: any): UnifiedNotification | null {
  if (!row || row.id == null) return null;
  const rawId = safeStr(row.id);
  return {
    id: `general:${rawId}`,
    rawId,
    source: "general",
    kind: row.kind ?? null,
    title: safeStr(row.title) || "Notificación",
    body: row.body ?? null,
    link: row.link ?? null,
    seen: !!row.seen,
    created_at: safeStr(row.created_at) || new Date(0).toISOString(),
  };
}

/** Normaliza una fila de `proposal_notifications` (gobernanza). */
function normalizeProposal(row: any): UnifiedNotification | null {
  if (!row || row.id == null) return null;
  const rawId = safeStr(row.id);
  const proposalId = row.proposal_id != null ? safeStr(row.proposal_id) : null;
  // Enlace a /decisiones (con el id de propuesta si lo conocemos).
  const link = proposalId ? `/decisiones?id=${encodeURIComponent(proposalId)}` : "/decisiones";
  return {
    id: `proposal:${rawId}`,
    rawId,
    source: "proposal",
    kind: row.kind ?? null,
    title: proposalTitleFromKind(row.kind ?? null, row.message ?? null),
    body: row.message ?? null,
    link,
    seen: !!row.seen,
    created_at: safeStr(row.created_at) || new Date(0).toISOString(),
    proposalId,
  };
}

// ------------------------- Carga unificada -----------------------------------

/**
 * Carga y fusiona `notifications` + `proposal_notifications` del usuario actual,
 * normalizadas a `UnifiedNotification` y ordenadas por `created_at` desc.
 *
 * Owner-scoped (filtra por `user_id`). NUNCA lanza: ante error devuelve [].
 */
export async function loadAllNotifications(): Promise<UnifiedNotification[]> {
  // SSR-safe: sin window no hay sesión del navegador.
  if (typeof window === "undefined") return [];

  try {
    const supabase = createClient();

    const {
      data: userData,
    } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return [];

    // Cargamos ambas fuentes en paralelo. Cada una tolera su propio fallo.
    const [generalRes, proposalRes] = await Promise.allSettled([
      supabase
        .from("notifications")
        .select("id, user_id, kind, title, body, link, seen, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("proposal_notifications")
        .select("id, proposal_id, user_id, kind, message, seen, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const out: UnifiedNotification[] = [];

    if (generalRes.status === "fulfilled" && !generalRes.value.error) {
      for (const row of generalRes.value.data ?? []) {
        const n = normalizeGeneral(row);
        if (n) out.push(n);
      }
    }
    if (proposalRes.status === "fulfilled" && !proposalRes.value.error) {
      for (const row of proposalRes.value.data ?? []) {
        const n = normalizeProposal(row);
        if (n) out.push(n);
      }
    }

    // Orden global por fecha desc (created_at ISO compara lexicográficamente).
    out.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    return out;
  } catch {
    return [];
  }
}

// ------------------------- Marcar como leído ---------------------------------

/**
 * Marca una notificación como leída en su tabla de origen. Owner-scoped.
 * NUNCA lanza: devuelve `true` si parece haber tenido éxito, `false` si no.
 */
export async function markSeen(item: UnifiedNotification): Promise<boolean> {
  if (typeof window === "undefined" || !item) return false;
  try {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return false;

    const table = item.source === "proposal" ? "proposal_notifications" : "notifications";
    const { error } = await supabase
      .from(table)
      .update({ seen: true })
      .eq("id", item.rawId)
      .eq("user_id", uid);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Marca varias notificaciones como leídas. Agrupa por tabla para minimizar
 * llamadas. NUNCA lanza.
 */
export async function markAllSeen(items: UnifiedNotification[]): Promise<boolean> {
  if (typeof window === "undefined" || !Array.isArray(items) || items.length === 0) {
    return false;
  }
  try {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return false;

    const generalIds = items
      .filter((i) => i.source === "general" && !i.seen)
      .map((i) => i.rawId);
    const proposalIds = items
      .filter((i) => i.source === "proposal" && !i.seen)
      .map((i) => i.rawId);

    const ops: Promise<any>[] = [];
    if (generalIds.length) {
      ops.push(
        supabase
          .from("notifications")
          .update({ seen: true })
          .eq("user_id", uid)
          .in("id", generalIds),
      );
    }
    if (proposalIds.length) {
      ops.push(
        supabase
          .from("proposal_notifications")
          .update({ seen: true })
          .eq("user_id", uid)
          .in("id", proposalIds),
      );
    }
    if (ops.length === 0) return false;

    const results = await Promise.allSettled(ops);
    // Éxito si al menos una operación no falló.
    return results.some((r) => r.status === "fulfilled" && !r.value?.error);
  } catch {
    return false;
  }
}

// ----------------------------- Categorizar -----------------------------------

const MENTION_KINDS = new Set([
  "mention",
  "reply",
  "comment",
  "reply_comment",
  "comment_reply",
  "tag",
  "post_mention",
  "message",
]);
const INVITE_KINDS = new Set([
  "invite",
  "invitation",
  "request",
  "join_request",
  "friend_request",
  "follow_request",
  "membership",
  "access_request",
]);

/**
 * Asigna una de las 4 categorías de las pestañas del centro.
 *   • proposal → siempre 'politica'.
 *   • general → según `kind` (y, como respaldo, palabras clave en el texto).
 */
export function categorize(item: UnifiedNotification): NotificationCategoryKey {
  if (!item) return "otras";
  if (item.source === "proposal") return "politica";

  const kind = (item.kind || "").toLowerCase();
  if (MENTION_KINDS.has(kind)) return "menciones";
  if (INVITE_KINDS.has(kind)) return "invitaciones";

  // Heurística por palabras clave en kind/title si el `kind` no coincide.
  const hay = `${kind} ${(item.title || "").toLowerCase()}`;
  if (/(menci|respond|respuesta|coment|reply|@)/.test(hay)) return "menciones";
  if (/(invit|solicit|request|unir|membres)/.test(hay)) return "invitaciones";
  if (/(propuesta|votaci|gobern|decis|ontocrac|pol[ií]tic)/.test(hay)) return "politica";

  return "otras";
}

// ------------------------------ Agrupar --------------------------------------

/** Normaliza texto para comparar "temas" (sin tildes, minúsculas, sin dígitos). */
function topicSignature(item: UnifiedNotification): string {
  const base = `${item.kind || ""} ${item.title || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quitar diacríticos
    .replace(/https?:\/\/\S+/g, "") // quitar urls
    .replace(/\d+/g, "") // quitar números (ids, conteos)
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Tomamos las primeras palabras significativas como firma del tema.
  return base.split(" ").slice(0, 6).join(" ");
}

/**
 * Colapsa casi-duplicados en grupos. La clave combina categoría + (para
 * propuestas) el id de propuesta, o (para generales) la firma de tema + enlace.
 * Cada grupo conserva su item más reciente como `head`. Los grupos se ordenan
 * por la fecha del `head` desc.
 */
export function groupSimilar(items: UnifiedNotification[]): NotificationGroup[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const byKey = new Map<string, UnifiedNotification[]>();

  for (const item of items) {
    if (!item) continue;
    const cat = categorize(item);
    let key: string;
    if (item.source === "proposal" && item.proposalId) {
      // Toda la actividad de una misma propuesta se agrupa junta.
      key = `politica:prop:${item.proposalId}`;
    } else {
      const sig = topicSignature(item) || item.title || item.id;
      const linkPart = item.link || "";
      key = `${cat}:${sig}:${linkPart}`;
    }
    const arr = byKey.get(key);
    if (arr) arr.push(item);
    else byKey.set(key, [item]);
  }

  const groups: NotificationGroup[] = [];
  for (const [key, arr] of byKey.entries()) {
    // Recientes primero dentro del grupo.
    arr.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    const head = arr[0];
    groups.push({
      key,
      head,
      items: arr,
      count: arr.length,
      unread: arr.filter((i) => !i.seen).length,
      category: categorize(head),
    });
  }

  // Orden global: por fecha del representante, desc.
  groups.sort((a, b) =>
    a.head.created_at < b.head.created_at ? 1 : a.head.created_at > b.head.created_at ? -1 : 0,
  );
  return groups;
}

// ------------------------------ Resumen IA -----------------------------------

const CATEGORY_LABELS: Record<NotificationCategoryKey, string> = {
  menciones: "Menciones y respuestas",
  politica: "Actividad política",
  invitaciones: "Invitaciones y solicitudes",
  otras: "Otras",
};

/**
 * Genera un resumen breve en español de las notificaciones (idealmente las no
 * leídas). Usa el proveedor de IA activo vía `chat()`. Ante CUALQUIER error
 * (sin proveedor, sin clave, fallo de red) devuelve "" — el llamador decide
 * qué mostrar. No bloquea ni lanza.
 */
export async function summarize(items: UnifiedNotification[]): Promise<string> {
  if (typeof window === "undefined" || !Array.isArray(items) || items.length === 0) {
    return "";
  }

  try {
    // Conteo por categoría para dar contexto al modelo.
    const counts: Record<NotificationCategoryKey, number> = {
      menciones: 0,
      politica: 0,
      invitaciones: 0,
      otras: 0,
    };
    for (const it of items) counts[categorize(it)]++;

    // Tomamos hasta 20 items recientes para no inflar el prompt.
    const sample = items.slice(0, 20).map((it) => {
      const cat = CATEGORY_LABELS[categorize(it)];
      const text = (it.body || it.title || "").replace(/\s+/g, " ").trim().slice(0, 140);
      return `- [${cat}] ${it.title}: ${text}`;
    });

    const resumenConteo = (Object.keys(counts) as NotificationCategoryKey[])
      .filter((k) => counts[k] > 0)
      .map((k) => `${CATEGORY_LABELS[k]}: ${counts[k]}`)
      .join(" · ");

    const res = await chat({
      messages: [
        {
          role: "system",
          content:
            "Eres Astraura, el asistente de StarSeed OS. Resumes notificaciones de forma clara, " +
            "concisa y útil, SIEMPRE en español. No inventes datos. Prioriza lo accionable " +
            "(menciones que requieren respuesta, votaciones abiertas, invitaciones pendientes). " +
            "Devuelve 2-4 frases o viñetas cortas, sin preámbulos.",
        },
        {
          role: "user",
          content:
            `Tengo ${items.length} notificaciones. Reparto: ${resumenConteo || "varias"}.\n\n` +
            `Detalle reciente:\n${sample.join("\n")}\n\n` +
            "Resume lo más importante y qué conviene atender primero.",
        },
      ],
      temperature: 0.4,
      maxTokens: 320,
    });

    return (res?.text || "").trim();
  } catch {
    return "";
  }
}

// Etiquetas exportadas por conveniencia para la UI.
export const NOTIFICATION_CATEGORY_LABELS = CATEGORY_LABELS;
