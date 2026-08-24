"use client";

/**
 * STUDIO 1.58 · Memoria — «Memoria del dispositivo» (Ola 6 · Adenda 158, ronda
 * «memoria total»).
 * ----------------------------------------------------------------------------
 * El usuario pidió que TODO el almacenamiento local se sincronice con la IA y
 * que las respuestas usen TODAS las memorias, no solo 3 recuerdos sueltos.
 * Esta sección habla con el módulo nuevo del backend soberano
 * (`/api/memory/device_sync*`) que vigila carpetas REALES del dispositivo
 * donde corre la neurona —nunca del navegador— y las indexa en el mismo
 * grafo/índice que usa para responder.
 *
 * Se añade también un probador de contexto (`/api/memory/search`): el
 * backend usa esa MISMA función para armar el contexto de cada respuesta del
 * chat, así que esta caja no es una curiosidad — es literalmente lo que ve el
 * modelo. Sirve para entender por qué la IA contestó lo que contestó.
 *
 * Honestidad: nunca se inventan carpetas, totales ni errores. Si el backend
 * no responde, se dice «sin conexión» con el motivo (vía `Empty`/`useS158Load`).
 * Indexar es LENTO de verdad (~17 s por carpeta pequeña) — se avisa ANTES de
 * empezar, y el toast al terminar trae los números reales del backend.
 */

import { useState } from "react";
import { FolderPlus, FolderSync, HardDrive, RefreshCw, Telescope, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  addAstraura158DeviceSyncFolder, configureAstraura158DeviceSync, fetchAstraura158DeviceSync, removeAstraura158DeviceSyncFolder,
  runAstraura158DeviceSync, searchAstraura158MemoryContext, toggleAstraura158DeviceSyncFolder,
  type Astraura158ContextHit, type Astraura158DeviceSyncFolder, type Astraura158DeviceSyncRunResult, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import {
  BTN, BTN_DANGER, BTN_PRIMARY, Badge, BusyIcon, CARD, Empty, Field, INPUT, MONO, SUB, SectionTitle, Stat,
  clampInt, fmtAgo, levelTone, runS158, useBusy, useS158Load,
} from "./shared";

/** Etiqueta legible del origen de un fragmento de contexto (`Astraura158ContextHit.source`). */
function sourceLabel(source?: string): string {
  if (source === "memory") return "recuerdo";
  if (source === "document") return "documento";
  if (source === "concept") return "concepto";
  return source || "otro";
}

/** Color por tipo de origen. «concepto» reutiliza el violeta que ya usa OpenViking para «Propagación de Conceptos». */
function sourceTone(source?: string): string {
  if (source === "memory") return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
  if (source === "document") return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
  if (source === "concept") return "border-violet-400/30 bg-violet-500/15 text-violet-100";
  return "border-white/15 bg-white/[0.04] text-white/60";
}

/** Resumen honesto de una corrida de indexación: números reales, y si algo falló, se dice (no se esconde). */
function summarizeRun(r: Astraura158DeviceSyncRunResult): string {
  const secs = typeof r.seconds === "number" ? `${r.seconds.toFixed(1)} s` : "tiempo no reportado";
  const failed = (r.per_folder ?? []).filter((f) => f.error).length;
  const base = `${r.indexed_files ?? 0} fichero(s) · ${r.new_chunks ?? 0} fragmento(s) nuevo(s) · ${secs}`;
  return failed > 0 ? `${base} · ${failed} carpeta(s) con error` : base;
}

export function MemoriaDispositivoSection({ target }: { target: Astraura158Target }) {
  // `fetchAstraura158DeviceSync` se pasa TAL CUAL (función de módulo, estable):
  // `useS158Load` recarga en cada render si el loader cambia de identidad, y un
  // arrow inline aquí dispararía peticiones sin parar.
  const sync = useS158Load(fetchAstraura158DeviceSync, target, 20_000);
  const { busy, wrap } = useBusy();
  const confirm = useConfirm();
  const [newPath, setNewPath] = useState("");
  const [ctxQuery, setCtxQuery] = useState("");
  const [ctxResults, setCtxResults] = useState<Astraura158ContextHit[] | null>(null);
  const [ctxSearching, setCtxSearching] = useState(false);
  const [ctxError, setCtxError] = useState("");

  const d = sync.data;
  const list = d?.folders ?? [];

  function saveAutoConfig(patch: { auto?: boolean; interval_minutes?: number }, label: string) {
    void wrap("config", () => runS158(label, () => configureAstraura158DeviceSync(target, patch), { after: () => sync.reload(true) }));
  }

  async function addFolder() {
    const path = newPath.trim();
    if (!path) return;
    await wrap("add", () => runS158("Carpeta añadida", () => addAstraura158DeviceSyncFolder(target, path, true), {
      after: async () => { setNewPath(""); await sync.reload(true); },
    }));
  }

  function toggleFolder(folder: Astraura158DeviceSyncFolder, enabled: boolean) {
    void wrap(`toggle:${folder.path}`, () => runS158(
      `${folder.path}: ${enabled ? "activada" : "desactivada"}`,
      () => toggleAstraura158DeviceSyncFolder(target, folder.path, enabled),
      { after: () => sync.reload(true) },
    ));
  }

  async function removeFolder(folder: Astraura158DeviceSyncFolder) {
    const ok = await confirm({
      title: `¿Dejar de vigilar «${folder.path}»?`,
      description: "Deja de vigilarla desde ahora. No se puede deshacer desde aquí.",
      confirmText: "Quitar", cancelText: "Cancelar", destructive: true,
    });
    if (!ok) return;
    await wrap(`remove:${folder.path}`, () => runS158("Carpeta quitada", () => removeAstraura158DeviceSyncFolder(target, folder.path), { after: () => sync.reload(true) }));
  }

  async function indexFolder(folder: Astraura158DeviceSyncFolder) {
    await wrap(`run:${folder.path}`, () => runS158(
      `${folder.path}: indexación completada`,
      () => runAstraura158DeviceSync(target, folder.path),
      { description: summarizeRun, after: () => sync.reload(true) },
    ));
  }

  async function indexAll() {
    await wrap("run-all", () => runS158("Indexación completa", () => runAstraura158DeviceSync(target, null), {
      description: summarizeRun, after: () => sync.reload(true),
    }));
  }

  async function runContextSearch() {
    const query = ctxQuery.trim();
    if (!query) return;
    setCtxSearching(true);
    const res = await searchAstraura158MemoryContext(target, query, 8);
    setCtxSearching(false);
    if (res.ok) { setCtxResults(res.data.hits ?? []); setCtxError(""); } else { setCtxResults(null); setCtxError(res.error); }
  }

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={FolderSync} title="Memoria del dispositivo" tone="text-cyan-300"
          hint="Todo lo que vigiles aquí entra en el MISMO índice que usa el backend para responder — no son dos memorias separadas."
          right={<button type="button" className={BTN} onClick={() => { void sync.reload(); }} aria-label="Recargar sincronización del dispositivo"><RefreshCw className={cn("h-3 w-3", sync.loading && "animate-spin")} aria-hidden="true" /></button>} />
        {!d && <Empty loading={sync.loading} error={sync.error} text="Sin datos de sincronización." />}
        {d && (
          <>
            {/* `running` puede faltar en backends viejos: sin el campo, no se afirma nada (ni corriendo ni en reposo). */}
            {typeof d.running === "boolean" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={levelTone(d.running ? "running" : "paused")}>{d.running ? "demonio corriendo ahora" : "demonio en reposo"}</Badge>
              </div>
            )}
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Stat label="Documentos" value={d.total_documents ?? "—"} />
              <Stat label="Nodos del grafo" value={d.total_nodes ?? "—"} />
              <Stat label="Carpetas" value={list.length} />
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-white/10 pt-2.5">
              <label className="flex items-center gap-2 text-[11px] text-white/80">
                <Switch checked={!!d.auto} disabled={busy !== ""} aria-label="Sincronización automática"
                  onCheckedChange={(v) => { saveAutoConfig({ auto: v }, v ? "Sincronización automática activada" : "Sincronización automática desactivada"); }} />
                Sincronización automática
              </label>
              <Field label="Cada cuántos minutos" className="w-32">
                <input type="number" min={1} max={1440} className={INPUT} defaultValue={d.interval_minutes ?? 30} disabled={busy !== ""}
                  aria-label="Minutos entre sincronizaciones automáticas"
                  onBlur={(e) => {
                    const v = clampInt(e.target.value, 1, 1440, d.interval_minutes ?? 30);
                    if (v !== (d.interval_minutes ?? 30)) saveAutoConfig({ interval_minutes: v }, `Sincroniza cada ${v} min`);
                  }} />
              </Field>
            </div>
          </>
        )}
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={HardDrive} title={`Carpetas vigiladas (${list.length})`} tone="text-cyan-300"
          hint="Rutas REALES del dispositivo donde corre el backend soberano. Actívalas, desactívalas o quítalas; cada una guarda su última indexación, ficheros y fragmentos — y el error tal cual si algo falló."
          right={<button type="button" className={BTN} onClick={() => { void sync.reload(); }} aria-label="Recargar carpetas vigiladas"><RefreshCw className={cn("h-3 w-3", sync.loading && "animate-spin")} aria-hidden="true" /></button>} />

        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Ruta de la carpeta" className="min-w-[240px] flex-1">
            <input className={INPUT} value={newPath} onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void addFolder(); }}
              aria-label="Ruta de la nueva carpeta a vigilar" placeholder="/home/usuario/Documentos" />
          </Field>
          <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || !newPath.trim()} aria-label="Añadir carpeta" onClick={() => { void addFolder(); }}>
            <BusyIcon busy={busy === "add"} icon={FolderPlus} /> Añadir carpeta
          </button>
        </div>

        <div className="mt-2 space-y-1.5">
          {list.length === 0 && <Empty loading={sync.loading} error={sync.error} text="Sin carpetas vigiladas todavía: añade la primera arriba." />}
          {list.map((f) => (
            <div key={f.path} className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/90" title={f.path}>{f.path}</p>
                <Switch checked={f.enabled !== false} disabled={busy !== ""} aria-label={`Carpeta ${f.path}: ${f.enabled !== false ? "activa" : "inactiva"}`}
                  onCheckedChange={(v) => toggleFolder(f, v)} />
                <button type="button" className={BTN} disabled={busy !== ""} aria-label={`Indexar ${f.path} ahora`} onClick={() => { void indexFolder(f); }}>
                  <BusyIcon busy={busy === `run:${f.path}`} icon={Zap} />
                </button>
                <button type="button" className={BTN_DANGER} disabled={busy !== ""} aria-label={`Dejar de vigilar ${f.path}`} onClick={() => { void removeFolder(f); }}>
                  <BusyIcon busy={busy === `remove:${f.path}`} icon={Trash2} />
                </button>
              </div>
              <p className={MONO}>
                {f.last_indexed ? `última indexación ${fmtAgo(f.last_indexed)}` : "nunca indexada"}
                {typeof f.files_indexed === "number" ? ` · ${f.files_indexed} fichero(s)` : ""}
                {typeof f.chunks_added === "number" ? ` · ${f.chunks_added} fragmento(s)` : ""}
              </p>
              {f.last_error && <p className="text-[10px] leading-snug text-rose-300/90">Error: {f.last_error}</p>}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2.5">
          <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || list.length === 0} aria-label="Indexar todas las carpetas ahora" onClick={() => { void indexAll(); }}>
            <BusyIcon busy={busy === "run-all"} icon={Zap} /> Indexar todo ahora
          </button>
          <p className="text-[10px] leading-snug text-amber-200/80">Operación lenta de verdad: ~17 s por carpeta pequeña; con varias carpetas o miles de documentos puede tardar minutos. No cierres esta pestaña mientras corre.</p>
        </div>
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Telescope} title="Qué recuerda de esto" tone="text-violet-300"
          hint="Esto es EXACTAMENTE el contexto que recibe el modelo en cada respuesta: el backend usa esta misma función para las dos cosas. Sirve para entender por qué la IA contestó lo que contestó." />
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Probar una pregunta o tema" className="min-w-[240px] flex-1">
            <input className={INPUT} value={ctxQuery} onChange={(e) => setCtxQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void runContextSearch(); }}
              aria-label="Texto a probar contra la memoria" placeholder="p. ej. ¿qué sabes sobre mi proyecto X?" />
          </Field>
          <button type="button" className={BTN_PRIMARY} disabled={ctxSearching || !ctxQuery.trim()} aria-label="Probar qué recuerda de esto" onClick={() => { void runContextSearch(); }}>
            <BusyIcon busy={ctxSearching} icon={Telescope} /> Probar
          </button>
        </div>
        {ctxError && <p className="mt-2 text-[11px] text-amber-200/85">Sin conexión con el backend: {ctxError}.</p>}
        {ctxResults && (
          <div className="mt-2 space-y-1.5">
            {ctxResults.length === 0 && <Empty text="El backend no encontró contexto relevante para eso." />}
            {ctxResults.map((h, i) => (
              <div key={`${h.title ?? "hit"}:${i}`} className={cn(SUB, "px-3 py-1.5")}>
                <div className="flex items-center gap-1.5">
                  <Badge tone={sourceTone(h.source)}>{sourceLabel(h.source)}</Badge>
                  <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/90">{h.title ?? "(sin título)"}</p>
                  {typeof h.score === "number" && <span className={MONO}>{h.score.toFixed(2)}</span>}
                </div>
                {h.text && <p className="mt-0.5 line-clamp-3 text-[10px] leading-snug text-white/65">{h.text}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default MemoriaDispositivoSection;
