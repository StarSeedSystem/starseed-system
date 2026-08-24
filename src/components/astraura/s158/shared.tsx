"use client";

/**
 * Piezas compartidas del STUDIO «Astraura 1.58-bit» (pestañas en `s158/`).
 * ----------------------------------------------------------------------------
 * Mismo lenguaje visual que el panel (Crystal Liquid Glass): tarjetas
 * `rounded-xl border-white/10 bg-white/[0.03] backdrop-blur-xl`, etiquetas mono
 * pequeñas, iconos lucide (nunca emoji), `cursor-pointer`, estados vacíos honestos
 * («sin conexión») y toasts (sonner) en cada acción.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Astraura158Manifest, Astraura158Response, Astraura158Target } from "@/lib/astraura/astraura-158-client";

/* ── Props comunes de las pestañas ─────────────────────────────────────────── */

export type S158TabId =
  | "resumen" | "personalidades" | "agentes" | "imaginacion" | "notificaciones" | "cerebros" | "memoria"
  | "sentidos" | "almacenamiento" | "proyectos" | "voz" | "habilidades" | "instalacion"
  // (Ola 4 · Adenda 156) paridad con las 21 pestañas del sistema original 1.58.
  | "chat" | "navegador" | "dispositivo" | "biblioteca" | "telemetria" | "terminal" | "configuracion"
  // (Ola 5 · Adenda 157) orquestación autónoma y gobierno de permisos y accesos.
  | "orquestacion" | "permisos"
  // (Ola 6 · Adenda 158) áreas del original que faltaban: bóveda de credenciales
  // y parámetros de inferencia, ciclo completo de workflows, permisos REALES del
  // navegador e instalador universal con descubrimiento.
  | "boveda" | "workflows" | "privacidad" | "instalador";

export interface S158TabProps {
  target: Astraura158Target;
  manifest?: Astraura158Manifest | null;
  /** Recarga el manifiesto y los contadores del panel (tras una acción). */
  refresh: () => void | Promise<void>;
  /** Navegación interna entre pestañas (solo la usa «Resumen»). */
  onNavigate?: (tab: S158TabId) => void;
}

/* ── Clases ────────────────────────────────────────────────────────────────── */

export const CARD = "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl";
export const SUB = "rounded-lg border border-white/10 bg-black/20";
export const BTN = "inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/85 transition-colors hover:border-cyan-400/40 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_PRIMARY = cn(BTN, "border-cyan-400/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20");
export const BTN_DANGER = cn(BTN, "border-rose-400/30 text-rose-100 hover:border-rose-400/60 hover:text-rose-50");
export const PILL = "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const PILL_ON = "border-cyan-400/40 bg-cyan-500/15 text-cyan-100";
export const PILL_OFF = "border-white/10 bg-white/[0.03] text-white/80 hover:border-white/25";
export const INPUT = "min-w-0 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-50";
export const SELECT = cn(INPUT, "cursor-pointer [&>option]:bg-neutral-900 [&>option]:text-white");
export const TEXTAREA = cn(INPUT, "min-h-[64px] w-full resize-y leading-snug");
export const LABEL = "font-code text-[10px] uppercase tracking-wide text-white/45";
export const MONO = "font-code text-[10px] text-white/45";

/* ── Utilidades ────────────────────────────────────────────────────────────── */

export function fmtTs(ts?: number | string | null): string {
  if (ts === undefined || ts === null || ts === "") return "";
  if (typeof ts === "string" && !/^\d+(\.\d+)?$/.test(ts)) {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? ts : d.toLocaleString("es", { dateStyle: "short", timeStyle: "short" });
  }
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "";
  const ms = n > 1e12 ? n : n * 1000;
  try { return new Date(ms).toLocaleString("es", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; }
}

export function fmtAgo(ts?: number | null): string {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.round(diff / 1000);
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export function fmtCountdown(secs?: number | null): string {
  const s = Math.max(0, Math.floor(Number(secs ?? 0)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function clampInt(v: string | number, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Tono por nivel/severidad (notificaciones, propuestas, procesos). */
export function levelTone(level?: string | null): string {
  const v = String(level ?? "").toLowerCase();
  if (/error|critical|danger|fatal/.test(v)) return "border-rose-400/40 bg-rose-500/15 text-rose-100";
  if (/warn|high|security|seguridad/.test(v)) return "border-amber-400/40 bg-amber-500/15 text-amber-100";
  if (/success|applied|done|verified|completed|ok|active|activo|running|enabled/.test(v)) return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  if (/suggest|pending|medium|idea|proposal/.test(v)) return "border-violet-400/40 bg-violet-500/15 text-violet-100";
  if (/paused|dormant|disabled|off|inactive/.test(v)) return "border-white/15 bg-white/[0.04] text-white/60";
  return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
}

/**
 * Ejecuta una acción del backend con toast de éxito/error. Devuelve true si fue
 * bien. Nunca lanza: el cliente ya normaliza los fallos.
 */
export async function runS158<T>(
  label: string,
  fn: () => Promise<Astraura158Response<T>>,
  opts?: { description?: (data: T) => string | undefined; after?: () => void | Promise<void> },
): Promise<boolean> {
  const r = await fn();
  if (r.ok) {
    toast.success(label, { description: opts?.description?.(r.data) });
    try { await opts?.after?.(); } catch { /* */ }
    return true;
  }
  toast.error(`${label}: ${r.error}`);
  return false;
}

/**
 * Carga de datos de una pestaña: `loader` debe ser estable (función de módulo).
 * Estado honesto: `error` explícito cuando el backend no responde.
 */
export function useS158Load<T>(loader: (target: Astraura158Target) => Promise<Astraura158Response<T>>, target: Astraura158Target, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const r = await loader(target);
    if (!alive.current) return;
    if (r.ok) { setData(r.data); setError(""); } else { setError(r.error); if (!silent) setData(null); }
    setLoading(false);
  }, [loader, target]);
  useEffect(() => {
    alive.current = true;
    void reload();
    const id = pollMs ? window.setInterval(() => { void reload(true); }, pollMs) : 0;
    return () => { alive.current = false; if (id) window.clearInterval(id); };
  }, [reload, pollMs]);
  return { data, error, loading, reload };
}

/** Estado «ocupado» por etiqueta (deshabilita el botón pulsado y muestra spinner). */
export function useBusy() {
  const [busy, setBusy] = useState("");
  const wrap = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try { await fn(); } finally { setBusy(""); }
  }, []);
  return { busy, wrap };
}

/* ── Componentes pequeños ──────────────────────────────────────────────────── */

export function SectionTitle({ icon: Icon, title, hint, right, tone = "text-cyan-300" }: { icon: LucideIcon; title: string; hint?: string; right?: ReactNode; tone?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-white/90">
          <Icon className={cn("h-3.5 w-3.5", tone)} aria-hidden="true" /> {title}
        </p>
        {hint && <p className="mt-0.5 text-[10px] leading-snug text-white/55">{hint}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-1.5">{right}</div>}
    </div>
  );
}

export function Empty({ loading, error, text = "Sin datos." }: { loading?: boolean; error?: string; text?: string }) {
  if (loading) return <p className="flex items-center gap-1.5 text-[11px] text-white/55"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Leyendo del backend…</p>;
  if (error) return <p className="text-[11px] text-amber-200/85">Sin conexión con el backend: {error}.</p>;
  return <p className="text-[11px] text-white/55">{text}</p>;
}

export function Badge({ children, tone, className }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none", tone ?? levelTone(typeof children === "string" ? children : ""), className)}>{children}</span>;
}

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn(SUB, "px-3 py-2", className)}>
      <p className={LABEL}>{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-white/90">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[10px] text-white/50" title={hint}>{hint}</p>}
    </div>
  );
}

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className={LABEL}>{label}</span>
      {children}
      {hint && <span className="text-[10px] text-white/45">{hint}</span>}
    </label>
  );
}

export function Bar({ value, tone = "bg-cyan-400/70", className }: { value?: number | null; tone?: string; className?: string }) {
  const v = Math.max(0, Math.min(100, Number(value ?? 0)));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/10", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function BusyIcon({ busy, icon: Icon }: { busy: boolean; icon: LucideIcon }) {
  return busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />;
}

/** Etiqueta legible de un nivel de permiso de la imaginación. */
export const PERMISSION_LABEL: Record<string, string> = {
  auto_apply_minor: "Auto: mejoras leves",
  auto_apply_safe: "Auto: optimizaciones seguras",
  always_ask: "Preguntar siempre",
  autonomous_sovereign: "Autónomo soberano",
};

export const PERMISSION_LEVEL_IDS = ["auto_apply_minor", "auto_apply_safe", "always_ask", "autonomous_sovereign"] as const;
