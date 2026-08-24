"use client";

/**
 * STUDIO 1.58 · Telemetría 1.58-Bit — diagnóstico HONESTO del motor nativo:
 * modo real (bitnet-native / ollama / templates), servidor `llama-server`
 * embebido (perfiles interactivo/fondo: running/ready/puerto/modelo),
 * velocidad y cuantización, memoria del proceso, resumen del grafo de
 * memoria, hardware del profiler, malla de sincronización y — si el backend
 * lo expone — los contadores de cognición (llamadas reales vs plantilla) del
 * puente `/api/starseed/processes`.
 *
 * Fuentes: `/api/status`, `/api/bitnet/status`, `/api/system/sync/telemetry`,
 * `/api/system/senses` y `/api/starseed/processes`. Auto-refresco cada 15 s.
 * HONESTO: cuando el backend no trae un dato, esta pestaña lo dice — nunca
 * lo inventa ni lo estima (arquitectura: astraura-158-ola4-runtime-y-pestanas.md §3).
 */

import { useMemo } from "react";
import {
  Activity, BrainCircuit, Cpu, Database, Gauge, MemoryStick, Network, RefreshCw, Server, Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  describeAstraura158Engine, fetchAstraura158BitnetStatus, fetchAstraura158Processes, fetchAstraura158Status,
  fetchAstraura158SyncTelemetry, fetchAstraura158SystemSenses, type Astraura158BitnetServerProfile,
} from "@/lib/astraura/astraura-158-client";
import { BTN, Badge, Bar, CARD, Empty, MONO, SUB, SectionTitle, Stat, useS158Load, type S158TabProps } from "./shared";

/* ── utilidades locales (lectura tolerante de campos no tipados) ───────────── */

function numField(obj: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function ProfileRow({ label, profile }: { label: string; profile?: Astraura158BitnetServerProfile }) {
  if (!profile) return <p className="text-[10px] text-white/45">{label}: sin datos.</p>;
  const on = profile.running === true || profile.ready === true;
  return (
    <div className={cn(SUB, "px-3 py-2")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-white/85">{label}</p>
        <Badge tone={on ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : "border-white/15 bg-white/[0.04] text-white/60"}>
          {profile.running === true ? "en marcha" : profile.running === false ? "detenido" : "estado desconocido"}
          {profile.ready === true ? " · listo" : profile.ready === false ? " · no listo" : ""}
        </Badge>
      </div>
      <p className={MONO}>puerto {profile.port ?? "—"} · {profile.model ?? "sin modelo"}</p>
    </div>
  );
}

export function TelemetriaTab({ target }: S158TabProps) {
  const status = useS158Load(fetchAstraura158Status, target, 15_000);
  const bitnet = useS158Load(fetchAstraura158BitnetStatus, target, 15_000);
  const sync = useS158Load(fetchAstraura158SyncTelemetry, target, 15_000);
  const senses = useS158Load(fetchAstraura158SystemSenses, target, 15_000);
  const procs = useS158Load(fetchAstraura158Processes, target, 15_000);

  const s = status.data;
  const engine = describeAstraura158Engine(s);
  const eng = s?.engine;

  const cognition = useMemo(() => (procs.data ?? []).find((p) => p.id === "cognition"), [procs.data]);
  const cogCounters = cognition?.counters;
  const realCalls = numField(cogCounters, ["real_calls", "llm_calls", "real"]);
  const templateCalls = numField(cogCounters, ["template_calls", "template"]);
  const rawMeasuredTps: unknown = cognition?.measured_tps;
  const measuredTps = typeof rawMeasuredTps === "number" && Number.isFinite(rawMeasuredTps) ? rawMeasuredTps : undefined;
  const rawLastMode: unknown = cognition?.last_mode;
  const lastMode = typeof rawLastMode === "string" && rawLastMode.trim() ? rawLastMode : undefined;
  const bothCounted = realCalls != null && templateCalls != null && realCalls + templateCalls > 0;

  const interactive = eng?.bitnet_server?.interactive ?? bitnet.data?.interactive ?? bitnet.data?.server?.interactive;
  const background = eng?.bitnet_server?.background ?? bitnet.data?.background ?? bitnet.data?.server?.background;

  const hwSystem = s?.profiler?.system;
  const cores = numField(hwSystem, ["cpu_cores", "cores", "logical_cores", "n_cores"]);
  const ramGb = numField(hwSystem, ["ram_total_gb", "ram_gb", "total_ram_gb", "memory_gb"]);

  const mesh = sync.data?.mesh;
  const sensesData = senses.data;
  const sensorList = sensesData?.sensors ?? [];

  const loading = status.loading || bitnet.loading || sync.loading || senses.loading || procs.loading;
  const reloadAll = () => {
    void status.reload(true);
    void bitnet.reload(true);
    void sync.reload(true);
    void senses.reload(true);
    void procs.reload(true);
  };

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={Gauge}
          title="Telemetría 1.58-Bit"
          tone="text-cyan-300"
          hint="Diagnóstico honesto del motor nativo — auto-refresco cada 15 s. Si un dato no viene del backend, se dice: nunca se inventa."
          right={<button type="button" className={BTN} onClick={reloadAll} aria-label="Recargar telemetría"><RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} aria-hidden="true" /> Recargar</button>}
        />
      </div>

      {/* Motor */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Cpu} title="Motor honesto" tone="text-cyan-300" />
        {!s && <Empty loading={status.loading} error={status.error} text="Sin telemetría del motor." />}
        {s && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Motor" value={<span className={cn(engine.bitnet ? "text-cyan-200" : engine.real ? "text-white" : "text-amber-200")}>{engine.label}</span>} hint={eng?.real_mode ? `real_mode: ${eng.real_mode}` : "sin real_mode (backend clásico)"} />
            <Stat label="Cuantización" value={eng?.quantization ?? "—"} hint={eng?.inference_mode ? `modo ${eng.inference_mode}` : undefined} />
            <Stat label="Velocidad" value={eng?.speed_tps ? `${Number(eng.speed_tps).toFixed(1)} tok/s` : "—"} hint={eng?.tokens_generated ? `${eng.tokens_generated} tokens generados` : undefined} />
            <Stat label="Memoria del proceso" value={eng?.process_memory_mb ? `${Number(eng.process_memory_mb).toFixed(0)} MB` : "no expuesta"} />
          </div>
        )}
      </div>

      {/* Servidor nativo */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Server} title="Servidor nativo (bitnet.cpp)" tone="text-violet-300" hint="Perfiles interactivo y de fondo del `llama-server` embebido. Fuente: `/api/status` (engine.bitnet_server) con `/api/bitnet/status` como respaldo." />
        {!interactive && !background && <Empty loading={bitnet.loading || status.loading} error={bitnet.error} text="El backend no expone el servidor nativo en esta versión." />}
        {(interactive || background) && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <ProfileRow label="Interactivo" profile={interactive} />
            <ProfileRow label="Fondo" profile={background} />
          </div>
        )}
      </div>

      {/* Memoria + Hardware */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Database} title="Resumen de memoria" tone="text-emerald-300" />
          {!s?.memory_summary && <Empty loading={status.loading} error={status.error} text="Sin resumen de memoria." />}
          {s?.memory_summary && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="Nodos" value={s.memory_summary.knowledge_nodes ?? 0} />
              <Stat label="Aristas" value={s.memory_summary.knowledge_edges ?? 0} />
              <Stat label="Vectores" value={s.memory_summary.vector_documents ?? 0} />
              <Stat label="Eventos aprendidos" value={s.memory_summary.learned_events_count ?? 0} />
            </div>
          )}
        </div>
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={MemoryStick} title="Hardware" tone="text-amber-300" hint={s?.profiler?.hardware_family ? undefined : "El backend no publica familia de hardware."} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat label="Familia" value={s?.profiler?.hardware_family ?? "—"} />
            <Stat label="Núcleos" value={cores ?? "no expuesto"} />
            <Stat label="RAM total" value={ramGb ? `${ramGb.toFixed(1)} GB` : "no expuesta"} />
          </div>
        </div>
      </div>

      {/* Malla + Sentidos */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Network} title="Malla de sincronización" tone="text-cyan-300" />
          {!mesh && <Empty loading={sync.loading} error={sync.error} text="Sin telemetría de malla." />}
          {mesh && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="Estado" value={mesh.status ?? "—"} />
              <Stat label="Neuronas sincronizadas" value={mesh.active_synced_clients ?? 0} />
            </div>
          )}
          {mesh?.last_event && <p className={cn(MONO, "mt-2 truncate")}>último evento: {JSON.stringify(mesh.last_event).slice(0, 120)}</p>}
        </div>
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Waves} title="Sentidos del sistema" tone="text-violet-300" hint="`/api/system/senses` — forma no estandarizada aún: se enseña lo que llegue, tal cual." />
          {!sensesData && <Empty loading={senses.loading} error={senses.error} text="Sin datos de sentidos del sistema." />}
          {sensesData && sensorList.length === 0 && !sensesData.summary && <p className="text-[11px] text-white/55">El backend respondió sin sensores listados.</p>}
          {sensesData?.summary && <p className="text-[11px] text-white/70">{sensesData.summary}</p>}
          {sensorList.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {sensorList.slice(0, 16).map((sn, i) => (
                <Badge key={sn.id ?? sn.name ?? i} tone={sn.active ? "border-emerald-400/30 text-emerald-200" : "border-white/10 text-white/55"}>{sn.name ?? sn.id ?? `sensor ${i + 1}`}</Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cognición */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={BrainCircuit} title="Cognición — llamadas reales vs plantilla" tone="text-fuchsia-300" hint="`/api/starseed/processes` → entrada «cognition», solo si el backend la expone." />
        {!cognition && <Empty loading={procs.loading} error={procs.error} text="El backend no expone el proceso «cognition» en /api/starseed/processes." />}
        {cognition && (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Stat label="Llamadas reales" value={realCalls ?? "no expuesto"} />
              <Stat label="Llamadas plantilla" value={templateCalls ?? "no expuesto"} />
              <Stat label="tok/s medidos" value={measuredTps != null ? measuredTps.toFixed(1) : "no expuesto"} />
            </div>
            {bothCounted && realCalls != null && templateCalls != null && (
              <div className="mt-2">
                <Bar value={(realCalls / (realCalls + templateCalls)) * 100} />
                <p className={MONO}>{Math.round((realCalls / (realCalls + templateCalls)) * 100)}% de las llamadas fueron del modelo real</p>
              </div>
            )}
            <p className={cn(MONO, "mt-2 flex items-center gap-1")}><Activity className="h-3 w-3" aria-hidden="true" /> último modo: {lastMode ?? "no expuesto"} · estado: {cognition.status ?? "—"}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default TelemetriaTab;
