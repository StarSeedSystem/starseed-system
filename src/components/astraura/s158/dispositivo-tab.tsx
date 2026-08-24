"use client";

/**
 * STUDIO 1.58 · Explorador del Dispositivo.
 * ----------------------------------------------------------------------------
 * IMPORTANTE: esto lee la MÁQUINA donde corre el backend soberano (la
 * neurona) — NUNCA el dispositivo donde tienes abierto este navegador ni el
 * servidor del OS. Solo lectura: el proxy no expone escritura ni ejecución
 * (ver ALLOWLIST de `route.ts`); la vista previa de texto se acota a ~40 KB.
 *
 * Navegador de carpetas (desglose de ruta, subir, entrar), tamaño/fecha,
 * vista previa de archivos de texto, búsqueda, unidades detectadas y el
 * estado de «acceso universal al dispositivo» con su concesión EXPLÍCITA.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ArrowUp, ChevronRight, File, FileSearch, Folder, HardDrive, Lock, RefreshCw, Search, ShieldAlert, ShieldCheck, Unlock, Usb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchAstraura158Drives, fetchAstraura158Fs, fetchAstraura158ItemDetails, fetchAstraura158UniversalDeviceAccess, fetchAstraura158File,
  grantAstraura158UniversalDeviceAccess, searchAstraura158Fs, type Astraura158FsEntry, type Astraura158FsSearch, type Astraura158Response,
  type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_PRIMARY, Badge, Bar, BusyIcon, CARD, Empty, INPUT, MONO, SUB, SectionTitle, fmtTs, runS158, useBusy, useS158Load, type S158TabProps } from "./shared";

/* ── utilidades locales ─────────────────────────────────────────────────────── */

function withCapture<T>(fn: () => Promise<Astraura158Response<T>>) {
  let captured: T | undefined;
  return {
    call: async () => {
      const r = await fn();
      if (r.ok) captured = r.data;
      return r;
    },
    get: () => captured,
  };
}

function splitPath(p: string): string[] {
  return p.split(/[/\\]+/).filter(Boolean);
}

function isDirEntry(e: Astraura158FsEntry): boolean {
  if (typeof e.is_dir === "boolean") return e.is_dir;
  const t = String(e.type ?? "").toLowerCase();
  return t === "dir" || t === "directory" || t === "folder";
}

function entryPath(basePath: string, e: Astraura158FsEntry): string {
  if (typeof e.path === "string" && e.path) return e.path;
  const base = basePath.replace(/\/+$/, "");
  return `${base}/${e.name ?? ""}`;
}

function fmtBytes(n?: number): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const PREVIEW_LIMIT = 40_000;

function EntryRow({ entry, basePath, onOpen }: { entry: Astraura158FsEntry; basePath: string; onOpen: (e: Astraura158FsEntry) => void }) {
  const dir = isDirEntry(entry);
  return (
    <button
      type="button"
      className={cn(SUB, "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors hover:border-cyan-400/40")}
      onClick={() => onOpen(entry)}
      aria-label={`${dir ? "Entrar en" : "Ver"} ${entry.name ?? entryPath(basePath, entry)}`}
    >
      {dir ? <Folder className="h-3.5 w-3.5 shrink-0 text-amber-300/80" aria-hidden="true" /> : <File className="h-3.5 w-3.5 shrink-0 text-white/45" aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate text-[11px] text-white/85">{entry.name ?? entryPath(basePath, entry)}</span>
      {!dir && <span className={MONO}>{fmtBytes(entry.size_bytes)}</span>}
      {entry.modified_at != null && <span className={cn(MONO, "hidden sm:inline")}>{fmtTs(entry.modified_at)}</span>}
    </button>
  );
}

export function DispositivoTab({ target }: S158TabProps) {
  const [path, setPath] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ path: string; details: Record<string, unknown> | null; content: string; isBinary: boolean; truncated: boolean; loading: boolean; error: string } | null>(null);
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<Astraura158FsSearch | null>(null);
  const { busy, wrap } = useBusy();

  const fsLoader = useCallback((t: Astraura158Target) => fetchAstraura158Fs(t, path), [path]);
  const fs = useS158Load(fsLoader, target);
  const drives = useS158Load(fetchAstraura158Drives, target, 30_000);
  const uda = useS158Load(fetchAstraura158UniversalDeviceAccess, target);

  const displayPath = fs.data?.path ?? path;
  const crumbs = useMemo(() => splitPath(displayPath), [displayPath]);
  const entries = fs.data?.entries ?? fs.data?.items ?? [];
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const da = isDirEntry(a) ? 0 : 1;
      const db = isDirEntry(b) ? 0 : 1;
      if (da !== db) return da - db;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
  }, [entries]);

  const openPreview = useCallback((p: string) => {
    setSelected(p);
    setPreview({ path: p, details: null, content: "", isBinary: false, truncated: false, loading: true, error: "" });
    void (async () => {
      const [d, f] = await Promise.all([fetchAstraura158ItemDetails(target, p), fetchAstraura158File(target, p, PREVIEW_LIMIT)]);
      const content = f.ok ? String(f.data.content ?? f.data.text ?? "") : "";
      const overCap = content.length > PREVIEW_LIMIT;
      setPreview({
        path: p,
        details: d.ok ? (d.data as unknown as Record<string, unknown>) : null,
        content: overCap ? content.slice(0, PREVIEW_LIMIT) : content,
        isBinary: f.ok ? f.data.is_binary === true : false,
        truncated: overCap || (f.ok ? f.data.truncated === true : false),
        loading: false,
        error: !d.ok && !f.ok ? (f.error || d.error) : "",
      });
    })();
  }, [target]);

  const openEntry = useCallback((e: Astraura158FsEntry) => {
    const p = entryPath(displayPath, e);
    if (isDirEntry(e)) { setPath(p); setSelected(null); setPreview(null); } else { openPreview(p); }
  }, [displayPath, openPreview]);

  const goUp = useCallback(() => {
    const parent = fs.data?.parent;
    if (typeof parent === "string" && parent) { setPath(parent); setSelected(null); setPreview(null); return; }
    const segs = splitPath(displayPath);
    segs.pop();
    setPath(segs.length ? `/${segs.join("/")}` : "");
    setSelected(null);
    setPreview(null);
  }, [fs.data?.parent, displayPath]);

  const goRoot = useCallback(() => { setPath(""); setSelected(null); setPreview(null); }, []);

  const doSearch = () => {
    const q = query.trim();
    if (!q) return;
    const cap = withCapture<Astraura158FsSearch>(() => searchAstraura158Fs(target, q, path || undefined));
    void wrap("search", () => runS158("Búsqueda completada", cap.call, {
      description: (d) => `${(d.results ?? d.matches ?? []).length} resultado(s)`,
      after: () => setSearchResult(cap.get() ?? null),
    }));
  };

  const doGrant = () => {
    void wrap("grant", () => runS158("Acceso universal concedido", () => grantAstraura158UniversalDeviceAccess(target), { after: () => uda.reload(true) }));
  };

  const granted = uda.data?.granted === true || uda.data?.enabled === true;
  const searchList = searchResult?.results ?? searchResult?.matches ?? [];
  const driveList = drives.data?.drives ?? [];

  // Campos del detalle del archivo previsualizado, leídos de forma tolerante
  // (forma no verificada contra el backend) y ya narrowed a tipos concretos
  // para que el JSX no repita la comprobación de nulidad.
  const previewDetails = preview?.details ?? null;
  const previewSize = previewDetails && typeof previewDetails.size_bytes === "number" ? previewDetails.size_bytes : undefined;
  const previewModified = previewDetails && (typeof previewDetails.modified_at === "number" || typeof previewDetails.modified_at === "string") ? previewDetails.modified_at : undefined;
  const previewMime = previewDetails && typeof previewDetails.mime_type === "string" ? previewDetails.mime_type : undefined;

  return (
    <div className="space-y-3">
      {/* Aviso honesto */}
      <div className={cn(CARD, "border-amber-400/30 bg-amber-500/[0.06] p-3")}>
        <p className="flex items-start gap-2 text-[11px] leading-snug text-amber-100">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Este explorador lee la MÁQUINA donde corre el backend soberano (la neurona) — nunca el dispositivo donde tienes abierto este navegador, ni este servidor del OS. Solo lectura: sin escritura ni ejecución.
        </p>
      </div>

      {/* Acceso universal */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={ShieldCheck}
          title="Acceso universal al dispositivo"
          tone={granted ? "text-emerald-300" : "text-amber-300"}
          hint="Concesión EXPLÍCITA: si la activas, el backend soberano puede leer más rutas de su propia máquina. No afecta a este navegador ni a este servidor del OS — solo a la neurona."
        />
        {!uda.data && <Empty loading={uda.loading} error={uda.error} text="Sin estado de acceso universal." />}
        {uda.data && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={granted ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : "border-white/15 bg-white/[0.04] text-white/60"}>
              {granted ? <Unlock className="h-3 w-3" aria-hidden="true" /> : <Lock className="h-3 w-3" aria-hidden="true" />} {granted ? "concedido" : "no concedido"}
            </Badge>
            {uda.data.scope && <span className={MONO}>alcance: {uda.data.scope}</span>}
            {!granted && (
              <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Conceder acceso universal al dispositivo" onClick={doGrant}>
                <BusyIcon busy={busy === "grant"} icon={Unlock} /> Conceder acceso universal
              </button>
            )}
          </div>
        )}
        {uda.data?.message && <p className="mt-2 text-[10px] text-white/55">{uda.data.message}</p>}
      </div>

      {/* Navegador de carpetas */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={HardDrive}
          title="Carpetas"
          tone="text-cyan-300"
          right={<button type="button" className={BTN} onClick={() => { void fs.reload(); }} aria-label="Recargar carpeta"><RefreshCw className={cn("h-3 w-3", fs.loading && "animate-spin")} aria-hidden="true" /></button>}
        />
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button type="button" className={cn(BTN, "px-1.5 py-0.5")} onClick={goRoot} aria-label="Ir a la raíz por defecto"><HardDrive className="h-3 w-3" aria-hidden="true" /></button>
          <button type="button" className={cn(BTN, "px-1.5 py-0.5")} onClick={goUp} disabled={crumbs.length === 0 && !fs.data?.parent} aria-label="Subir un nivel"><ArrowUp className="h-3 w-3" aria-hidden="true" /> Subir</button>
          <div className="flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-white/70">
            {crumbs.map((c, i) => (
              <span key={`${c}-${i}`} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-white/25" aria-hidden="true" />
                <button type="button" className="cursor-pointer truncate rounded px-1 hover:bg-white/10 hover:text-white" onClick={() => { setPath(`/${crumbs.slice(0, i + 1).join("/")}`); setSelected(null); setPreview(null); }}>{c}</button>
              </span>
            ))}
            {crumbs.length === 0 && <span className={MONO}>raíz por defecto del backend</span>}
          </div>
        </div>

        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <div className="space-y-1.5">
            {sortedEntries.length === 0 && <Empty loading={fs.loading} error={fs.error} text="Carpeta vacía o sin datos." />}
            {sortedEntries.slice(0, 60).map((e, i) => (
              <EntryRow key={e.path ?? `${e.name}-${i}`} entry={e} basePath={displayPath} onOpen={openEntry} />
            ))}
            {sortedEntries.length > 60 && <p className={MONO}>… y {sortedEntries.length - 60} más (usa la búsqueda de abajo).</p>}
          </div>

          <div className={cn(SUB, "min-h-32 p-3")}>
            {!selected && <p className="text-[11px] text-white/50">Selecciona un archivo para ver su vista previa.</p>}
            {selected && preview && (
              <>
                <p className="truncate text-[11px] font-medium text-white/85" title={preview.path}>{preview.path}</p>
                {preview.loading && <Empty loading text="Leyendo del backend…" />}
                {!preview.loading && preview.error && <Empty error={preview.error} text="Sin vista previa." />}
                {!preview.loading && !preview.error && (
                  <>
                    <p className={cn(MONO, "mt-1")}>
                      {fmtBytes(previewSize)}
                      {previewModified != null ? ` · ${fmtTs(previewModified)}` : ""}
                      {previewMime ? ` · ${previewMime}` : ""}
                    </p>
                    {preview.isBinary ? (
                      <p className="mt-2 text-[11px] text-white/55">Archivo binario: sin vista previa de texto.</p>
                    ) : (
                      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/40 p-2 font-code text-[10px] text-white/80">{preview.content || "(vacío)"}</pre>
                    )}
                    {preview.truncated && <p className="mt-1 text-[10px] text-amber-200/80">Vista previa recortada a ~40 KB.</p>}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Búsqueda */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={FileSearch} title="Buscar en el dispositivo" tone="text-violet-300" hint={`GET /api/system/search — busca a partir de ${path || "la raíz por defecto"}.`} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className={cn(INPUT, "min-w-64 flex-1")} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre o texto a buscar…" aria-label="Búsqueda en el dispositivo"
            onKeyDown={(ev) => { if (ev.key === "Enter") doSearch(); }} />
          <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || !query.trim()} aria-label="Buscar" onClick={doSearch}>
            <BusyIcon busy={busy === "search"} icon={Search} /> Buscar
          </button>
        </div>
        <div className="mt-2 space-y-1.5">
          {searchResult && searchList.length === 0 && <p className="text-[11px] text-white/50">Sin resultados.</p>}
          {searchList.slice(0, 30).map((e, i) => (
            <EntryRow
              key={e.path ?? `${e.name}-${i}`}
              entry={e}
              basePath={path}
              onOpen={(entry) => {
                const p = entryPath(path, entry);
                if (isDirEntry(entry)) { setPath(p); setSelected(null); setPreview(null); } else { openPreview(p); }
              }}
            />
          ))}
        </div>
      </div>

      {/* Unidades */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={HardDrive}
          title={`Unidades detectadas (${driveList.length})`}
          tone="text-emerald-300"
          right={<button type="button" className={BTN} onClick={() => { void drives.reload(); }} aria-label="Recargar unidades"><RefreshCw className={cn("h-3 w-3", drives.loading && "animate-spin")} aria-hidden="true" /></button>}
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {driveList.length === 0 && <Empty loading={drives.loading} error={drives.error} text="Sin unidades." />}
          {driveList.map((d, i) => (
            <div key={d.mountpoint ?? d.device ?? i} className={cn(SUB, "px-3 py-2")}>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[11px] text-white/85" title={d.device}>{d.name ?? d.mountpoint ?? d.device}</p>
                {d.is_removable && <Usb className="h-3 w-3 shrink-0 text-amber-300/80" aria-hidden="true" />}
                <span className={MONO}>{d.fstype ?? ""}</span>
              </div>
              <Bar value={d.percent_used} tone="bg-emerald-400/60" className="mt-1" />
              <p className={MONO}>{(d.free_gb ?? 0).toFixed(0)} GB libres de {(d.total_gb ?? 0).toFixed(0)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DispositivoTab;
