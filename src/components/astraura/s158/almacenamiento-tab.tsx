"use client";

/**
 * STUDIO 1.58 · Almacenamiento — dispositivos detectados por el backend,
 * reglas de enrutamiento de medios (qué carpeta alimenta qué cerebro, si
 * dispara imaginación, límites de capacidad), el agente de enrutamiento y la
 * telemetría de la malla de sincronización (Supabase `astraura_state` + R2).
 */

import { useCallback, useState } from "react";
import { HardDrive, Plus, RefreshCw, Route, ScanSearch, Trash2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  deleteAstraura158StorageRule, fetchAstraura158RoutingStorage, fetchAstraura158StorageDevices, fetchAstraura158StorageRules,
  fetchAstraura158SyncTelemetry, saveAstraura158StorageRule, scanAstraura158StorageNow, type Astraura158StorageRule,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_DANGER, BTN_PRIMARY, Badge, Bar, BusyIcon, CARD, Empty, Field, INPUT, MONO, SELECT, SUB, SectionTitle, Stat, fmtAgo, levelTone, runS158, useBusy, useS158Load, type S158TabProps } from "./shared";

const MEDIA_TYPES = ["any", "image", "video", "audio", "document", "code", "dataset", "model"];

export function AlmacenamientoTab({ target, manifest }: S158TabProps) {
  const devices = useS158Load(fetchAstraura158StorageDevices, target, 30_000);
  const rules = useS158Load(fetchAstraura158StorageRules, target);
  const routing = useS158Load(fetchAstraura158RoutingStorage, target, 30_000);
  const sync = useS158Load(fetchAstraura158SyncTelemetry, target, 30_000);
  const { busy, wrap } = useBusy();
  const [draft, setDraft] = useState<Astraura158StorageRule>({ name: "", media_type: "any", target_path: "", is_enabled: true, auto_memory_routing: { enabled: true, target_brains: [], memory_category: "media", index_files: true }, trigger_imagination: { enabled: false, process_types: [], burst_cycles: 1 } });

  const reloadRules = useCallback(async () => { await rules.reload(true); }, [rules]);
  const brains = manifest?.brains ?? [];
  const list = rules.data?.rules ?? [];
  const r = routing.data;
  const mesh = sync.data?.mesh;

  const saveRule = (rule: Astraura158StorageRule, label: string) => wrap(`rule:${rule.id ?? "new"}`, () => runS158(label, () => saveAstraura158StorageRule(target, rule), { after: reloadRules }));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={HardDrive} title={`Dispositivos (${devices.data?.devices_count ?? devices.data?.devices?.length ?? 0})`} tone="text-cyan-300" hint="Volúmenes que ve la máquina del backend; los externos disparan las reglas al conectarse."
            right={<button type="button" className={BTN} onClick={() => { void devices.reload(); }} aria-label="Recargar dispositivos"><RefreshCw className={cn("h-3 w-3", devices.loading && "animate-spin")} aria-hidden="true" /></button>} />
          <div className="mt-2 space-y-1.5">
            {(devices.data?.devices ?? []).length === 0 && <Empty loading={devices.loading} error={devices.error} text="Sin dispositivos." />}
            {(devices.data?.devices ?? []).slice(0, 12).map((d, i) => (
              <div key={`${d.mountpoint ?? d.device ?? i}`} className={cn(SUB, "px-3 py-1.5")}>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[11px] text-white/85" title={d.device}>{d.mountpoint ?? d.device}</p>
                  {d.is_external && <Badge tone="border-amber-400/30 text-amber-200">externo</Badge>}
                  {d.is_connected === false && <Badge tone="border-white/10 text-white/50">desconectado</Badge>}
                  <span className={MONO}>{d.fstype ?? ""}</span>
                </div>
                <Bar value={d.percent_used} tone="bg-amber-400/60" className="mt-1" />
                <p className={MONO}>{(d.free_gb ?? 0).toFixed(0)} GB libres de {(d.total_gb ?? 0).toFixed(0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Activity} title="Agente de enrutamiento y malla" tone="text-emerald-300" hint="El agente mueve lo detectado a los cerebros; la malla empuja el estado a Supabase/R2 para tus otras neuronas." />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat label="Agente" value={r ? (r.enabled === false ? "desactivado" : r.is_busy ? "ocupado" : "listo") : "—"} hint={r ? `${r.sync_runs ?? 0} sincronizaciones · ${r.brains_count ?? 0} cerebros` : routing.error || undefined} />
            <Stat label="Malla" value={mesh?.status ?? (sync.error ? "sin datos" : "—")} hint={mesh ? `${mesh.active_synced_clients ?? 0} neuronas sincronizadas` : undefined} />
          </div>
          {r?.capabilities && r.capabilities.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{r.capabilities.map((c) => <Badge key={c} tone="border-white/10 text-white/60">{c}</Badge>)}</div>}
          {mesh?.last_event && <p className={cn(MONO, "mt-2 truncate")}>último evento: {JSON.stringify(mesh.last_event).slice(0, 120)}</p>}
          <button type="button" className={cn(BTN_PRIMARY, "mt-2")} disabled={busy !== ""} aria-label="Escanear almacenamiento ahora"
            onClick={() => { void wrap("scan", () => runS158("Escaneo ejecutado", () => scanAstraura158StorageNow(target), { description: (d) => `${(d.events_triggered ?? []).length} evento(s) disparado(s)`, after: async () => { await reloadRules(); await devices.reload(true); } })); }}>
            <BusyIcon busy={busy === "scan"} icon={ScanSearch} /> Escanear ahora
          </button>
        </div>
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Route} title={`Reglas de enrutamiento (${list.length})`} tone="text-violet-300" hint="Qué tipo de medio, desde qué ruta, hacia qué cerebros; opcionalmente dispara ciclos de imaginación al detectar novedades."
          right={<button type="button" className={BTN} onClick={() => { void rules.reload(); }} aria-label="Recargar reglas"><RefreshCw className={cn("h-3 w-3", rules.loading && "animate-spin")} aria-hidden="true" /></button>} />
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {list.length === 0 && <Empty loading={rules.loading} error={rules.error} text="Sin reglas: crea la primera abajo." />}
          {list.map((rule) => (
            <div key={rule.id ?? rule.name} className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{rule.name ?? rule.id}</p>
                <Badge tone="border-white/10 text-white/60">{rule.media_type ?? "any"}</Badge>
                {rule.status && <Badge tone={levelTone(rule.status)}>{rule.status}</Badge>}
                <Switch checked={rule.is_enabled !== false} disabled={busy !== ""} aria-label={`Regla ${rule.name ?? rule.id}`} onCheckedChange={(v) => { void saveRule({ ...rule, is_enabled: v }, `${rule.name ?? "Regla"}: ${v ? "activada" : "desactivada"}`); }} />
                <button type="button" className={BTN_DANGER} disabled={busy !== "" || !rule.id} aria-label={`Eliminar ${rule.name ?? rule.id}`}
                  onClick={() => { if (!rule.id) return; const id = rule.id; void wrap(`del:${id}`, () => runS158("Regla eliminada", () => deleteAstraura158StorageRule(target, id), { after: reloadRules })); }}>
                  <BusyIcon busy={busy === `del:${rule.id}`} icon={Trash2} />
                </button>
              </div>
              <p className="truncate text-[10px] text-white/55" title={rule.target_path}>{rule.target_path ?? "—"}</p>
              <p className={MONO}>
                {rule.auto_memory_routing?.enabled ? `→ ${(rule.auto_memory_routing.target_brains ?? []).join(", ") || "cerebro activo"}` : "sin enrutar a memoria"}
                {rule.trigger_imagination?.enabled ? ` · imagina ×${rule.trigger_imagination.burst_cycles ?? 1}` : ""}
                {rule.last_detected_formatted ? ` · visto ${rule.last_detected_formatted}` : rule.last_detected_at ? ` · visto ${fmtAgo(rule.last_detected_at)}` : ""}
              </p>
            </div>
          ))}
        </div>

        <div className={cn(SUB, "mt-3 flex flex-col gap-2 px-3 py-2")}>
          <p className="text-[11px] font-semibold text-white/85">Nueva regla</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Nombre"><input className={INPUT} value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Nombre de la regla" /></Field>
            <Field label="Tipo de medio"><select className={SELECT} value={draft.media_type ?? "any"} onChange={(e) => setDraft({ ...draft, media_type: e.target.value })} aria-label="Tipo de medio">{MEDIA_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
            <Field label="Ruta (en la máquina del backend)" className="sm:col-span-2"><input className={INPUT} value={draft.target_path ?? ""} onChange={(e) => setDraft({ ...draft, target_path: e.target.value })} aria-label="Ruta" placeholder="/Volumes/Disco/Fotos" /></Field>
            <Field label="Cerebros destino" className="sm:col-span-2">
              <div className="flex flex-wrap gap-1">
                {brains.length === 0 && <span className="text-[10px] text-white/45">sin cerebros en el manifiesto</span>}
                {brains.map((b) => {
                  const on = (draft.auto_memory_routing?.target_brains ?? []).includes(b.id);
                  return (
                    <button key={b.id} type="button" aria-pressed={on} className={cn(BTN, on && "border-violet-400/40 bg-violet-500/15 text-violet-100")}
                      onClick={() => { const cur = draft.auto_memory_routing?.target_brains ?? []; setDraft({ ...draft, auto_memory_routing: { ...(draft.auto_memory_routing ?? {}), enabled: true, target_brains: on ? cur.filter((x) => x !== b.id) : [...cur, b.id] } }); }}>
                      🧠 {b.name}
                    </button>
                  );
                })}
              </div>
            </Field>
            <label className="flex items-center gap-2 text-[11px] text-white/80"><Switch checked={!!draft.trigger_imagination?.enabled} aria-label="Disparar imaginación al detectar" onCheckedChange={(v) => setDraft({ ...draft, trigger_imagination: { ...(draft.trigger_imagination ?? {}), enabled: v } })} /> dispara imaginación</label>
            <label className="flex items-center gap-2 text-[11px] text-white/80"><Switch checked={draft.auto_memory_routing?.index_files !== false} aria-label="Indexar archivos" onCheckedChange={(v) => setDraft({ ...draft, auto_memory_routing: { ...(draft.auto_memory_routing ?? {}), enabled: true, index_files: v } })} /> indexar archivos en memoria</label>
          </div>
          <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || !draft.name?.trim() || !draft.target_path?.trim()} aria-label="Crear regla"
            onClick={() => { void saveRule({ ...draft, name: draft.name?.trim(), target_path: draft.target_path?.trim() }, "Regla creada").then(() => setDraft({ ...draft, name: "", target_path: "" })); }}>
            <BusyIcon busy={busy === "rule:new"} icon={Plus} /> Crear regla
          </button>
        </div>
      </div>
    </div>
  );
}

export default AlmacenamientoTab;
