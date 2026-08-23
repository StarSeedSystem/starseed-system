"use client";

/**
 * PROCESOS AUTÓNOMOS 1.58 — tarjeta compacta (Ola 3 · Adenda 155).
 * ----------------------------------------------------------------------------
 * Vive dentro de la configuración de personalidad/neurona (sección LLM) y en
 * cualquier superficie que quiera gobernar, sin abrir el Studio completo, los
 * procesos de fondo del backend soberano:
 *   · imaginación intuitiva: siempre-activa, frecuencia del ciclo, propuestas
 *     pendientes y disparo manual;
 *   · enjambre: modo del gobernador de capacidad (adaptativo/rendimiento/eco)
 *     y tareas vivas.
 * Lee/escribe los endpoints reales vía `astraura-158-client.ts`; si el backend
 * de esta neurona no responde, lo dice y ofrece la nube. Deep-link al Studio
 * (`/agent?tab=astraura-158&sub=imaginacion`).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ExternalLink, Play, RefreshCw, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  astraura158LocalEnabled, fetchAstraura158ImaginationStatus, fetchAstraura158Swarm, setAstraura158SwarmCapacity,
  triggerAstraura158Imagination, updateAstraura158ImaginationConfig,
  type Astraura158CapacityMode, type Astraura158ImaginationStatus, type Astraura158SwarmStatus, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";

const BTN = "inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/85 transition-colors hover:border-fuchsia-400/40 hover:text-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50";
const MODES: { id: Astraura158CapacityMode; label: string }[] = [
  { id: "adaptive", label: "adaptativo" },
  { id: "performance", label: "rendimiento" },
  { id: "eco", label: "eco" },
];

export function Astraura158ProcessesCard({ className }: { className?: string }) {
  const [target, setTarget] = useState<Astraura158Target | null>(null);
  const [imag, setImag] = useState<Astraura158ImaginationStatus | null>(null);
  const [swarm, setSwarm] = useState<Astraura158SwarmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const targets: Astraura158Target[] = astraura158LocalEnabled() ? ["local", "nube"] : ["nube"];
    for (const t of targets) {
      const [i, s] = await Promise.all([fetchAstraura158ImaginationStatus(t), fetchAstraura158Swarm(t)]);
      if (i.ok || s.ok) {
        setTarget(t);
        setImag(i.ok ? i.data : null);
        setSwarm(s.ok ? s.data : null);
        setLoading(false);
        return;
      }
    }
    setTarget(null); setImag(null); setSwarm(null); setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => { if (!document.hidden) void load(); }, 45_000);
    return () => window.clearInterval(id);
  }, [load]);

  const run = useCallback(async (key: string, label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key);
    try {
      const r = await fn();
      if (r.ok) { toast.success(label); await load(); }
      else toast.error(`${label}: ${r.error}`);
    } finally { setBusy(""); }
  }, [load]);

  const running = (swarm?.active_tasks ?? []).filter((t) => t.status === "running").length;
  const mode = swarm?.capacity_governor?.capacity_mode;

  return (
    <div className={cn("rounded-xl border border-[var(--aw-line,rgba(255,255,255,0.1))] bg-[var(--aw-surface,rgba(255,255,255,0.03))] px-3 py-2.5", className)}>
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong,#fff)]">
          <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" aria-hidden="true" /> Procesos autónomos 1.58
        </p>
        <button type="button" className={BTN} onClick={() => { void load(); }} aria-label="Recargar procesos 1.58">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
        </button>
        <Link href="/agent?tab=astraura-158&sub=imaginacion" className={BTN} aria-label="Abrir Studio 1.58">
          <ExternalLink className="h-3 w-3" aria-hidden="true" /> Studio
        </Link>
      </div>
      {!target && !loading && (
        <p className="mt-1.5 text-[10px] leading-snug text-[var(--aw-muted,rgba(255,255,255,0.55))]">
          El backend 1.58 de esta neurona no responde (ni la nube). La imaginación, el enjambre y el director corren DENTRO del backend: arráncalo o configura su endpoint en el Studio.
        </p>
      )}
      {target && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-white/80">
            <label className="flex items-center gap-1.5">
              <Switch
                checked={!!imag?.is_always_on}
                disabled={busy !== "" || !imag}
                aria-label="Imaginación siempre activa"
                onCheckedChange={(v) => { void run("always", v ? "Imaginación siempre activa" : "Imaginación en pausa", () => updateAstraura158ImaginationConfig(target, { is_always_on: v })); }}
              />
              imaginación {imag?.is_dreaming_now ? "· imaginando ahora" : imag?.is_always_on ? "activa" : "en pausa"}
            </label>
            <label className="flex items-center gap-1 text-[10px] text-white/60">
              cada
              <input
                type="number" min={1} max={1440} defaultValue={imag?.cycle_frequency_minutes ?? 15} disabled={busy !== "" || !imag}
                className="w-14 rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-fuchsia-400/50"
                aria-label="Frecuencia del ciclo (minutos)"
                onBlur={(e) => {
                  const v = Math.max(1, Math.min(1440, Math.round(Number(e.target.value) || 15)));
                  if (imag && v !== imag.cycle_frequency_minutes) void run("freq", `Ciclo cada ${v} min`, () => updateAstraura158ImaginationConfig(target, { cycle_frequency_minutes: v }));
                }}
              /> min
            </label>
            <button type="button" className={BTN} disabled={busy !== "" || !imag} aria-label="Disparar un ciclo de imaginación"
              onClick={() => { void run("trigger", "Ciclo de imaginación lanzado (segundo plano)", () => triggerAstraura158Imagination(target)); }}>
              {busy === "trigger" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Play className="h-3 w-3" aria-hidden="true" />} imaginar ahora
            </button>
            {typeof imag?.pending_approval_count === "number" && imag.pending_approval_count > 0 && (
              <Link href="/agent?tab=astraura-158&sub=imaginacion" className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-100">
                {imag.pending_approval_count} propuesta(s) esperan tu aprobación
              </Link>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/80">
            <Bot className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
            <span>enjambre · {running} tarea(s) viva(s)</span>
            {MODES.map((m) => (
              <button key={m.id} type="button" disabled={busy !== "" || !swarm} aria-pressed={mode === m.id}
                className={cn(BTN, mode === m.id && "border-cyan-400/40 bg-cyan-500/15 text-cyan-100")}
                onClick={() => { void run(`cap:${m.id}`, `Capacidad del enjambre: ${m.label}`, () => setAstraura158SwarmCapacity(target, m.id)); }}>
                {m.label}
              </button>
            ))}
            <span className="text-[10px] text-white/45">({target === "local" ? "backend de esta neurona" : "nube propia"})</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default Astraura158ProcessesCard;
