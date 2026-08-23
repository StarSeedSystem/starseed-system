/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA 1.58-BIT — trazas del enjambre → metadatos del mensaje (Adenda 154)
 * ---------------------------------------------------------------------------
 * Capa PURA (sin `window`, sin React) entre lo que devuelve el proveedor
 * (`ChatResponse.raw.astraura158`, ver `src/ai/providers/astraura-158.ts`) y lo
 * que guarda cada mensaje de Aurora (`AuroraMessageMeta.astraura158`).
 *
 *   · `astraura158MetaFromRaw(raw)`  → type-guard + copia saneada (o null).
 *   · `isAstraura158Source(id)`      → ¿la fuente ganadora fue el 1.58 (local/nube)?
 *   · `astraura158ToolMetas(meta)`   → ejecuciones de herramientas del backend
 *                                      como `ToolInvocationMeta` del OS.
 * Nunca lanza. Testeable sin DOM.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { Astraura158Meta, ToolInvocationMeta } from "@/lib/aurora/engine";

const MAX_TRACES = 24;
const MAX_THOUGHTS = 12;
const MAX_TOOLS = 32;
const MAX_PERSONAS = 16;

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
}

/** ¿Es un id de fuente del sistema primario 1.58 (`astraura-158-local` / `astraura-158-nube`)? */
export function isAstraura158Source(sourceId: string | null | undefined): boolean {
  return /^astraura-158(\b|-|\/)/.test(String(sourceId ?? ""));
}

/**
 * Type-guard + saneado de `raw.astraura158`. Devuelve null si `raw` no trae
 * nada del enjambre (otra fuente, respuesta local honesta, raw ausente) o si
 * todo viene vacío — así el modal solo pinta la sección cuando hay contenido.
 */
export function astraura158MetaFromRaw(raw: unknown): Astraura158Meta | null {
  if (!raw || typeof raw !== "object") return null;
  const a = (raw as { astraura158?: unknown }).astraura158;
  if (!a || typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  const out: Astraura158Meta = {};

  if (o.plan != null && typeof o.plan === "object") out.plan = o.plan;

  if (Array.isArray(o.traces)) {
    const traces: NonNullable<Astraura158Meta["traces"]> = [];
    for (const t of o.traces) {
      if (!t || typeof t !== "object" || traces.length >= MAX_TRACES) continue;
      const r = t as Record<string, unknown>;
      const agent = str(r.agent, 120);
      if (!agent) continue;
      const thoughts = Array.isArray(r.thoughts)
        ? r.thoughts.map((x) => str(x, 400)).filter((x): x is string => !!x).slice(0, MAX_THOUGHTS)
        : [];
      const color = str(r.color, 32);
      traces.push({ agent, ...(color ? { color } : {}), thoughts });
    }
    if (traces.length) out.traces = traces;
  }

  if (Array.isArray(o.tools)) {
    const tools: NonNullable<Astraura158Meta["tools"]> = [];
    for (const t of o.tools) {
      if (!t || typeof t !== "object" || tools.length >= MAX_TOOLS) continue;
      const r = t as Record<string, unknown>;
      const tool = str(r.tool, 80);
      if (!tool) continue;
      const target = str(r.target, 200);
      const summary = str(r.summary, 300);
      tools.push({
        tool,
        ...(target ? { target } : {}),
        ...(typeof r.success === "boolean" ? { success: r.success } : {}),
        ...(summary ? { summary } : {}),
      });
    }
    if (tools.length) out.tools = tools;
  }

  if (Array.isArray(o.personalities)) {
    const personalities: NonNullable<Astraura158Meta["personalities"]> = [];
    for (const p of o.personalities) {
      if (!p || typeof p !== "object" || personalities.length >= MAX_PERSONAS) continue;
      const r = p as Record<string, unknown>;
      const name = str(r.name, 80);
      if (!name) continue;
      const id = str(r.id, 64);
      const color = str(r.color, 32);
      personalities.push({ ...(id ? { id } : {}), name, ...(color ? { color } : {}) });
    }
    if (personalities.length) out.personalities = personalities;
  }

  return out.plan != null || out.traces || out.tools || out.personalities ? out : null;
}

/** Ejecuciones de herramientas del backend 1.58 → `ToolInvocationMeta` del OS. */
export function astraura158ToolMetas(meta: Astraura158Meta | null | undefined): ToolInvocationMeta[] {
  if (!meta?.tools?.length) return [];
  return meta.tools.map((t) => ({
    name: t.tool,
    ok: t.success !== false,
    summary: (t.summary ?? (t.target ? `→ ${t.target}` : "")).slice(0, 200),
  }));
}

/** Resumen corto y legible del plan de ramificación (o "" si no hay campos conocidos). */
export function describeAstraura158Plan(plan: unknown): string {
  if (!plan || typeof plan !== "object") return "";
  const p = plan as Record<string, unknown>;
  const n = (k: string): number | undefined => (typeof p[k] === "number" && Number.isFinite(p[k] as number) ? (p[k] as number) : undefined);
  const parts: string[] = [];
  const branches = n("total_branches") ?? (Array.isArray(p.branches) ? p.branches.length : undefined);
  if (branches !== undefined) parts.push(`${branches} rama${branches === 1 ? "" : "s"}`);
  const agents = n("total_agents");
  if (agents !== undefined) parts.push(`${agents} agente${agents === 1 ? "" : "s"}`);
  const subs = n("total_subagents");
  if (subs !== undefined) parts.push(`${subs} subagente${subs === 1 ? "" : "s"}`);
  const threads = n("max_concurrency_threads");
  if (threads !== undefined) parts.push(`${threads} hilos`);
  const hw = str(p.hardware_platform, 80);
  if (hw) parts.push(hw);
  const speed = str(p.speedup_factor, 16);
  if (speed) parts.push(`~${speed}`);
  return parts.join(" · ");
}

/** Ramas del plan como lista corta `{name, agent, color, status}` (≤ 8). */
export function astraura158PlanBranches(plan: unknown): { name: string; agent?: string; color?: string; status?: string }[] {
  if (!plan || typeof plan !== "object") return [];
  const b = (plan as { branches?: unknown }).branches;
  if (!Array.isArray(b)) return [];
  const out: { name: string; agent?: string; color?: string; status?: string }[] = [];
  for (const x of b) {
    if (!x || typeof x !== "object" || out.length >= 8) continue;
    const r = x as Record<string, unknown>;
    const name = str(r.name, 120) ?? str(r.id, 80);
    if (!name) continue;
    const agent = str(r.agent, 80);
    const color = str(r.color, 32);
    const status = str(r.status, 24);
    out.push({ name, ...(agent ? { agent } : {}), ...(color ? { color } : {}), ...(status ? { status } : {}) });
  }
  return out;
}
