"use client";

/**
 * NeuronServerConfig — GESTIÓN DE ESTA NEURONA (Adenda 114).
 * ============================================================================
 * Configura ESTA neurona: rol (cerebro/servidor/ambos), ubicación, si ofrece
 * internet público a los servidores comunitarios del OS (con puerto para vínculos
 * privados), la política de memorias/sincronización, y su bitácora independiente.
 * Lee/escribe `NeuronSettings` (viaja con la cuenta) y los logs por neurona. SSR-safe.
 */

import { useCallback, useEffect, useState } from "react";
import { Server, MapPin, Globe, Brain, Database, Users, Network, ScrollText, Trash2, RadioTower } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { thisDeviceId, settingsFor, setNeuronSettings, NEURON_EVENT, type NeuronRole, type NeuronSettings } from "@/lib/neurons/neurons";
import { getNeuronLogs, clearNeuronLogs, logNeuron, subscribeNeuronLogs, type NeuronLogEntry } from "@/lib/neurons/neuron-logs";

const ROLES: { value: NeuronRole; label: string; hint: string }[] = [
  { value: "cerebro", label: "Cerebro (receptor)", hint: "usa cómputo/contexto; recibe de la red" },
  { value: "servidor", label: "Servidor (provee)", hint: "sirve almacenamiento/servicios a otras neuronas" },
  { value: "ambos", label: "Ambos", hint: "cerebro y servidor a la vez" },
];

const LEVEL_CLS: Record<string, string> = {
  info: "text-white/50 bg-white/[0.06]", warn: "text-amber-300 bg-amber-500/15", error: "text-rose-300 bg-rose-500/15",
  sync: "text-cyan-300 bg-cyan-500/15", net: "text-sky-300 bg-sky-500/15", server: "text-emerald-300 bg-emerald-500/15",
};

function ToggleLine({ icon, title, hint, checked, onChange }: { icon: React.ReactNode; title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn("shrink-0", checked ? "text-emerald-300" : "text-white/40")}>{icon}</span>
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-white/90">{title}</span>
          <span className="block text-[9px] leading-snug text-white/45">{hint}</span>
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function fmtTime(at: number): string {
  if (!at) return "";
  try { return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

export function NeuronServerConfig() {
  const [id, setId] = useState("");
  const [s, setS] = useState<NeuronSettings>({});
  const [logs, setLogs] = useState<NeuronLogEntry[]>([]);

  const refreshLogs = useCallback((did: string) => setLogs(getNeuronLogs(did)), []);

  useEffect(() => {
    const did = thisDeviceId();
    setId(did);
    setS(settingsFor(did));
    refreshLogs(did);
    const onN = () => setS(settingsFor(did));
    if (typeof window !== "undefined") window.addEventListener(NEURON_EVENT, onN);
    const offLogs = subscribeNeuronLogs(() => refreshLogs(did));
    return () => {
      if (typeof window !== "undefined") window.removeEventListener(NEURON_EVENT, onN);
      offLogs();
    };
  }, [refreshLogs]);

  const patch = useCallback((p: Partial<NeuronSettings>, logMsg?: string) => {
    if (!id) return;
    setNeuronSettings(id, p);
    setS(settingsFor(id));
    if (logMsg) logNeuron(id, "info", logMsg);
  }, [id]);

  const offer = s.offerPublicInternet === true;

  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-2 text-[12px] font-semibold text-white/85"><Server className="h-4 w-4 text-amber-300" /> Esta neurona como servidor/receptor</p>

      {/* Rol */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-white/40">Rol principal</p>
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map((r) => (
            <button key={r.value} type="button" title={r.hint} onClick={() => patch({ role: r.value }, `Rol cambiado a ${r.value}`)}
              className={cn("cursor-pointer rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors", (s.role ?? "ambos") === r.value ? "border-amber-400/40 bg-amber-500/15 text-amber-100" : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25")}>
              {r.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[9px] text-white/40">{ROLES.find((r) => r.value === (s.role ?? "ambos"))?.hint}</p>
      </div>

      {/* Ubicación */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-white/85"><MapPin className="h-3.5 w-3.5 text-cyan-300" /> Ubicación</p>
        <Input value={s.location ?? ""} onChange={(e) => setS({ ...s, location: e.target.value })} onBlur={() => patch({ location: (s.location ?? "").trim() || undefined })}
          placeholder="Ciudad, sala o etiqueta (opcional)" className="h-8 text-[12px]" />
      </div>

      {/* Ofrecer internet público */}
      <ToggleLine icon={<Globe className="h-4 w-4" />} title="Ofrecer internet público del OS"
        hint="comparte los recursos de esta neurona con los servidores comunitarios de StarSeed"
        checked={offer} onChange={(v) => patch({ offerPublicInternet: v }, v ? "Ofreciendo internet público con recursos de la neurona" : "Dejó de ofrecer internet público")} />
      {offer && (
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.05] px-2.5 py-1.5">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] text-white/70"><Network className="h-3 w-3 text-emerald-300" /> Puerto para vínculos privados personalizables</p>
          <Input value={s.publicPort ? String(s.publicPort) : ""} inputMode="numeric"
            onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); setS({ ...s, publicPort: Number.isFinite(n) ? n : undefined }); }}
            onBlur={() => patch({ publicPort: s.publicPort && s.publicPort > 0 ? s.publicPort : undefined })}
            placeholder="p.ej. 8787" className="h-8 max-w-[140px] text-[12px]" />
        </div>
      )}

      {/* Memorias / sincronización */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-white/85"><Database className="h-3.5 w-3.5 text-violet-300" /> Memorias y sincronización</p>
        <div className="space-y-1.5">
          <ToggleLine icon={<Brain className="h-4 w-4" />} title="Sincronizar memorias de cerebros" hint="las memorias de los cerebros se replican en esta neurona"
            checked={s.syncBrains !== false} onChange={(v) => patch({ syncBrains: v }, `Sync de cerebros ${v ? "ON" : "OFF"}`)} />
          <ToggleLine icon={<Database className="h-4 w-4" />} title="Sincronizar biblioteca" hint="datos de la biblioteca de la cuenta"
            checked={s.syncLibrary !== false} onChange={(v) => patch({ syncLibrary: v }, `Sync de biblioteca ${v ? "ON" : "OFF"}`)} />
          <ToggleLine icon={<Users className="h-4 w-4" />} title="Sincronizar con mis neuronas" hint="con las demás neuronas de tu cuenta"
            checked={s.syncNeurons !== false} onChange={(v) => patch({ syncNeurons: v }, `Sync entre neuronas ${v ? "ON" : "OFF"}`)} />
          <ToggleLine icon={<RadioTower className="h-4 w-4" />} title="Sincronizar con neuronas externas" hint="fuera de tu cuenta (OFF por defecto)"
            checked={s.syncExternal === true} onChange={(v) => patch({ syncExternal: v }, `Sync externa ${v ? "ON" : "OFF"}`)} />
        </div>
      </div>

      {/* Logs */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-white/85"><ScrollText className="h-3.5 w-3.5 text-white/60" /> Bitácora de esta neurona</p>
          {logs.length > 0 && (
            <button type="button" onClick={() => id && clearNeuronLogs(id)} className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-white/40 hover:text-rose-300">
              <Trash2 className="h-3 w-3" /> Limpiar
            </button>
          )}
        </div>
        {logs.length === 0 ? (
          <p className="text-[10px] text-white/40">Sin eventos aún. Los cambios de configuración y de red quedan aquí.</p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {logs.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className={cn("rounded px-1 py-0.5 text-[8px] font-bold uppercase", LEVEL_CLS[e.level] ?? LEVEL_CLS.info)}>{e.level}</span>
                <span className="text-white/40">{fmtTime(e.at)}</span>
                <span className="min-w-0 flex-1 truncate text-white/70">{e.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default NeuronServerConfig;
