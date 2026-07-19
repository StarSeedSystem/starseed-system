"use client";

/**
 * StarSeed OS — COMPARTIR ESPACIOS Y CHATS EN GRUPO (Adenda 76 · Agente G2)
 * ============================================================================
 * Reutiliza el modelo de permisos (`AccessGrant` de sharing/access.ts) y el
 * espejo REAL de `os_spaces` (spaces.ts, RLS + realtime verificados) para que un
 * espacio o un chat pueda usarse EN GRUPO sin DDL nuevo.
 *
 * QUÉ ES REAL (sin DDL):
 *   · Compartir un ESPACIO con cuentas/perfiles → se les invita como editores de
 *     un espejo `os_spaces` (kind "board"); aceptan la invitación al abrirlo y
 *     ven el snapshot del espacio en tiempo real (os_spaces está en realtime).
 *   · Compartir un ESPACIO con UN grupo → el espejo fija `group_slug`; cualquier
 *     miembro del grupo lo lee por `space_can_read` (os_memberships).
 *   · Compartir un CHAT en grupo → se crea/actualiza un espejo `os_spaces` con el
 *     SNAPSHOT del hilo (mensajes hasta ahora); los invitados lo leen y refresca
 *     en vivo cuando el dueño reexporta.
 *   · Indicador "Compartido con N" (grants) en la UI.
 *
 * QUÉ ES BETA (requiere DDL — se documenta con honestidad en la UI):
 *   · Co-presencia mensaje-a-mensaje sobre el MISMO hilo `astraura_messages`: la
 *     RLS filtra por `user_id`, así que un invitado NO puede leer los mensajes
 *     del dueño en vivo. Hasta que exista una política RLS/tabla puente, el chat
 *     compartido funciona por SNAPSHOT reexportable (no streaming en vivo).
 */

import type { AccessGrant, AccessRole, AccessScope, GranteeKind } from "@/lib/sharing/access";
import {
  createSpace,
  updateSpaceMeta,
  updateSpaceDoc,
  getSpace,
  inviteToSpace,
  resolveAccountByUsername,
  removeSpaceEditor,
  type SpaceAccess,
} from "@/lib/spaces/spaces";
import { cachedWorkspace, updateWorkspace, type Workspace } from "@/lib/workspaces/workspaces";
import { patchChatConfig } from "@/lib/aurora/config-change";
import { createClient } from "@/utils/supabase/client";
import { cachedConversations, cachedMessages } from "@/lib/aurora/conversations";

/* ───────────────────────────── Modelo de acceso ───────────────────────────── */

export interface WorkspaceAccess {
  scope: AccessScope;
  grants: AccessGrant[];
  /** Espejo os_spaces (null si aún no se compartió fuera de la cuenta). */
  spaceId?: string | null;
  updatedAt?: number;
}

export function normalizeAccess(raw: unknown): WorkspaceAccess {
  const a = (raw ?? {}) as Partial<WorkspaceAccess>;
  return {
    scope: (a.scope as AccessScope) ?? "account",
    grants: Array.isArray(a.grants) ? (a.grants as AccessGrant[]) : [],
    spaceId: a.spaceId ?? null,
    updatedAt: a.updatedAt,
  };
}

/** Nº de destinatarios (para el indicador "Compartido con N"). */
export function grantCount(access: WorkspaceAccess): number {
  return access.scope === "public" ? Math.max(1, access.grants.length) : access.grants.length;
}

function roleToEditor(role: AccessRole): "editor" | "viewer" {
  return role === "edit" || role === "admin" ? "editor" : "viewer";
}

function scopeToSpaceAccess(scope: AccessScope): SpaceAccess {
  if (scope === "public") return "public";
  if (scope === "groups") return "profiles"; // el group_slug del espejo gobierna la lectura por grupo
  return "invite";
}

/* ───────────────────────────── Espacios: espejo os_spaces ──────────────────── */

/** Snapshot del espacio para el doc del espejo (lo que ven los invitados). */
function workspaceSnapshotDoc(ws: Workspace): Record<string, unknown> {
  return {
    kind: "workspace",
    workspaceId: ws.id,
    name: ws.name,
    icon: ws.icon ?? null,
    description: ws.description ?? null,
    instructions: ws.instructions ?? null,
    counts: {
      chats: ws.chatIds.length,
      folders: ws.folderIds.length,
      files: ws.fileRefs.length,
      memories: ws.memoryIds.length,
      links: ws.links.length,
    },
    links: ws.links,
    personalityId: ws.personalityId ?? null,
    personalityMode: ws.personalityMode ?? "variable",
    sharedAt: Date.now(),
  };
}

/**
 * Asegura el espejo os_spaces del espacio (lo crea si no existe) y sincroniza su
 * snapshot. Devuelve el spaceId o null (sin sesión / error). Persiste el spaceId
 * en `workspace.access`.
 */
export async function ensureWorkspaceSpace(wsId: string): Promise<string | null> {
  const ws = cachedWorkspace(wsId);
  if (!ws) return null;
  const access = normalizeAccess(ws.access);
  const firstGroup = access.grants.find((g) => g.granteeKind === "group")?.granteeId ?? null;

  if (access.spaceId) {
    // Ya existe: refresca snapshot + metadatos de acceso.
    await updateSpaceDoc(access.spaceId, workspaceSnapshotDoc(ws));
    await updateSpaceMeta(access.spaceId, {
      title: ws.name,
      access: scopeToSpaceAccess(access.scope),
      groupSlug: firstGroup,
    });
    return access.spaceId;
  }

  const space = await createSpace({
    kind: "board",
    title: ws.name,
    access: scopeToSpaceAccess(access.scope),
    groupSlug: firstGroup,
    doc: workspaceSnapshotDoc(ws),
  });
  if (!space) return null;
  await updateWorkspace(wsId, {
    access: { ...access, spaceId: space.id, updatedAt: Date.now() },
  });
  return space.id;
}

/** Cambia el ámbito del espacio y refleja en el espejo. */
export async function setWorkspaceScope(wsId: string, scope: AccessScope): Promise<WorkspaceAccess> {
  const ws = cachedWorkspace(wsId);
  const access = normalizeAccess(ws?.access);
  const next: WorkspaceAccess = { ...access, scope, updatedAt: Date.now() };
  await updateWorkspace(wsId, { access: next });
  if (scope !== "private") {
    const spaceId = await ensureWorkspaceSpace(wsId);
    if (spaceId) next.spaceId = spaceId;
  }
  return next;
}

/**
 * Concede/actualiza un acceso a un espacio. Si el destinatario es una
 * cuenta/perfil resoluble, se le INVITA REALMENTE al espejo os_spaces. Si es un
 * grupo, el espejo fija su group_slug (miembros leen por RLS).
 */
export async function addWorkspaceGrant(wsId: string, grant: AccessGrant): Promise<WorkspaceAccess> {
  const ws = cachedWorkspace(wsId);
  const access = normalizeAccess(ws?.access);
  const grants = [
    ...access.grants.filter((g) => !(g.granteeKind === grant.granteeKind && g.granteeId === grant.granteeId)),
    grant,
  ];
  const next: WorkspaceAccess = {
    ...access,
    scope: access.scope === "private" || access.scope === "account" ? scopeFromGrant(grant) : access.scope,
    grants,
    updatedAt: Date.now(),
  };
  await updateWorkspace(wsId, { access: next });
  const spaceId = await ensureWorkspaceSpace(wsId);
  if (spaceId) {
    next.spaceId = spaceId;
    await inviteGrantToSpace(spaceId, grant);
  }
  return next;
}

function scopeFromGrant(grant: AccessGrant): AccessScope {
  if (grant.granteeKind === "group") return "groups";
  if (grant.granteeKind === "page") return "pages";
  return "profiles";
}

/** Retira un acceso (no punitivo: solo deja de compartir). */
export async function removeWorkspaceGrant(
  wsId: string,
  granteeKind: GranteeKind,
  granteeId: string,
): Promise<WorkspaceAccess> {
  const ws = cachedWorkspace(wsId);
  const access = normalizeAccess(ws?.access);
  const next: WorkspaceAccess = {
    ...access,
    grants: access.grants.filter((g) => !(g.granteeKind === granteeKind && g.granteeId === granteeId)),
    updatedAt: Date.now(),
  };
  await updateWorkspace(wsId, { access: next });
  if (access.spaceId && (granteeKind === "account" || granteeKind === "profile")) {
    const account = await resolveAccountByUsername(granteeId).catch(() => null);
    const target = account ?? granteeId;
    await removeSpaceEditor(access.spaceId, target).catch(() => false);
  }
  return next;
}

/** Invita al espejo la cuenta detrás de un grant (perfil/cuenta). Grupos → group_slug del espejo. */
async function inviteGrantToSpace(spaceId: string, grant: AccessGrant): Promise<void> {
  if (grant.granteeKind === "group" || grant.granteeKind === "page" || grant.granteeKind === "link") {
    // La lectura de grupo la resuelve group_slug del espejo (ya fijado en ensureWorkspaceSpace).
    return;
  }
  try {
    // granteeId puede ser un uuid de cuenta/perfil o un @username: intenta resolver.
    let account = grant.granteeId;
    if (!/^[0-9a-f-]{36}$/i.test(account)) {
      const resolved = await resolveAccountByUsername(account);
      if (resolved) account = resolved;
    }
    await inviteToSpace(spaceId, account, roleToEditor(grant.role));
  } catch {
    /* best-effort */
  }
}

/* ───────────────────────────── Chats: compartir en grupo ───────────────────── */

/** Grants guardados en el chat (meta.config.sharedWith). */
export function chatSharedWith(convId: string): AccessGrant[] {
  try {
    const conv = cachedConversations().find((c) => c.id === convId);
    const cfg = (conv?.meta as { config?: Record<string, unknown> } | null)?.config ?? {};
    const raw = (cfg as { sharedWith?: unknown }).sharedWith;
    return Array.isArray(raw) ? (raw as AccessGrant[]) : [];
  } catch {
    return [];
  }
}

/** spaceId del espejo del chat (meta.config.sharedSpaceId), o null. */
export function chatSharedSpaceId(convId: string): string | null {
  try {
    const conv = cachedConversations().find((c) => c.id === convId);
    const cfg = (conv?.meta as { config?: Record<string, unknown> } | null)?.config ?? {};
    const id = (cfg as { sharedSpaceId?: unknown }).sharedSpaceId;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

function chatSnapshotDoc(convId: string, title: string): Record<string, unknown> {
  const msgs = cachedMessages(convId)
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, text: m.text, ts: m.ts }));
  return { kind: "chat-snapshot", convId, title, messages: msgs, sharedAt: Date.now(), count: msgs.length };
}

export interface ShareChatResult {
  spaceId: string | null;
  grants: AccessGrant[];
  /** Nota honesta de limitación (co-presencia en vivo = beta). */
  betaNote: string;
}

/**
 * Comparte un chat en grupo: guarda el grant en el chat (meta.config.sharedWith)
 * y crea/actualiza un espejo os_spaces con el SNAPSHOT del hilo, invitando al
 * destinatario. REAL: el invitado ve el snapshot (y su refresco). BETA: no hay
 * streaming mensaje-a-mensaje del hilo original (RLS de astraura_messages).
 */
export async function shareChatWithGrant(convId: string, grant: AccessGrant): Promise<ShareChatResult> {
  const conv = cachedConversations().find((c) => c.id === convId);
  const title = conv?.title ?? "Chat";
  const existing = chatSharedWith(convId);
  const grants = [
    ...existing.filter((g) => !(g.granteeKind === grant.granteeKind && g.granteeId === grant.granteeId)),
    grant,
  ];

  // Espejo os_spaces con el snapshot del hilo.
  let spaceId = chatSharedSpaceId(convId);
  const firstGroup = grants.find((g) => g.granteeKind === "group")?.granteeId ?? null;
  const spaceAccess = grant.granteeKind === "link" ? "public" : firstGroup ? "profiles" : "invite";
  const doc = chatSnapshotDoc(convId, title);
  if (spaceId) {
    await updateSpaceDoc(spaceId, doc);
    await updateSpaceMeta(spaceId, { title: `Chat · ${title}`, access: spaceAccess as SpaceAccess, groupSlug: firstGroup });
  } else {
    const space = await createSpace({
      kind: "board",
      title: `Chat · ${title}`,
      access: spaceAccess as SpaceAccess,
      groupSlug: firstGroup,
      doc,
    });
    spaceId = space?.id ?? null;
  }
  if (spaceId) await inviteGrantToSpace(spaceId, grant);

  // Persiste en el chat (meta.config) — sincroniza por realtime a las superficies del dueño.
  await patchChatConfig(convId, { sharedWith: grants, sharedSpaceId: spaceId });

  return {
    spaceId,
    grants,
    betaNote:
      "Compartido por snapshot (beta): los invitados ven el hilo hasta ahora y sus reexportaciones. " +
      "La co-presencia mensaje-a-mensaje en vivo requiere un cambio de esquema (RLS) y está pendiente.",
  };
}

/** Reexporta el snapshot del chat compartido (actualiza el espejo con lo nuevo). */
export async function refreshSharedChatSnapshot(convId: string): Promise<boolean> {
  const spaceId = chatSharedSpaceId(convId);
  if (!spaceId) return false;
  const conv = cachedConversations().find((c) => c.id === convId);
  const title = conv?.title ?? "Chat";
  const res = await updateSpaceDoc(spaceId, chatSnapshotDoc(convId, title));
  return !!res;
}

/** Deja de compartir un chat con un destinatario. */
export async function unshareChatGrant(
  convId: string,
  granteeKind: GranteeKind,
  granteeId: string,
): Promise<AccessGrant[]> {
  const grants = chatSharedWith(convId).filter(
    (g) => !(g.granteeKind === granteeKind && g.granteeId === granteeId),
  );
  const spaceId = chatSharedSpaceId(convId);
  if (spaceId && (granteeKind === "account" || granteeKind === "profile")) {
    const account = await resolveAccountByUsername(granteeId).catch(() => null);
    await removeSpaceEditor(spaceId, account ?? granteeId).catch(() => false);
  }
  await patchChatConfig(convId, { sharedWith: grants });
  return grants;
}

/** ¿Existe realmente el espejo del chat? (para mostrar "Compartido con N" fiable). */
export async function verifySharedSpace(spaceId: string | null): Promise<boolean> {
  if (!spaceId) return false;
  const sp = await getSpace(spaceId).catch(() => null);
  return !!sp;
}
