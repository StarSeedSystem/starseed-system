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

import { useMemo, useState } from "react";
import {
  Activity, BrainCircuit, Cpu, Database, Gauge, Hammer, MemoryStick, Network, RefreshCw, Server, Waves,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  buildAstraura158Bitnet, describeAstraura158Engine, fetchAstraura158BitnetStatus, fetchAstraura158Processes, fetchAstraura158Status,
  fetchAstraura158SyncTelemetry, fetchAstraura158SystemSenses, type Astraura158BitnetServerProfile,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_PRIMARY, Badge, Bar, BusyIcon, CARD, Empty, MONO, SUB, SectionTitle, Stat, useBusy, useS158Load, type S158TabProps } from "./shared";

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
  // (Ola 6 · Adenda 158) Recompilación nativa de bitnet.cpp — única acción que faltaba en esta pestaña.
  const { busy, wrap } = useBusy();
  const [buildLog, setBuildLog] = useState<string[] | null>(null);

  async function rebuildBitnet() {
    await wrap("build", async () => {
      const res = await buildAstraura158Bitnet(target);
      if (res.ok) {
        setBuildLog(res.data.log ?? []);
        toast.success("Recompilación de bitnet.cpp completada", { description: res.data.log?.length ? `${res.data.log.length} línea(s) de log` : undefined });
        await bitnet.reload(true);
        await status.reload(true);
      } else {
        toast.error(`Recompilación fallida: ${res.error}`);
      }
    });
  }

  const s = status.data;
  const engine = describeAstraura158Engine(s);
  const eng = s?.engine;
  // (Adenda 157) Pila de cuantización publicada por el backend soberano.
  const qstack = eng?.quantization_stack;

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
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2.5">
          <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Recompilar bitnet.cpp nativo" onClick={() => { void rebuildBitnet(); }}>
            <BusyIcon busy={busy === "build"} icon={Hammer} /> Recompilar bitnet.cpp nativo
          </button>
          <p className="text-[10px] leading-snug text-amber-200/80">Operación larga (puede tardar varios minutos): compila el motor ternario con las optimizaciones del silicio de esta máquina. No cierres esta pestaña mientras corre.</p>
        </div>
        {buildLog && (
          <div className={cn(SUB, "mt-2 max-h-40 overflow-auto px-2.5 py-2")}>
            <p className="text-[10px] font-medium text-white/70">Log de compilación ({buildLog.length} línea(s)):</p>
            {buildLog.length === 0 ? <p className="mt-1 text-[10px] text-white/50">El backend no devolvió log.</p> : <pre className="mt-1 whitespace-pre-wrap break-words font-code text-[10px] text-cyan-100/80">{buildLog.join("\n")}</pre>}
          </div>
        )}
      </div>

      {/* Memoria + Hardware */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn(CARD, "p-3")}>
          {/* (Ola 5 · Adenda 157) Pila de cuantización: pesos del modelo y memoria. */}
        {qstack && (
          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={Cpu} title="Pila de cuantización" tone="text-fuchsia-300"
              hint="Qué motor ternario sirve los PESOS en esta neurona y cómo está comprimido el ÍNDICE de memoria. Fuente: `/api/status` → engine.quantization_stack." />
            <div className="mt-2 space-y-1.5">
              {(qstack.pesos?.motores ?? []).map((m, i) => (
                <div key={m.id ?? i} className={cn(SUB, "px-3 py-2")}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{m.nombre ?? m.id}</span>
                    <Badge tone={m.activo ? "border-emerald-400/30 text-emerald-200" : m.disponible ? "border-cyan-400/30 text-cyan-200" : "border-white/10 text-white/50"}>
                      {m.activo ? "activo" : m.disponible ? "disponible" : "no aplicable"}
                    </Badge>
                  </div>
                  {m.cuantizacion && <p className={MONO}>{m.cuantizacion}</p>}
                  {m.detalle && <p className="mt-0.5 text-[10px] leading-snug text-white/60">{m.detalle}</p>}
                  {m.url && <a className="text-[10px] text-cyan-300/80 underline-offset-2 hover:underline" href={m.url} target="_blank" rel="noopener noreferrer">código del acelerador</a>}
                </div>
              ))}
              {qstack.pesos?.maquina && <p className={MONO}>máquina: {qstack.pesos.maquina}</p>}
            </div>
            {qstack.memoria && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <p className="text-[11px] font-medium text-white/85">Índice de memoria comprimido ({qstack.memoria.codec ?? "—"})</p>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <Stat label="Estado" value={qstack.memoria.activo ? "activo" : qstack.memoria.disponible ? "en espera" : "no disponible"}
                    hint={typeof qstack.memoria.minimo_para_activarse === "number" ? `se activa desde ${qstack.memoria.minimo_para_activarse} documentos` : undefined} />
                  <Stat label="Precisión" value={`${qstack.memoria.bits ?? "?"} bits`} hint={qstack.memoria.dim ? `dimensión ${qstack.memoria.dim}` : undefined} />
                  <Stat label="Compresión" value={typeof qstack.memoria.ratio_compresion === "number" ? `${qstack.memoria.ratio_compresion.toFixed(1)}×` : "—"}
                    hint={typeof qstack.memoria.coseno_medio === "number" ? `coseno medio ${qstack.memoria.coseno_medio.toFixed(4)}` : undefined} />
                  <Stat label="Documentos" value={qstack.memoria.documentos ?? 0} hint={`${qstack.memoria.indexados ?? 0} indexados`} />
                </div>
                {qstack.memoria.nota && <p className="mt-1 text-[10px] leading-snug text-white/50">{qstack.memoria.nota}</p>}
              </div>
            )}
          </div>
        )}

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
