/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SISTEMA PRIMARIO DE INTELIGENCIA (Adenda 153) — capa pura, SSR-safe.
 * ---------------------------------------------------------------------------
 * SOP: `architecture/astraura-158-sistema-primario.md` §3.
 *
 * Decide QUÉ SISTEMA VA PRIMERO en la cadena del router para un turno dado:
 *   · por defecto, **Astraura 1.58-bit** (backend soberano propio);
 *   · opcionalmente otro, por AGENTE, PERSONALIDAD, CEREBRO, NEURONA o CUENTA
 *     («automático gratis-primero» o una fuente/modelo concreta del catálogo).
 *
 * Precedencia (la más específica gana):
 *   agente > personalidad > cerebro > neurona > cuenta > defecto (astraura-158)
 *
 * NO sustituye los pines explícitos de LLM que ya existen (por chat, neurona ×
 * personalidad A149, personalidad «fija» A67): esos siguen ganando en el router.
 * Nunca es exclusivo salvo `exclusivo:true`: si el primario no está listo, la
 * cadena de secundarios sigue (Aurora siempre responde).
 *
 * Persistencia: `starseed.astraura.primary-system.v1` (sincronizada con la
 * cuenta; no contiene secretos). Sin `window` ⇒ defaults.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

export const PRIMARY_SYSTEM_KEY = "starseed.astraura.primary-system.v1";
export const PRIMARY_SYSTEM_EVENT = "starseed:astraura-primary-system";

/** Id del proveedor/sistema primario soberano. */
export const ASTRAURA_158_SYSTEM = "astraura-158" as const;

export type PrimaryMode = "astraura-158" | "auto" | "fuente";

export interface PrimaryChoice {
  /** astraura-158 (defecto) · auto (gratis-primero clásico) · fuente (una fuente/modelo). */
  modo: PrimaryMode;
  /** Id de fuente del catálogo (solo `modo: "fuente"`). */
  fuente?: string;
  /** Id de modelo opcional (p.ej. `astraura-158/hermione` o un modelo de la fuente). */
  modelo?: string;
  /** true ⇒ sin failover: si el primario no responde, respuesta honesta. */
  exclusivo?: boolean;
}

export interface PrimarySystemStore {
  cuenta?: PrimaryChoice;
  porNeurona?: Record<string, PrimaryChoice>;
  porCerebro?: Record<string, PrimaryChoice>;
  porAgente?: Record<string, PrimaryChoice>;
  porPersonalidad?: Record<string, PrimaryChoice>;
}

export type PrimaryScope = "cuenta" | "neurona" | "cerebro" | "agente" | "personalidad";
export type PrimaryProvenance = PrimaryScope | "defecto";

export interface ResolvedPrimary {
  choice: PrimaryChoice;
  provenance: PrimaryProvenance;
  /** Id del ámbito que decidió (deviceId/brainId/agentId/personaId), si aplica. */
  scopeId?: string;
}

export const DEFAULT_PRIMARY: PrimaryChoice = { modo: ASTRAURA_158_SYSTEM };

const MODES = new Set<PrimaryMode>(["astraura-158", "auto", "fuente"]);

/* ───────────────────── Validación pura ───────────────────── */

function safeId(v: unknown, max = 160): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s || s.length > max) return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return undefined;
  return s;
}

/** Devuelve una elección válida o `null` (nunca lanza). */
export function sanitizePrimaryChoice(input: unknown): PrimaryChoice | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  if (typeof o.modo !== "string" || !MODES.has(o.modo as PrimaryMode)) return null;
  const out: PrimaryChoice = { modo: o.modo as PrimaryMode };
  const fuente = safeId(o.fuente);
  const modelo = safeId(o.modelo, 200);
  if (out.modo === "fuente") {
    if (!fuente) return null; // una fuente sin id no significa nada
    out.fuente = fuente;
  }
  if (modelo) out.modelo = modelo;
  if (o.exclusivo === true) out.exclusivo = true;
  return out;
}

function sanitizeMap(input: unknown): Record<string, PrimaryChoice> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const out: Record<string, PrimaryChoice> = {};
  for (const [rawId, v] of Object.entries(input as Record<string, unknown>).slice(0, 500)) {
    const id = safeId(rawId);
    const c = sanitizePrimaryChoice(v);
    if (id && c) out[id] = c;
  }
  return Object.keys(out).length ? out : undefined;
}

export function sanitizePrimaryStore(input: unknown): PrimarySystemStore {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const o = input as Record<string, unknown>;
  const out: PrimarySystemStore = {};
  const cuenta = sanitizePrimaryChoice(o.cuenta);
  if (cuenta) out.cuenta = cuenta;
  const n = sanitizeMap(o.porNeurona); if (n) out.porNeurona = n;
  const c = sanitizeMap(o.porCerebro); if (c) out.porCerebro = c;
  const a = sanitizeMap(o.porAgente); if (a) out.porAgente = a;
  const p = sanitizeMap(o.porPersonalidad); if (p) out.porPersonalidad = p;
  return out;
}

/* ───────────────────── Resolución pura ───────────────────── */

export interface PrimaryContext {
  deviceId?: string | null;
  personaId?: string | null;
  agentId?: string | null;
  brainId?: string | null;
}

/**
 * Resuelve el sistema primario EFECTIVO para un contexto, sobre un store dado
 * (función pura para testear). Precedencia: agente > personalidad > cerebro >
 * neurona > cuenta > defecto.
 */
export function resolvePrimaryFrom(store: PrimarySystemStore, ctx: PrimaryContext): ResolvedPrimary {
  const pick = (map: Record<string, PrimaryChoice> | undefined, id: string | null | undefined, provenance: PrimaryScope): ResolvedPrimary | null => {
    if (!id || !map) return null;
    const c = map[id];
    return c ? { choice: c, provenance, scopeId: id } : null;
  };
  return (
    pick(store.porAgente, ctx.agentId, "agente") ??
    pick(store.porPersonalidad, ctx.personaId, "personalidad") ??
    pick(store.porCerebro, ctx.brainId, "cerebro") ??
    pick(store.porNeurona, ctx.deviceId, "neurona") ??
    (store.cuenta ? { choice: store.cuenta, provenance: "cuenta" as const } : null) ??
    { choice: { ...DEFAULT_PRIMARY }, provenance: "defecto" }
  );
}

/** Etiqueta corta y legible de una elección (para chips y toasts). */
export function describePrimaryChoice(c: PrimaryChoice | null | undefined): string {
  if (!c) return "Astraura 1.58-bit (defecto)";
  if (c.modo === "astraura-158") return c.modelo ? `Astraura 1.58-bit · ${c.modelo.replace(/^astraura-158\//, "")}` : "Astraura 1.58-bit";
  if (c.modo === "auto") return "Automático (gratis-primero)";
  return c.modelo ? `${c.fuente} · ${c.modelo}` : `${c.fuente ?? "fuente"}`;
}

export const PRIMARY_PROVENANCE_LABEL: Record<PrimaryProvenance, string> = {
  agente: "Fijado por el agente",
  personalidad: "Fijado por la personalidad",
  cerebro: "Fijado por el cerebro",
  neurona: "Fijado por esta neurona",
  cuenta: "Ajuste de la cuenta",
  defecto: "Defecto del OS (Astraura 1.58-bit)",
};

/* ───────────────────── Persistencia (navegador) ───────────────────── */

export function readPrimaryStore(): PrimarySystemStore {
  try {
    const raw = safeGet(PRIMARY_SYSTEM_KEY);
    if (!raw) return {};
    return sanitizePrimaryStore(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writePrimaryStore(store: PrimarySystemStore): void {
  try {
    const clean = sanitizePrimaryStore(store);
    safeSet(PRIMARY_SYSTEM_KEY, JSON.stringify(clean));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PRIMARY_SYSTEM_EVENT));
  } catch { /* best-effort */ }
}

/** Sistema primario efectivo para un contexto, leyendo el store persistido. */
export function resolvePrimarySystem(ctx: PrimaryContext): ResolvedPrimary {
  return resolvePrimaryFrom(readPrimaryStore(), ctx);
}

/**
 * Fija (o borra con `null`) la elección de un ámbito. `cuenta` ignora `id`.
 * Una elección inválida se trata como borrado (vuelve a heredar).
 */
export function setPrimaryChoice(scope: PrimaryScope, id: string | null | undefined, choice: PrimaryChoice | null): void {
  const store = readPrimaryStore();
  const clean = choice ? sanitizePrimaryChoice(choice) : null;
  if (scope === "cuenta") {
    if (clean) store.cuenta = clean; else delete store.cuenta;
    writePrimaryStore(store);
    return;
  }
  const key = (
    scope === "neurona" ? "porNeurona"
      : scope === "cerebro" ? "porCerebro"
        : scope === "agente" ? "porAgente"
          : "porPersonalidad"
  ) as keyof Omit<PrimarySystemStore, "cuenta">;
  const sid = safeId(id);
  if (!sid) return;
  const map = { ...(store[key] ?? {}) };
  if (clean) map[sid] = clean; else delete map[sid];
  if (Object.keys(map).length) store[key] = map; else delete store[key];
  writePrimaryStore(store);
}

/** Elección CRUDA guardada para un ámbito (sin herencia), o null. */
export function getPrimaryChoice(scope: PrimaryScope, id?: string | null): PrimaryChoice | null {
  const store = readPrimaryStore();
  if (scope === "cuenta") return store.cuenta ?? null;
  const sid = safeId(id);
  if (!sid) return null;
  const map =
    scope === "neurona" ? store.porNeurona
      : scope === "cerebro" ? store.porCerebro
        : scope === "agente" ? store.porAgente
          : store.porPersonalidad;
  return map?.[sid] ?? null;
}

export function subscribePrimarySystem(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener(PRIMARY_SYSTEM_EVENT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(PRIMARY_SYSTEM_EVENT, h);
    window.removeEventListener("storage", h);
  };
}
