"use client";

/*
 * mediation-entity — Justicia RESTAURATIVA por ENTIDAD (grupo / página /
 * comunidad / E.F. / partido): procesos de mediación y Círculos de Paz
 * anclados al ámbito de la PROPIA entidad, no al global de /network/politics.
 * ---------------------------------------------------------------------------
 * Invariante §6 de CLAUDE.md: «Justicia restaurativa, no punitiva». El sistema
 * no implementa bloqueos punitivos sino procesos de mediación (Círculos de Paz).
 *
 * DISEÑO (mismo patrón EXACTO que src/lib/education/group-education.ts):
 *   · Funciones "ref-first": reciben un EntityRef y operan sobre él.
 *   · Clave fija por feature en entity_state → "gov:mediation-cases" (la misma
 *     que usa el panel global en political.ts, pero aquí bajo el ámbito de la
 *     entidad, no bajo {kind:"other", id:"network-politics"}).
 *   · La RLS de entity_state ya es correcta POR entidad: kind="group" → miembros
 *     vía os_memberships; kind="page"/"community"/"ef"/"party" → dueño. Por eso
 *     un ref {kind, id:slug} da almacenamiento por entidad SIN migración.
 *
 * PERSISTENCIA (mismo principio local-first que political.ts):
 *   · Nube primero (getEntityState); si no responde, se cae al espejo local y
 *     se marca degraded:true.
 *   · Cada escritura espeja SIEMPRE en localStorage (fuente de verdad offline)
 *     y luego intenta la nube (best-effort).
 *
 * El MODELO de datos (MediationCase / MediationStage / MediationUpdate /
 * MEDIATION_STAGE_LABEL) y labelForUser se IMPORTAN de political.ts — no se
 * redefinen — para una sola fuente de verdad. Todo defensivo: nunca lanza.
 */

import { createClient } from "@/utils/supabase/client";
import { getEntityState, setEntityState, type EntityRef } from "@/lib/sync/entity-state";
import {
  MEDIATION_STAGE_LABEL,
  labelForUser,
  type MediationCase,
  type MediationStage,
  type MediationUpdate,
} from "@/lib/governance/political";

// ─────────────────────────────────────────────────────────────────────────
// Ámbito y claves
// ─────────────────────────────────────────────────────────────────────────

/** Tipos de entidad que exponen su propia superficie de justicia restaurativa. */
export type MediationEntityKind = "group" | "page" | "community" | "ef" | "party";

/** Clave (fija por feature) dentro de entity_state — misma que el panel global. */
const MEDIATION_KEY = "gov:mediation-cases";

/** Ref del ámbito de mediación de una entidad concreta (slug = id del ámbito). */
export function mediationRef(kind: MediationEntityKind, slug: string): EntityRef {
  return { kind, id: slug };
}

/** Clave de espejo local, única por entidad (no colisiona entre grupos/páginas). */
function localKey(ref: EntityRef): string {
  return `starseed.gov.mediation.${ref.kind}.${ref.id}.v1`;
}

// ─────────────────────────────────────────────────────────────────────────
// Utilidades internas (reimplementadas localmente — no se importan de political)
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

// ─────────────────────────────────────────────────────────────────────────
// Lectura / escritura de la lista de casos por entidad
// ─────────────────────────────────────────────────────────────────────────

/**
 * Carga los casos de mediación de una entidad: nube primero, local si la nube
 * no responde. Espeja siempre en local tras una lectura exitosa de la nube.
 * `degraded:true` = se está sirviendo desde el espejo local (sin nube).
 */
export async function loadEntityMediationCases(
  ref: EntityRef,
): Promise<{ list: MediationCase[]; degraded: boolean }> {
  try {
    const row = await getEntityState<MediationCase[]>(ref, MEDIATION_KEY);
    if (row && Array.isArray(row.value)) {
      writeLocal(localKey(ref), row.value);
      return { list: row.value, degraded: false };
    }
  } catch {
    /* nube no disponible */
  }
  return { list: readLocal<MediationCase>(localKey(ref)), degraded: true };
}

/** Guarda la lista completa (espejo local primero + nube best-effort). */
async function saveEntityMediationCases(
  ref: EntityRef,
  list: MediationCase[],
): Promise<{ ok: boolean; degraded: boolean }> {
  writeLocal(localKey(ref), list);
  try {
    const row = await setEntityState(ref, MEDIATION_KEY, list);
    return { ok: true, degraded: !row };
  } catch {
    return { ok: true, degraded: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Operaciones de dominio (crear / actualizar) — espejan political.ts
// ─────────────────────────────────────────────────────────────────────────

/** Abre un nuevo caso de mediación en el ámbito de la entidad. Nunca lanza. */
export async function createEntityMediationCase(
  ref: EntityRef,
  input: { title: string; description: string; participants: string[] },
): Promise<{ ok: boolean; error?: string; degraded?: boolean }> {
  if (!input.title.trim()) return { ok: false, error: "Ponle un título al caso." };
  const actor = await currentUser();
  const { list } = await loadEntityMediationCases(ref);
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
  const res = await saveEntityMediationCases(ref, [entry, ...list]);
  return { ok: res.ok, degraded: res.degraded };
}

/**
 * Actualiza un caso (avance de etapa / facilitador / nota). Al cambiar la etapa
 * o al dejar nota se añade una entrada a la bitácora (updates). Nunca lanza.
 */
export async function updateEntityMediationCase(
  ref: EntityRef,
  id: string,
  patch: { stage?: MediationStage; facilitator?: string; note?: string },
): Promise<{ ok: boolean; error?: string; degraded?: boolean }> {
  const actor = await currentUser();
  const { list } = await loadEntityMediationCases(ref);
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return { ok: false, error: "Caso no encontrado." };
  const cur = { ...list[idx] };
  if (patch.stage) cur.stage = patch.stage;
  if (patch.facilitator !== undefined) cur.facilitator = patch.facilitator;
  if (patch.note?.trim() || patch.stage) {
    const update: MediationUpdate = {
      by: actor.id,
      byLabel: actor.label,
      note: patch.note?.trim() || `Estado actualizado a «${MEDIATION_STAGE_LABEL[patch.stage ?? cur.stage]}»`,
      at: new Date().toISOString(),
    };
    cur.updates = [...cur.updates, update];
  }
  const next = [...list];
  next[idx] = cur;
  const res = await saveEntityMediationCases(ref, next);
  return { ok: res.ok, degraded: res.degraded };
}
