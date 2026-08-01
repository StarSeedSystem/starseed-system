"use client";

// StarSeed · Área Política — Extensiones ADITIVAS del motor de Ontocracia
// (src/lib/governance/engine.ts) para las PROPUESTAS DEMOCRÁTICAS AVANZADAS
// de /network/politics: opciones dinámicas, duración en días con cuenta
// regresiva, registro público verificable, enmiendas democráticas con
// historial, notificaciones inteligentes ("afecta a" + recordatorios por
// urgencia), mandatos ejecutivos y casos judiciales/mediación.
//
// DISEÑO: no se modifica el esquema de `proposals` (columnas reales: id,
// scope, scope_ref, author, title, description, kind, options, attachments,
// command, params jsonb, status, result jsonb, created_at…). Todo lo nuevo
// vive en `params.political` (jsonb libre, mismo patrón ya usado por
// `params.reach` en reach.ts) y en `result.execution` (jsonb libre, mismo
// patrón que `result.command`). Cero cambios al motor compartido
// (engine.ts/types.ts/delegations.ts/reach.ts) → cero riesgo de regresión en
// grupos/páginas/comunidades/EF/partidos que ya usan ese motor.
//
// Recursos comunes y casos de mediación NO tienen tabla dedicada: se guardan
// en `entity_state` (owner_kind:"other", owner_id:"network-politics") — la
// infraestructura real de estado-por-entidad del repo (ver
// src/lib/sync/entity-state.ts). Como la política RLS exacta de ese ámbito
// "other" no está documentada en las migraciones locales, cada escritura
// intenta la nube y SIEMPRE espeja en localStorage; la lectura prefiere la
// nube y cae a local si la nube no devuelve nada — mismo principio
// "local-first" que ya declara entity-state.ts.
//
// Todo defensivo (try/catch, nunca lanza) — filosofía del repo.

import { createClient } from "@/utils/supabase/client";
import { membersFromMemberships } from "./membership";
import { getEntityState, setEntityState, type EntityRef } from "@/lib/sync/entity-state";
import {
  URGENCY,
  type Proposal,
  type ProposalOption,
  type ProposalVote,
  type Urgency,
} from "@/lib/governance/types";

// ─────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────

/** Entidad etiquetada como "afectada" por una propuesta política. */
export interface AffectedEntity {
  /** Tipo canónico: ef | partido | comunidad | asamblea | grupo | pagina. */
  kind: string;
  /** Slug o id de la entidad. */
  slug: string;
  /** Etiqueta legible opcional (nombre ya resuelto). */
  label?: string;
}

/** Alternativa propuesta en comentario/formulario, pendiente de promoción. */
export interface PendingOption {
  id: string;
  label: string;
  proposedBy: string | null;
  proposedByLabel?: string;
  createdAt: string;
  /** user_ids que han votado "promover a opción oficial" (deduplicado). */
  promotedBy: string[];
}

/** Enmienda democrática: un cambio de título/descripción sujeto a votación. */
export interface Amendment {
  id: string;
  proposedBy: string | null;
  proposedByLabel?: string;
  createdAt: string;
  changes: { title?: string; description?: string };
  votesFor: string[];
  votesAgainst: string[];
  status: "pending" | "approved" | "rejected";
  resolvedAt?: string;
}

/** Copia del estado anterior antes de aplicar una enmienda (historial). */
export interface EditHistoryEntry {
  title: string;
  description: string | null;
  editedAt: string;
  amendmentId?: string;
}

export type DurationPreset = "1d" | "3d" | "7d" | "14d" | "30d";

export const DURATION_PRESETS: { id: DurationPreset; label: string; minutes: number }[] = [
  { id: "1d", label: "1 día", minutes: 1 * 24 * 60 },
  { id: "3d", label: "3 días", minutes: 3 * 24 * 60 },
  { id: "7d", label: "7 días", minutes: 7 * 24 * 60 },
  { id: "14d", label: "14 días", minutes: 14 * 24 * 60 },
  { id: "30d", label: "30 días", minutes: 30 * 24 * 60 },
];

/** Mínimo obligatorio para propuestas políticas: 1 día. */
export const MIN_POLITICAL_VOTING_MINUTES = 24 * 60;

export function minutesForPreset(preset: DurationPreset): number {
  return DURATION_PRESETS.find((p) => p.id === preset)?.minutes ?? MIN_POLITICAL_VOTING_MINUTES;
}

export interface ReminderState {
  /** Fracciones (0-1) del periodo de votación ya notificadas. */
  firedFractions: number[];
  /** ¿Ya se notificó el aviso de "último día"? */
  firedLastDay: boolean;
}

/** Metadatos políticos guardados en proposals.params.political (todo opcional). */
export interface PoliticalMeta {
  affects: AffectedEntity[];
  pendingOptions: PendingOption[];
  amendments: Amendment[];
  editHistory: EditHistoryEntry[];
  promoteThreshold: number;
  durationPreset: DurationPreset | null;
  relatesTo: { proposalId: string } | null;
  reminders: ReminderState;
}

const EMPTY_POLITICAL: PoliticalMeta = {
  affects: [],
  pendingOptions: [],
  amendments: [],
  editHistory: [],
  promoteThreshold: 3,
  durationPreset: null,
  relatesTo: null,
  reminders: { firedFractions: [], firedLastDay: false },
};

/** Extrae (con defaults seguros) los metadatos políticos de una propuesta. */
export function getPolitical(proposal: Pick<Proposal, "params">): PoliticalMeta {
  const raw = (proposal?.params as Record<string, unknown> | null | undefined)?.political as
    | Partial<PoliticalMeta>
    | undefined;
  if (!raw || typeof raw !== "object") return { ...EMPTY_POLITICAL };
  return {
    affects: Array.isArray(raw.affects) ? raw.affects : [],
    pendingOptions: Array.isArray(raw.pendingOptions) ? raw.pendingOptions : [],
    amendments: Array.isArray(raw.amendments) ? raw.amendments : [],
    editHistory: Array.isArray(raw.editHistory) ? raw.editHistory : [],
    promoteThreshold: typeof raw.promoteThreshold === "number" && raw.promoteThreshold > 0 ? raw.promoteThreshold : 3,
    durationPreset: (raw.durationPreset as DurationPreset) ?? null,
    relatesTo: raw.relatesTo ?? null,
    reminders: {
      firedFractions: Array.isArray(raw.reminders?.firedFractions) ? raw.reminders!.firedFractions : [],
      firedLastDay: !!raw.reminders?.firedLastDay,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Utilidades internas
// ─────────────────────────────────────────────────────────────────────────

function rid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function currentUser(): Promise<{ id: string | null; label: string }> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id ?? null;
    if (!uid) return { id: null, label: "Alguien" };
    return { id: uid, label: await labelForUser(uid) };
  } catch {
    return { id: null, label: "Alguien" };
  }
}

/** Resuelve un nombre legible para un user_id (best-effort, nunca lanza). */
export async function labelForUser(userId: string | null | undefined): Promise<string> {
  if (!userId) return "Alguien";
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("display_name, handle")
      .eq("user_id", userId)
      .maybeSingle();
    const row = data as { display_name?: string | null; handle?: string | null } | null;
    return row?.display_name || (row?.handle ? `@${row.handle}` : userId.slice(0, 8) + "…");
  } catch {
    return userId.slice(0, 8) + "…";
  }
}

/** Lee la fila fresca de una propuesta (params/options/result/title/description). */
async function readFreshProposal(
  proposalId: string,
): Promise<Pick<Proposal, "id" | "title" | "description" | "options" | "params" | "result"> | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("proposals")
    .select("id, title, description, options, params, result")
    .eq("id", proposalId)
    .maybeSingle();
  if (error || !data) return null;
  return data as any;
}

async function patchParamsPolitical(
  proposalId: string,
  mutate: (political: PoliticalMeta) => PoliticalMeta,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  try {
    const fresh = await readFreshProposal(proposalId);
    if (!fresh) return { ok: false, error: "Propuesta no encontrada." };
    const current = getPolitical({ params: fresh.params });
    const next = mutate(current);
    const nextParams = { ...((fresh.params as Record<string, unknown>) ?? {}), political: next };
    const { error } = await supabase.from("proposals").update({ params: nextParams }).eq("id", proposalId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo guardar." };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Adjuntar metadatos políticos al crear (composer) — no toca engine.ts
// ─────────────────────────────────────────────────────────────────────────

/** Fusiona metadatos políticos (afecta-a, umbral de promoción, duración…) recién tras crear la propuesta. */
export async function attachPoliticalMeta(
  proposalId: string,
  patch: Partial<Pick<PoliticalMeta, "affects" | "promoteThreshold" | "durationPreset" | "relatesTo">>,
): Promise<{ ok: boolean; error?: string }> {
  return patchParamsPolitical(proposalId, (cur) => ({
    ...cur,
    ...(patch.affects !== undefined ? { affects: patch.affects } : {}),
    ...(patch.promoteThreshold !== undefined ? { promoteThreshold: patch.promoteThreshold } : {}),
    ...(patch.durationPreset !== undefined ? { durationPreset: patch.durationPreset } : {}),
    ...(patch.relatesTo !== undefined ? { relatesTo: patch.relatesTo } : {}),
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Opciones dinámicas (comentarios que proponen alternativas)
// ─────────────────────────────────────────────────────────────────────────

export async function proposeDynamicOption(
  proposalId: string,
  label: string,
): Promise<{ ok: boolean; error?: string }> {
  const clean = label.trim();
  if (!clean) return { ok: false, error: "Escribe la alternativa que propones." };
  const actor = await currentUser();
  if (!actor.id) return { ok: false, error: "Inicia sesión para proponer una alternativa." };
  const entry: PendingOption = {
    id: rid("popt"),
    label: clean,
    proposedBy: actor.id,
    proposedByLabel: actor.label,
    createdAt: new Date().toISOString(),
    promotedBy: [],
  };
  return patchParamsPolitical(proposalId, (cur) => ({
    ...cur,
    pendingOptions: [...cur.pendingOptions, entry],
  }));
}

/** Vota "promover a opción oficial"; al alcanzar el umbral, se añade a `options`. */
export async function promoteOption(
  proposalId: string,
  pendingId: string,
): Promise<{ ok: boolean; promoted?: boolean; error?: string }> {
  const actor = await currentUser();
  if (!actor.id) return { ok: false, error: "Inicia sesión para promover una opción." };
  const supabase = createClient();
  try {
    const fresh = await readFreshProposal(proposalId);
    if (!fresh) return { ok: false, error: "Propuesta no encontrada." };
    const political = getPolitical({ params: fresh.params });
    const idx = political.pendingOptions.findIndex((p) => p.id === pendingId);
    if (idx === -1) return { ok: false, error: "Esa alternativa ya no está pendiente." };
    const target = { ...political.pendingOptions[idx] };
    if (!target.promotedBy.includes(actor.id)) target.promotedBy = [...target.promotedBy, actor.id];

    const threshold = political.promoteThreshold || 3;
    const promoted = target.promotedBy.length >= threshold;

    const nextPending = [...political.pendingOptions];
    let nextOptions: ProposalOption[] = Array.isArray(fresh.options) ? [...fresh.options] : [];

    if (promoted) {
      nextPending.splice(idx, 1);
      nextOptions = [...nextOptions, { id: rid("opt"), label: target.label, description: `Alternativa propuesta por ${target.proposedByLabel ?? "un participante"}` }];
    } else {
      nextPending[idx] = target;
    }

    const nextParams = {
      ...((fresh.params as Record<string, unknown>) ?? {}),
      political: { ...political, pendingOptions: nextPending },
    };
    const update: Record<string, unknown> = { params: nextParams };
    if (promoted) update.options = nextOptions;

    const { error } = await supabase.from("proposals").update(update).eq("id", proposalId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, promoted };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo registrar la promoción." };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Enmiendas democráticas (edición con historial y votación)
// ─────────────────────────────────────────────────────────────────────────

/** Umbral simple: al menos 3 votos emitidos y mayoría a favor (mismo criterio que group-governance). */
const AMENDMENT_MIN_VOTES = 3;

export async function proposeAmendment(
  proposalId: string,
  changes: { title?: string; description?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!changes.title?.trim() && !changes.description?.trim()) {
    return { ok: false, error: "Indica el nuevo título o la nueva descripción." };
  }
  const actor = await currentUser();
  if (!actor.id) return { ok: false, error: "Inicia sesión para proponer una enmienda." };
  const entry: Amendment = {
    id: rid("amd"),
    proposedBy: actor.id,
    proposedByLabel: actor.label,
    createdAt: new Date().toISOString(),
    changes: {
      ...(changes.title?.trim() ? { title: changes.title.trim() } : {}),
      ...(changes.description?.trim() ? { description: changes.description.trim() } : {}),
    },
    votesFor: [],
    votesAgainst: [],
    status: "pending",
  };
  return patchParamsPolitical(proposalId, (cur) => ({ ...cur, amendments: [...cur.amendments, entry] }));
}

export async function voteAmendment(
  proposalId: string,
  amendmentId: string,
  support: boolean,
): Promise<{ ok: boolean; applied?: boolean; error?: string }> {
  const actor = await currentUser();
  if (!actor.id) return { ok: false, error: "Inicia sesión para votar la enmienda." };
  const supabase = createClient();
  try {
    const fresh = await readFreshProposal(proposalId);
    if (!fresh) return { ok: false, error: "Propuesta no encontrada." };
    const political = getPolitical({ params: fresh.params });
    const idx = political.amendments.findIndex((a) => a.id === amendmentId);
    if (idx === -1) return { ok: false, error: "Esa enmienda ya no existe." };
    const amd = { ...political.amendments[idx] };
    if (amd.status !== "pending") return { ok: false, error: "Esa enmienda ya se resolvió." };

    amd.votesFor = amd.votesFor.filter((v) => v !== actor.id);
    amd.votesAgainst = amd.votesAgainst.filter((v) => v !== actor.id);
    if (support) amd.votesFor = [...amd.votesFor, actor.id];
    else amd.votesAgainst = [...amd.votesAgainst, actor.id];

    const total = amd.votesFor.length + amd.votesAgainst.length;
    let applied = false;
    const nextAmendments = [...political.amendments];

    let nextTitle = fresh.title;
    let nextDescription = fresh.description;
    let nextEditHistory = political.editHistory;

    if (total >= AMENDMENT_MIN_VOTES) {
      if (amd.votesFor.length > amd.votesAgainst.length) {
        amd.status = "approved";
        amd.resolvedAt = new Date().toISOString();
        nextEditHistory = [
          ...political.editHistory,
          { title: fresh.title, description: fresh.description ?? null, editedAt: amd.resolvedAt, amendmentId: amd.id },
        ];
        nextTitle = amd.changes.title ?? fresh.title;
        nextDescription = amd.changes.description ?? fresh.description;
        applied = true;
      } else if (amd.votesAgainst.length > amd.votesFor.length) {
        amd.status = "rejected";
        amd.resolvedAt = new Date().toISOString();
      }
    }
    nextAmendments[idx] = amd;

    const nextParams = {
      ...((fresh.params as Record<string, unknown>) ?? {}),
      political: { ...political, amendments: nextAmendments, editHistory: nextEditHistory },
    };
    const update: Record<string, unknown> = { params: nextParams };
    if (applied) {
      update.title = nextTitle;
      update.description = nextDescription;
    }
    const { error } = await supabase.from("proposals").update(update).eq("id", proposalId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, applied };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo registrar el voto de enmienda." };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Registro público verificable (cadena de huellas sobre los votos)
// ─────────────────────────────────────────────────────────────────────────

export interface VoteChainEntry {
  vote: ProposalVote;
  index: number;
  hash: string;
  prevHash: string;
}

async function sha256Hex(input: string): Promise<string> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const enc = new TextEncoder().encode(input);
      const buf = await crypto.subtle.digest("SHA-256", enc);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    /* cae al fallback no-criptográfico */
  }
  // Fallback FNV-1a (NO criptográfico) — sólo si crypto.subtle no está disponible.
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "fnv1a:" + (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Calcula una cadena de huellas SHA-256 sobre los votos (orden = created_at).
 * hash[i] = sha256(hash[i-1] + voter + choice + created_at + comment). Cualquier
 * alteración o reordenación de un voto rompe la cadena a partir de ese punto:
 * es un registro público VERIFICABLE (tamper-evident), aunque se calcula y
 * verifica en el cliente (no está anclado en un servidor/notario externo).
 */
export async function computeVoteChain(votes: ProposalVote[]): Promise<VoteChainEntry[]> {
  const sorted = [...votes].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  const out: VoteChainEntry[] = [];
  let prev = "genesis";
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    const payload = `${prev}|${v.voter}|${v.choice}|${v.created_at}|${v.comment ?? ""}`;
    const hash = await sha256Hex(payload);
    out.push({ vote: v, index: i + 1, hash, prevHash: prev });
    prev = hash;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// "Afecta a" — resolución de miembros + notificaciones inteligentes
// ─────────────────────────────────────────────────────────────────────────

// Mapa kind de entidad → scope de gobernanza (mismo criterio que
// decisiones-section.tsx, duplicado aquí para no importar entre lib↔componente).
const AFFECTED_KIND_TO_SCOPE: Record<string, string> = {
  comunidad: "community",
  community: "community",
  ef: "community",
  entidad: "community",
  asamblea: "community",
  partido: "community",
  page: "page",
  pagina: "page",
  grupo: "group",
  group: "group",
};

async function membersOfAffected(entity: AffectedEntity): Promise<string[]> {
  const scope = AFFECTED_KIND_TO_SCOPE[entity.kind?.toLowerCase?.() ?? ""] ?? "community";

  const ids = new Set<string>();
  // FUENTE PRINCIPAL: membresía real desde `os_memberships` por `group_slug` (= slug).
  for (const u of await membersFromMemberships(entity.slug)) ids.add(u);

  // Censo histórico — se UNE (no se sustituye) para no dejar SIN AVISAR a miembros
  // legados de la entidad afectada (revisión adversarial Adenda 124: antes un
  // os_memberships parcial ocultaba a los legados en las notificaciones "afecta a").
  const supabase = createClient();
  try {
    if (scope === "page" || scope === "community") {
      const { data } = await supabase
        .from("page_members")
        .select("profile_id, profiles:profile_id(user_id)")
        .eq("page_id", entity.slug)
        .limit(5000);
      for (const row of (data as any[]) ?? []) {
        const u = row?.profiles?.user_id ?? row?.profile_id;
        if (u) ids.add(u);
      }
    } else if (scope === "group") {
      const { data } = await supabase.from("group_members").select("member").eq("group_id", entity.slug).limit(5000);
      for (const row of (data as any[]) ?? []) if (row?.member) ids.add(row.member);
    }
  } catch {
    /* sin censo conocido para esta entidad */
  }
  return Array.from(ids);
}

/** Resuelve (deduplicados) los user_ids de todas las entidades etiquetadas como afectadas. */
export async function resolveAffectedMemberIds(affects: AffectedEntity[]): Promise<string[]> {
  if (!affects?.length) return [];
  const sets = await Promise.all(affects.map((a) => membersOfAffected(a)));
  return Array.from(new Set(sets.flat()));
}

/**
 * Notifica (kind: 'affected') a los miembros de las entidades etiquetadas,
 * EXCLUYENDO a quienes ya reciben 'vote_request' directo (para no duplicar).
 */
export async function sendAffectedNotifications(
  proposalId: string,
  title: string,
  affects: AffectedEntity[],
  excludeIds: string[] = [],
): Promise<number> {
  if (!affects?.length) return 0;
  try {
    const supabase = createClient();
    const exclude = new Set(excludeIds);
    const ids = (await resolveAffectedMemberIds(affects)).filter((id) => !exclude.has(id));
    if (!ids.length) return 0;
    const entityLabels = affects.map((a) => a.label || `${a.kind}:${a.slug}`).join(", ");
    const rows = ids.map((uid) => ({
      proposal_id: proposalId,
      user_id: uid,
      kind: "affected",
      message: `Te afecta una propuesta política: "${title}" (etiqueta: ${entityLabels})`,
      seen: false,
    }));
    await supabase.from("proposal_notifications").insert(rows);
    return rows.length;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Recordatorios inteligentes (50% + último día), modulados por urgencia
// ─────────────────────────────────────────────────────────────────────────

// Fracciones EXTRA de aviso según urgencia (además del 50% y "último día" base):
// más urgencia → más recordatorios (frecuencia) y colores más intensos (estilo,
// vía URGENCY[...].color que ya consume la UI).
const URGENCY_EXTRA_FRACTIONS: Record<Urgency, number[]> = {
  low: [],
  normal: [],
  high: [0.75],
  critical: [0.25, 0.75],
};

/**
 * Revisa una propuesta ABIERTA y, si procede, envía recordatorios (50% del
 * tiempo, checkpoints extra por urgencia, y "último día" — o, si la ventana
 * total es más corta que 1 día, el último 20% de tiempo restante). Marca lo ya
 * enviado en params.political.reminders para no repetir. Es "best-effort" y se
 * dispara de forma oportunista cuando alguien visualiza la propuesta (no hay
 * cron de servidor todavía — ver MEJORAS PARA PRÓXIMO DESARROLLO).
 */
export async function checkAndSendReminders(proposal: Proposal): Promise<void> {
  if (proposal.status !== "open") return;
  const endsAtIso = proposal.params?.votingEndsAt;
  if (!endsAtIso) return;
  const endsAt = new Date(endsAtIso).getTime();
  const totalMinutes = Number(proposal.params?.votingMinutes) || 0;
  if (!totalMinutes) return;
  const startAt = endsAt - totalMinutes * 60_000;
  const now = Date.now();
  if (now < startAt || now >= endsAt) return;

  const elapsedFraction = (now - startAt) / (endsAt - startAt);
  const urgency = (proposal.params?.urgency as Urgency) || "normal";
  const fractionsToCheck = [0.5, ...URGENCY_EXTRA_FRACTIONS[urgency]].sort((a, b) => a - b);

  const political = getPolitical(proposal);
  const already = new Set(political.reminders.firedFractions);
  const dueFractions = fractionsToCheck.filter((f) => elapsedFraction >= f && !already.has(f));

  const lastDayWindowMs = Math.min(24 * 60 * 60_000, totalMinutes * 60_000 * 0.2);
  const dueLastDay = !political.reminders.firedLastDay && endsAt - now <= lastDayWindowMs;

  if (!dueFractions.length && !dueLastDay) return;

  // Marca ANTES de notificar (evita reintentos duplicados en carreras leves).
  const res = await patchParamsPolitical(proposal.id, (cur) => ({
    ...cur,
    reminders: {
      firedFractions: Array.from(new Set([...cur.reminders.firedFractions, ...dueFractions])),
      firedLastDay: cur.reminders.firedLastDay || dueLastDay,
    },
  }));
  if (!res.ok) return;

  try {
    const supabase = createClient();
    const targets = new Set<string>();
    // Participantes ya notificados originalmente (vote_request) + afectados.
    const affected = await resolveAffectedMemberIds(political.affects);
    for (const id of affected) targets.add(id);
    // Además, quienes ya han votado (les interesa saber que se acerca el cierre).
    const { data: votes } = await supabase.from("proposal_votes").select("voter").eq("proposal_id", proposal.id);
    for (const row of (votes as { voter: string }[]) ?? []) targets.add(row.voter);

    if (!targets.size) return;
    const uMeta = URGENCY[urgency] ?? URGENCY.normal;
    const label = dueLastDay
      ? `[${uMeta.label}] Último tramo para votar "${proposal.title}" — la votación cierra pronto.`
      : `[${uMeta.label}] Recordatorio: sigue abierta la votación de "${proposal.title}" (${Math.round(elapsedFraction * 100)}% del tiempo transcurrido).`;
    const rows = Array.from(targets).map((uid) => ({
      proposal_id: proposal.id,
      user_id: uid,
      kind: "reminder",
      message: label,
      seen: false,
    }));
    await supabase.from("proposal_notifications").insert(rows);
  } catch {
    /* recordatorio best-effort */
  }
}

// ─────────────────────────────────────────────────────────────────────────
// EJECUTIVO — mandatos (ejecución de decisiones aprobadas)
// ─────────────────────────────────────────────────────────────────────────

export type ExecutionStatus = "pendiente" | "en_ejecucion" | "completado";

export interface ExecutionReport {
  by: string | null;
  byLabel?: string;
  note: string;
  progress?: number;
  at: string;
}

export interface ExecutionState {
  status: ExecutionStatus;
  progress: number;
  responsible: string | null;
  responsibleLabel: string | null;
  reports: ExecutionReport[];
}

const EMPTY_EXECUTION: ExecutionState = {
  status: "pendiente",
  progress: 0,
  responsible: null,
  responsibleLabel: null,
  reports: [],
};

/** Extrae el estado de ejecución (mandato) de una propuesta aprobada/ejecutada. */
export function getExecution(proposal: Pick<Proposal, "status" | "result">): ExecutionState {
  const raw = (proposal.result as Record<string, unknown> | null)?.execution as Partial<ExecutionState> | undefined;
  const base: ExecutionState = raw
    ? {
        status: (raw.status as ExecutionStatus) ?? "pendiente",
        progress: typeof raw.progress === "number" ? raw.progress : 0,
        responsible: raw.responsible ?? null,
        responsibleLabel: raw.responsibleLabel ?? null,
        reports: Array.isArray(raw.reports) ? raw.reports : [],
      }
    : { ...EMPTY_EXECUTION };
  // Un comando ejecutado automáticamente por el motor implica mandato completado.
  if (proposal.status === "executed" && base.status !== "completado") {
    return { ...base, status: "completado", progress: 100 };
  }
  return base;
}

async function patchExecution(
  proposalId: string,
  mutate: (exec: ExecutionState) => ExecutionState,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase.from("proposals").select("status, result").eq("id", proposalId).maybeSingle();
    if (error || !data) return { ok: false, error: error?.message ?? "Mandato no encontrado." };
    const current = getExecution(data as any);
    const next = mutate(current);
    const nextResult = { ...((data.result as Record<string, unknown>) ?? {}), execution: next };
    const { error: upErr } = await supabase.from("proposals").update({ result: nextResult }).eq("id", proposalId);
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo actualizar el mandato." };
  }
}

export async function assignResponsible(proposalId: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await currentUser();
  if (!actor.id) return { ok: false, error: "Inicia sesión para asignarte el mandato." };
  return patchExecution(proposalId, (cur) => ({ ...cur, responsible: actor.id, responsibleLabel: actor.label }));
}

export async function setExecutionStatus(
  proposalId: string,
  status: ExecutionStatus,
): Promise<{ ok: boolean; error?: string }> {
  return patchExecution(proposalId, (cur) => ({
    ...cur,
    status,
    progress: status === "completado" ? 100 : cur.progress,
  }));
}

export async function addExecutionReport(
  proposalId: string,
  note: string,
  progress?: number,
): Promise<{ ok: boolean; error?: string }> {
  const clean = note.trim();
  if (!clean) return { ok: false, error: "Escribe una nota de avance." };
  const actor = await currentUser();
  const entry: ExecutionReport = {
    by: actor.id,
    byLabel: actor.label,
    note: clean,
    progress,
    at: new Date().toISOString(),
  };
  return patchExecution(proposalId, (cur) => ({
    ...cur,
    reports: [...cur.reports, entry],
    progress: typeof progress === "number" ? progress : cur.progress,
    status: cur.status === "pendiente" ? "en_ejecucion" : cur.status,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Recursos comunes + casos de mediación — entity_state con espejo local
// ─────────────────────────────────────────────────────────────────────────

const POLITICS_REF: EntityRef = { kind: "other", id: "network-politics" };
const RESOURCES_KEY = "gov:resources";
const MEDIATION_KEY = "gov:mediation-cases";
const LOCAL_RESOURCES_KEY = "starseed.politics.resources.v1";
const LOCAL_MEDIATION_KEY = "starseed.politics.mediation.v1";

function readLocal<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal<T>(key: string, list: T[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

export interface CommonsResource {
  id: string;
  name: string;
  type: string;
  status: "Disponible" | "En uso" | "Mantenimiento";
  assignedTo?: string | null;
  assignedLabel?: string | null;
  notes?: string;
  updatedAt: string;
}

/** Carga los recursos comunes: nube primero, local si la nube no responde. Espeja siempre en local. */
export async function loadCommonsResources(): Promise<{ list: CommonsResource[]; degraded: boolean }> {
  try {
    const row = await getEntityState<CommonsResource[]>(POLITICS_REF, RESOURCES_KEY);
    if (row && Array.isArray(row.value)) {
      writeLocal(LOCAL_RESOURCES_KEY, row.value);
      return { list: row.value, degraded: false };
    }
  } catch {
    /* nube no disponible */
  }
  return { list: readLocal<CommonsResource>(LOCAL_RESOURCES_KEY), degraded: true };
}

/** Guarda la lista completa (nube + espejo local). `degraded:true` si la nube falló. */
export async function saveCommonsResources(list: CommonsResource[]): Promise<{ ok: boolean; degraded: boolean }> {
  writeLocal(LOCAL_RESOURCES_KEY, list);
  try {
    const row = await setEntityState(POLITICS_REF, RESOURCES_KEY, list);
    return { ok: true, degraded: !row };
  } catch {
    return { ok: true, degraded: true };
  }
}

export async function upsertCommonsResource(input: Omit<CommonsResource, "updatedAt"> & { updatedAt?: string }) {
  const { list } = await loadCommonsResources();
  const now = new Date().toISOString();
  const idx = list.findIndex((r) => r.id === input.id);
  const entry: CommonsResource = { ...input, updatedAt: now };
  const next = idx === -1 ? [...list, entry] : list.map((r, i) => (i === idx ? entry : r));
  return saveCommonsResources(next);
}

export async function removeCommonsResource(id: string) {
  const { list } = await loadCommonsResources();
  return saveCommonsResources(list.filter((r) => r.id !== id));
}

export type MediationStage = "solicitada" | "facilitador_asignado" | "en_circulo" | "acuerdo" | "sin_acuerdo";

export const MEDIATION_STAGE_LABEL: Record<MediationStage, string> = {
  solicitada: "Solicitada",
  facilitador_asignado: "Facilitador asignado",
  en_circulo: "En Círculo de Paz",
  acuerdo: "Acuerdo alcanzado",
  sin_acuerdo: "Sin acuerdo",
};

export interface MediationUpdate {
  by: string | null;
  byLabel?: string;
  note: string;
  at: string;
}

export interface MediationCase {
  id: string;
  title: string;
  description: string;
  participants: string[];
  facilitator?: string | null;
  stage: MediationStage;
  createdBy: string | null;
  createdByLabel?: string;
  createdAt: string;
  updates: MediationUpdate[];
}

export async function loadMediationCases(): Promise<{ list: MediationCase[]; degraded: boolean }> {
  try {
    const row = await getEntityState<MediationCase[]>(POLITICS_REF, MEDIATION_KEY);
    if (row && Array.isArray(row.value)) {
      writeLocal(LOCAL_MEDIATION_KEY, row.value);
      return { list: row.value, degraded: false };
    }
  } catch {
    /* nube no disponible */
  }
  return { list: readLocal<MediationCase>(LOCAL_MEDIATION_KEY), degraded: true };
}

async function saveMediationCases(list: MediationCase[]): Promise<{ ok: boolean; degraded: boolean }> {
  writeLocal(LOCAL_MEDIATION_KEY, list);
  try {
    const row = await setEntityState(POLITICS_REF, MEDIATION_KEY, list);
    return { ok: true, degraded: !row };
  } catch {
    return { ok: true, degraded: true };
  }
}

export async function createMediationCase(input: {
  title: string;
  description: string;
  participants: string[];
}): Promise<{ ok: boolean; error?: string; degraded?: boolean }> {
  if (!input.title.trim()) return { ok: false, error: "Ponle un título al caso." };
  const actor = await currentUser();
  const { list } = await loadMediationCases();
  const entry: MediationCase = {
    id: rid("med"),
    title: input.title.trim(),
    description: input.description.trim(),
    participants: input.participants.filter(Boolean),
    facilitator: null,
    stage: "solicitada",
    createdBy: actor.id,
    createdByLabel: actor.label,
    createdAt: new Date().toISOString(),
    updates: [],
  };
  const res = await saveMediationCases([entry, ...list]);
  return { ok: res.ok, degraded: res.degraded };
}

export async function updateMediationCase(
  id: string,
  patch: { stage?: MediationStage; facilitator?: string; note?: string },
): Promise<{ ok: boolean; error?: string; degraded?: boolean }> {
  const actor = await currentUser();
  const { list } = await loadMediationCases();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return { ok: false, error: "Caso no encontrado." };
  const cur = { ...list[idx] };
  if (patch.stage) cur.stage = patch.stage;
  if (patch.facilitator !== undefined) cur.facilitator = patch.facilitator;
  if (patch.note?.trim() || patch.stage) {
    cur.updates = [
      ...cur.updates,
      {
        by: actor.id,
        byLabel: actor.label,
        note: patch.note?.trim() || `Estado actualizado a «${MEDIATION_STAGE_LABEL[patch.stage ?? cur.stage]}»`,
        at: new Date().toISOString(),
      },
    ];
  }
  const next = [...list];
  next[idx] = cur;
  const res = await saveMediationCases(next);
  return { ok: res.ok, degraded: res.degraded };
}

// ─────────────────────────────────────────────────────────────────────────
// Documentos constitucionales (referencia estática — CLAUDE.md §10)
// ─────────────────────────────────────────────────────────────────────────

export interface ConstitutionalDoc {
  title: string;
  url: string;
}

export const CONSTITUTIONAL_DOCUMENTS: ConstitutionalDoc[] = [
  { title: "Constitución de la Sociedad StarSeed", url: "https://docs.google.com/document/d/1XpltI3gkYN1Ma2wBVrlisPagL_HfeoF1RsnFKG09w4I/edit" },
  { title: "Manifiesto Fundacional", url: "https://docs.google.com/document/d/1YiX9QK_JJHbmRMRj8fXrJeNffsDQ8T2RhzMHTeyavA0/edit" },
  { title: "Codex StarSeed (Arquitectura social y hábitat)", url: "https://docs.google.com/document/d/1Q7ygZvMlrVD4I7nO36jC4t8ttFezw__2K_w54L6HXNc/edit" },
  { title: "Documento Maestro del SOSD", url: "https://docs.google.com/document/d/1DaX2bl8dIMSKR1yVtOHqh3iVtV_sLARMiSPFGkywa3M/edit" },
];
