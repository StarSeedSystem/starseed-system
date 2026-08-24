"use client";

/**
 * STUDIO 1.58 · Almacenamiento — dispositivos detectados por el backend,
 * reglas de enrutamiento de medios (qué carpeta alimenta qué cerebro, si
 * dispara imaginación, límites de capacidad), el agente de enrutamiento y la
 * telemetría de la malla de sincronización (Supabase `astraura_state` + R2).
 *
 * (Ola 6 · Adenda 158) Paridad con `StorageRoutingView.jsx`: cerebros
 * EXTERNOS (escanear unidades, fusionar con estrategia — irreversible, pide
 * confirmación — y fijar su modo de permiso) y la App Portátil (backend +
 * cerebro en una unidad extraíble). Las reglas ahora también se EDITAN (antes
 * solo se creaban/borraban) y se prueban en seco sin disparar un evento real.
 */

import { useCallback, useState } from "react";
import { Activity, Brain, FlaskConical, GitMerge, HardDrive, Pencil, Plus, RefreshCw, Route, ScanSearch, Trash2, Usb } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  deleteAstraura158StorageRule, fetchAstraura158RoutingStorage, fetchAstraura158StorageDevices, fetchAstraura158StorageRules,
  fetchAstraura158SyncTelemetry, fuseAstraura158ExternalBrain, saveAstraura158StorageRule, scanAstraura158ExternalBrains,
  scanAstraura158StorageNow, setAstraura158ExternalBrainPermissions, simulateAstraura158StorageRule, syncAstraura158Portable,
  type Astraura158Brain, type Astraura158ExternalBrain, type Astraura158StorageDevice, type Astraura158StorageRule, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_DANGER, BTN_PRIMARY, Badge, Bar, BusyIcon, CARD, Empty, Field, INPUT, LABEL, MONO, SELECT, SUB, SectionTitle, Stat, fmtAgo, levelTone, runS158, useBusy, useS158Load, type S158TabProps } from "./shared";

const MEDIA_TYPES = ["any", "image", "video", "audio", "document", "code", "dataset", "model"];

const EMPTY_DRAFT: Astraura158StorageRule = { name: "", media_type: "any", target_path: "", is_enabled: true, auto_memory_routing: { enabled: true, target_brains: [], memory_category: "media", index_files: true }, trigger_imagination: { enabled: false, process_types: [], burst_cycles: 1 } };

/** Estrategias reales que acepta `fuseAstraura158ExternalBrain` / se reutilizan como modo de permiso. */
const STRATEGIES = ["bidirectional_merge", "import_only", "export_only"] as const;
const STRATEGY_LABEL: Record<(typeof STRATEGIES)[number], string> = {
  bidirectional_merge: "Fusión bidireccional",
  import_only: "Solo importar (de ellos a ti)",
  export_only: "Solo exportar (de ti a ellos)",
};

export function AlmacenamientoTab({ target, manifest }: S158TabProps) {
  const devices = useS158Load(fetchAstraura158StorageDevices, target, 30_000);
  const rules = useS158Load(fetchAstraura158StorageRules, target);
  const routing = useS158Load(fetchAstraura158RoutingStorage, target, 30_000);
  const sync = useS158Load(fetchAstraura158SyncTelemetry, target, 30_000);
  const { busy, wrap } = useBusy();
  const [draft, setDraft] = useState<Astraura158StorageRule>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [simResults, setSimResults] = useState<Record<string, string[] | undefined>>({});

  const reloadRules = useCallback(async () => { await rules.reload(true); }, [rules]);
  const brains = manifest?.brains ?? [];
  const list = rules.data?.rules ?? [];
  const r = routing.data;
  const mesh = sync.data?.mesh;
  const deviceList = devices.data?.devices ?? [];

  const saveRule = (rule: Astraura158StorageRule, label: string) => wrap(`rule:${rule.id ?? "new"}`, () => runS158(label, () => saveAstraura158StorageRule(target, rule), { after: reloadRules }));

  function editRule(rule: Astraura158StorageRule) {
    if (!rule.id) return;
    setEditingId(rule.id);
    setDraft({ ...rule });
  }
  function cancelEdit() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }
  async function simulateRule(rule: Astraura158StorageRule) {
    if (!rule.id) return;
    const id = rule.id;
    await wrap(`sim:${id}`, async () => {
      const res = await simulateAstraura158StorageRule(target, id);
      if (res.ok) {
        setSimResults((s) => ({ ...s, [id]: res.data.steps ?? [] }));
        toast.success("Simulación ejecutada (sin evento real)", { description: `${(res.data.steps ?? []).length} paso(s)` });
      } else {
        setSimResults((s) => ({ ...s, [id]: undefined }));
        toast.error(`Simulación fallida: ${res.error}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={HardDrive} title={`Dispositivos (${devices.data?.devices_count ?? deviceList.length})`} tone="text-cyan-300" hint="Volúmenes que ve la máquina del backend; los externos disparan las reglas al conectarse."
            right={<button type="button" className={BTN} onClick={() => { void devices.reload(); }} aria-label="Recargar dispositivos"><RefreshCw className={cn("h-3 w-3", devices.loading && "animate-spin")} aria-hidden="true" /></button>} />
          <div className="mt-2 space-y-1.5">
            {deviceList.length === 0 && <Empty loading={devices.loading} error={devices.error} text="Sin dispositivos." />}
            {deviceList.slice(0, 12).map((d, i) => (
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
            <div key={rule.id ?? rule.name} className={cn(SUB, "flex flex-col gap-1 px-3 py-2", editingId && editingId === rule.id && "border-cyan-400/40")}>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{rule.name ?? rule.id}</p>
                <Badge tone="border-white/10 text-white/60">{rule.media_type ?? "any"}</Badge>
                {rule.status && <Badge tone={levelTone(rule.status)}>{rule.status}</Badge>}
                <Switch checked={rule.is_enabled !== false} disabled={busy !== ""} aria-label={`Regla ${rule.name ?? rule.id}`} onCheckedChange={(v) => { void saveRule({ ...rule, is_enabled: v }, `${rule.name ?? "Regla"}: ${v ? "activada" : "desactivada"}`); }} />
                <button type="button" className={BTN} disabled={busy !== "" || !rule.id} aria-label={`Editar ${rule.name ?? rule.id}`} onClick={() => editRule(rule)}>
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                </button>
                <button type="button" className={BTN} disabled={busy !== "" || !rule.id} aria-label={`Probar en seco ${rule.name ?? rule.id}`} onClick={() => { void simulateRule(rule); }}>
                  <BusyIcon busy={busy === `sim:${rule.id}`} icon={FlaskConical} />
                </button>
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
              {rule.id && simResults[rule.id] !== undefined && (
                <div className="mt-1 rounded-md border border-cyan-400/20 bg-cyan-500/[0.05] px-2 py-1.5">
                  <p className="text-[10px] font-medium text-cyan-200">Simulación (prueba en seco, sin evento real):</p>
                  {(simResults[rule.id] ?? []).length === 0 ? (
                    <p className="text-[10px] text-white/50">El backend no devolvió pasos.</p>
                  ) : (
                    <ol className="mt-0.5 list-decimal space-y-0.5 pl-4 text-[10px] text-white/70">
                      {(simResults[rule.id] ?? []).map((step, i) => <li key={i}>{step}</li>)}
                    </ol>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={cn(SUB, "mt-3 flex flex-col gap-2 px-3 py-2")}>
          <p className="text-[11px] font-semibold text-white/85">{editingId ? `Editando «${draft.name || editingId}»` : "Nueva regla"}</p>
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
                      <Brain className="h-3 w-3" aria-hidden="true" /> {b.name}
                    </button>
                  );
                })}
              </div>
            </Field>
            <label className="flex items-center gap-2 text-[11px] text-white/80"><Switch checked={!!draft.trigger_imagination?.enabled} aria-label="Disparar imaginación al detectar" onCheckedChange={(v) => setDraft({ ...draft, trigger_imagination: { ...(draft.trigger_imagination ?? {}), enabled: v } })} /> dispara imaginación</label>
            <label className="flex items-center gap-2 text-[11px] text-white/80"><Switch checked={draft.auto_memory_routing?.index_files !== false} aria-label="Indexar archivos" onCheckedChange={(v) => setDraft({ ...draft, auto_memory_routing: { ...(draft.auto_memory_routing ?? {}), enabled: true, index_files: v } })} /> indexar archivos en memoria</label>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || !draft.name?.trim() || !draft.target_path?.trim()} aria-label={editingId ? "Guardar cambios de la regla" : "Crear regla"}
              onClick={() => { void saveRule({ ...draft, name: draft.name?.trim(), target_path: draft.target_path?.trim() }, editingId ? "Regla actualizada" : "Regla creada").then(() => { setDraft(EMPTY_DRAFT); setEditingId(null); }); }}>
              <BusyIcon busy={busy === `rule:${editingId ?? "new"}`} icon={editingId ? Pencil : Plus} /> {editingId ? "Guardar cambios" : "Crear regla"}
            </button>
            {editingId && <button type="button" className={BTN} disabled={busy !== ""} aria-label="Cancelar edición de regla" onClick={cancelEdit}>Cancelar</button>}
          </div>
        </div>
      </div>

      <ExternalBrainsCard target={target} />
      <PortableSyncCard target={target} brains={brains} devices={deviceList} />
    </div>
  );
}

/* ── Cerebros externos: escanear, fusionar (irreversible) y fijar permiso ──── */

function ExternalBrainsCard({ target }: { target: Astraura158Target }) {
  const confirm = useConfirm();
  const { busy, wrap } = useBusy();
  const [brains, setBrains] = useState<Astraura158ExternalBrain[] | null>(null);
  const [scanError, setScanError] = useState("");
  const [scanned, setScanned] = useState(false);
  const [strategyByBrain, setStrategyByBrain] = useState<Record<string, (typeof STRATEGIES)[number]>>({});

  function strategyFor(id: string): (typeof STRATEGIES)[number] {
    return strategyByBrain[id] ?? "bidirectional_merge";
  }

  async function scan() {
    await wrap("scan-brains", async () => {
      const res = await scanAstraura158ExternalBrains(target);
      setScanned(true);
      if (res.ok) {
        // El backend responde `external_brains` (verificado contra main.py).
        const found = res.data.external_brains ?? [];
        setBrains(found);
        setScanError("");
        toast.success("Escaneo completado", { description: `${found.length} cerebro(s) externo(s) detectado(s)` });
      } else {
        setBrains(null);
        setScanError(res.error);
        toast.error(`Escaneo fallido: ${res.error}`);
      }
    });
  }

  async function fuse(b: Astraura158ExternalBrain) {
    if (!b.id) return;
    const id = b.id;
    const strategy = strategyFor(id);
    const ok = await confirm({
      title: `¿Fusionar «${b.name ?? id}»?`,
      description: `Estrategia: ${STRATEGY_LABEL[strategy]}. Esta operación es IRREVERSIBLE desde el OS: ${strategy === "export_only" ? "envía tu memoria hacia ese cerebro externo" : strategy === "import_only" ? "trae su memoria hacia el tuyo" : "fusiona ambos sentidos"}.`,
      confirmText: "Fusionar", cancelText: "Cancelar", destructive: true,
    });
    if (!ok) return;
    await wrap(`fuse:${id}`, () => runS158("Cerebro fusionado", () => fuseAstraura158ExternalBrain(target, id, strategy), {
      description: (d) => (typeof d.merged === "number" ? `${d.merged} elemento(s) fusionado(s)` : undefined),
    }));
  }

  async function setPerm(b: Astraura158ExternalBrain, mode: string) {
    if (!b.id) return;
    const id = b.id;
    await wrap(`perm:${id}`, () => runS158("Modo de permiso actualizado", () => setAstraura158ExternalBrainPermissions(target, id, mode)));
  }

  const list = brains ?? [];

  return (
    <div className={cn(CARD, "p-3")}>
      <SectionTitle icon={Brain} title={`Cerebros externos (${list.length})`} tone="text-fuchsia-300"
        hint="Bóvedas Astraura de otras personas o dispositivos en las unidades conectadas a esta neurona. Fusionar es irreversible desde aquí."
        right={<button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Escanear cerebros externos" onClick={() => { void scan(); }}><BusyIcon busy={busy === "scan-brains"} icon={ScanSearch} /> Escanear</button>} />
      {!scanned && <p className="mt-2 text-[11px] text-white/55">Sin escanear todavía en esta sesión.</p>}
      {scanned && scanError && <p className="mt-2 text-[11px] text-amber-200/85">Sin conexión con el backend: {scanError}.</p>}
      {scanned && !scanError && list.length === 0 && <p className="mt-2 text-[11px] text-white/55">Ningún cerebro externo detectado en las unidades conectadas.</p>}
      {list.length > 0 && (
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {list.map((b, i) => {
            const id = b.id ?? String(i);
            return (
              <div key={id} className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{b.name ?? id}</p>
                  {typeof b.memories === "number" && <Badge tone="border-white/10 text-white/60">{b.memories} memorias</Badge>}
                </div>
                <p className={MONO}>{b.owner ?? "propietario desconocido"}{b.device ? ` · ${b.device}` : ""}{(b.volume ?? b.path) ? ` · ${b.volume ?? b.path}` : ""}{typeof b.size_mb === "number" ? ` · ${b.size_mb.toFixed(0)} MB` : ""}{b.last_seen ? ` · visto ${b.last_seen}` : ""}</p>
                <Field label="Modo de permiso">
                  <select className={SELECT} value={b.permission_mode ?? "bidirectional_merge"} disabled={busy !== ""} aria-label={`Modo de permiso para ${b.name ?? id}`}
                    onChange={(e) => { void setPerm(b, e.target.value); }}>
                    {STRATEGIES.map((s) => <option key={s} value={s}>{STRATEGY_LABEL[s]}</option>)}
                  </select>
                </Field>
                <div className="flex flex-wrap items-center gap-1.5">
                  <select className={SELECT} value={strategyFor(id)} disabled={busy !== ""} aria-label={`Estrategia de fusión para ${b.name ?? id}`}
                    onChange={(e) => setStrategyByBrain((s) => ({ ...s, [id]: e.target.value as (typeof STRATEGIES)[number] }))}>
                    {STRATEGIES.map((s) => <option key={s} value={s}>{STRATEGY_LABEL[s]}</option>)}
                  </select>
                  <button type="button" className={BTN_DANGER} disabled={busy !== ""} aria-label={`Fusionar cerebro ${b.name ?? id}`} onClick={() => { void fuse(b); }}>
                    <BusyIcon busy={busy === `fuse:${id}`} icon={GitMerge} /> Fusionar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── App portátil: backend + cerebro en una unidad extraíble ───────────────── */

function PortableSyncCard({ target, brains, devices }: { target: Astraura158Target; brains: Astraura158Brain[]; devices: Astraura158StorageDevice[] }) {
  const { busy, wrap } = useBusy();
  const [volume, setVolume] = useState("");
  const [brainId, setBrainId] = useState("");
  const [includeModels, setIncludeModels] = useState(true);
  const [result, setResult] = useState<{ path?: string; size_mb?: number } | null>(null);

  async function run() {
    const vol = volume.trim();
    if (!vol) { toast.error("Indica la unidad o ruta de destino."); return; }
    await wrap("portable", async () => {
      const res = await syncAstraura158Portable(target, { drive_path: vol, brain_id: brainId || undefined, include_projects: includeModels });
      if (res.ok) {
        setResult({ path: res.data.path, size_mb: res.data.size_mb });
        toast.success("App portátil sincronizada", { description: res.data.path ?? vol });
      } else {
        setResult(null);
        toast.error(`No se pudo sincronizar: ${res.error}`);
      }
    });
  }

  return (
    <div className={cn(CARD, "p-3")}>
      <SectionTitle icon={Usb} title="App portátil" tone="text-cyan-300" hint="Copia el backend soberano + un cerebro a una unidad extraíble: se lleva y ejecuta desde ahí, sin instalar nada en la máquina anfitriona." />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Field label="Cerebro a incluir">
          <select className={SELECT} value={brainId} onChange={(e) => setBrainId(e.target.value)} aria-label="Cerebro a incluir en la app portátil">
            <option value="">Cerebro activo (por defecto)</option>
            {brains.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Unidad o ruta de destino">
          <input className={INPUT} value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="/Volumes/USB o D:\Astraura" aria-label="Unidad o ruta de destino de la app portátil" />
        </Field>
      </div>
      {devices.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={LABEL}>detectados</span>
          {devices.slice(0, 8).map((dev, i) => {
            const path = dev.mountpoint ?? dev.device ?? "";
            return (
              <button key={path || i} type="button" className={BTN} aria-label={`Usar unidad ${path}`} onClick={() => setVolume(path)}>
                {path.split(/[/\\]/).filter(Boolean).pop() || path || "?"}
              </button>
            );
          })}
        </div>
      )}
      <label className="mt-2 flex items-center gap-2 text-[11px] text-white/80">
        <Switch checked={includeModels} aria-label="Incluir modelos en la app portátil" onCheckedChange={setIncludeModels} />
        incluir modelos <span className="text-white/45">(pesa más; funciona aunque la máquina anfitriona no los tenga)</span>
      </label>
      {result && <p className={cn(MONO, "mt-2")}>Generada en {result.path ?? volume}{typeof result.size_mb === "number" ? ` · ${result.size_mb.toFixed(0)} MB` : ""}</p>}
      <button type="button" className={cn(BTN_PRIMARY, "mt-2")} disabled={busy !== "" || !volume.trim()} aria-label="Sincronizar app portátil a la unidad" onClick={() => { void run(); }}>
        <BusyIcon busy={busy === "portable"} icon={Usb} /> Sincronizar a la unidad
      </button>
    </div>
  );
}

export default AlmacenamientoTab;
