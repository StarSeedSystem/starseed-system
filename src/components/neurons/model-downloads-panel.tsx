"use client";

/**
 * ModelDownloadsPanel — DESCARGAS LOCALES + MODELOS PROPIOS (Adenda 113).
 * ============================================================================
 * Descarga de modelos locales EN SEGUNDO PLANO (el OS se sigue usando; se avisa
 * al terminar) con su tamaño, requisitos y progreso; y alta de MODELOS PROPIOS
 * con cualquier acceso (local · API con clave · MCP), para LLM o voz. SSR-safe.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download, Check, Loader2, Trash2, Plus, X, Server, Globe, Cpu, Puzzle, Brain, Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DOWNLOADABLE, downloadLabel, startDownload, uninstall, taskFor, subscribeDownloadTasks,
} from "@/ai/astraura/model-downloads";
import { DOWNLOAD_SIZES, isModelInstalled } from "@/ai/astraura/installed-models";
import { LOCAL_LLM_SPECS, describeReq } from "@/ai/astraura/model-requirements";
import {
  addCustomModel, removeCustomModel, listCustomModels, subscribeCustomModels, probeCustomModel,
  type CustomModel, type CustomModelAccess, type CustomModelKind,
} from "@/ai/astraura/custom-models";
import { Gauge, CheckCircle2, XCircle } from "lucide-react";

function useTick(subscribe: (cb: () => void) => () => void): number {
  const [n, setN] = useState(0);
  useEffect(() => subscribe(() => setN((v) => v + 1)), [subscribe]);
  return n;
}

function DownloadRow({ sourceId }: { sourceId: string }) {
  useTick(subscribeDownloadTasks);
  const installed = isModelInstalled(sourceId);
  const task = taskFor(sourceId);
  const spec = LOCAL_LLM_SPECS.find((s) => s.id === sourceId);
  const [busy, setBusy] = useState(false);
  const go = useCallback(async () => { setBusy(true); await startDownload(sourceId); setBusy(false); }, [sourceId]);
  const downloading = task?.state === "downloading";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-white/90">{downloadLabel(sourceId)}</span>
        {DOWNLOAD_SIZES[sourceId] && <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/50">{DOWNLOAD_SIZES[sourceId]}</span>}
        {installed ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-300"><Check className="h-3 w-3" /> instalado</span>
        ) : (
          <span className="ml-auto" />
        )}
      </div>
      {spec && <p className="mt-0.5 text-[10px] text-white/45">{describeReq(spec)}</p>}
      {downloading && (
        <div className="mt-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-400/70 transition-all" style={{ width: `${task?.pct ?? 0}%` }} />
          </div>
          <p className="mt-0.5 text-[9px] text-white/45">Descargando en segundo plano… {task?.pct ?? 0}% · puedes seguir usando el OS.</p>
        </div>
      )}
      {task?.state === "error" && <p className="mt-1 text-[10px] text-rose-300/80">Error: {task.error?.slice(0, 100)}</p>}
      <div className="mt-1.5 flex items-center gap-1.5">
        {!installed && !downloading && (
          <button type="button" onClick={go} disabled={busy}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:opacity-50">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Descargar en 2º plano
          </button>
        )}
        {installed && (
          <button type="button" onClick={() => uninstall(sourceId)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-white/60 transition-colors hover:border-rose-400/40 hover:text-rose-200">
            <Trash2 className="h-3 w-3" /> Desinstalar
          </button>
        )}
      </div>
    </div>
  );
}

const ACCESS_OPTS: { value: CustomModelAccess; label: string; icon: React.ReactNode }[] = [
  { value: "local", label: "Local", icon: <Cpu className="h-3 w-3" /> },
  { value: "api", label: "API + clave", icon: <Globe className="h-3 w-3" /> },
  { value: "mcp", label: "MCP", icon: <Puzzle className="h-3 w-3" /> },
];

function CustomModelForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CustomModelKind>("llm");
  const [access, setAccess] = useState<CustomModelAccess>("local");
  const [endpoint, setEndpoint] = useState("");
  const [apiKeyRef, setApiKeyRef] = useState("");
  const [mcpServer, setMcpServer] = useState("");
  const [model, setModel] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    addCustomModel({ name, kind, access, endpoint, apiKeyRef, mcpServer, model });
    setName(""); setEndpoint(""); setApiKeyRef(""); setMcpServer(""); setModel(""); setAccess("local"); setKind("llm"); setOpen(false);
    onAdded();
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-[11px] text-white/55 transition-colors hover:border-cyan-400/40 hover:text-cyan-200">
        <Plus className="h-3.5 w-3.5" /> Añadir modelo propio (local · API · MCP)
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-cyan-400/25 bg-cyan-500/[0.05] p-2.5">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del modelo" className="h-8 text-[12px]" />
      <div className="flex flex-wrap gap-1.5">
        {(["llm", "voice"] as CustomModelKind[]).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={cn("cursor-pointer rounded-lg border px-2 py-1 text-[11px] transition-colors", kind === k ? "border-violet-400/40 bg-violet-500/15 text-violet-100" : "border-white/10 bg-white/[0.03] text-white/60")}>
            {k === "llm" ? <><Brain className="mr-1 inline h-3 w-3" />LLM</> : <><Mic className="mr-1 inline h-3 w-3" />Voz</>}
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-white/10" />
        {ACCESS_OPTS.map((a) => (
          <button key={a.value} type="button" onClick={() => setAccess(a.value)}
            className={cn("inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors", access === a.value ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/60")}>
            {a.icon} {a.label}
          </button>
        ))}
      </div>
      {access === "local" && <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="Endpoint local (p.ej. http://localhost:11434)" className="h-8 text-[12px]" />}
      {access === "api" && (
        <>
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="URL de la API" className="h-8 text-[12px]" />
          <Input value={apiKeyRef} onChange={(e) => setApiKeyRef(e.target.value)} placeholder="Referencia de la clave (nombre, no la clave)" className="h-8 text-[12px]" />
        </>
      )}
      {access === "mcp" && <Input value={mcpServer} onChange={(e) => setMcpServer(e.target.value)} placeholder="Servidor MCP (nombre o URL)" className="h-8 text-[12px]" />}
      <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Id/nombre del modelo (opcional)" className="h-8 text-[12px]" />
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setOpen(false)}><X className="mr-1 h-3 w-3" /> Cancelar</Button>
        <Button size="sm" className="h-7 px-2 text-[11px]" onClick={submit} disabled={!name.trim()}><Plus className="mr-1 h-3 w-3" /> Añadir</Button>
      </div>
    </div>
  );
}

export function ModelDownloadsPanel({ embedded = false }: { embedded?: boolean }) {
  const tick = useTick(subscribeCustomModels);
  const custom = useMemo(() => listCustomModels(), [tick]);

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-white/85"><Download className="h-4 w-4 text-cyan-300" /> Modelos locales descargables</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {(DOWNLOADABLE as readonly string[]).map((id) => <DownloadRow key={id} sourceId={id} />)}
        </div>
        <p className="mt-1 px-0.5 text-[10px] leading-snug text-white/35">
          La descarga corre en segundo plano: puedes seguir usando el resto del OS y te avisamos al terminar para completar
          la instalación y adaptarlo a las personalidades de esta neurona.
        </p>
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-white/85"><Server className="h-4 w-4 text-amber-300" /> Modelos propios (local · API · MCP)</p>
        <div className="space-y-1.5">
          {custom.map((m) => <CustomRow key={m.id} m={m} />)}
          <CustomModelForm onAdded={() => { /* re-render por evento */ }} />
        </div>
        <p className="mt-1 px-0.5 text-[10px] leading-snug text-white/35">
          Integra cualquier modelo propio por acceso local, por API con clave o por MCP, para LLM o voz. Los del servidor
          StarSeed los ofrece el servidor oficial y no hace falta registrarlos aquí.
        </p>
      </div>
    </div>
  );
}

function CustomRow({ m }: { m: CustomModel }) {
  const detail = m.access === "local" ? m.endpoint : m.access === "api" ? `${m.endpoint ?? ""}${m.apiKeyRef ? ` · clave ${m.apiKeyRef}` : ""}` : m.mcpServer;
  const accessLabel = m.access === "local" ? "Local" : m.access === "api" ? "API" : "MCP";
  const [probe, setProbe] = useState<{ state: "idle" | "run" | "ok" | "fail"; msg?: string }>({ state: "idle" });
  const test = async () => {
    setProbe({ state: "run" });
    const r = await probeCustomModel(m);
    setProbe({ state: r.ok ? "ok" : "fail", msg: r.msg });
  };
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        {m.kind === "voice" ? <Mic className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" /> : <Brain className="h-3.5 w-3.5 shrink-0 text-violet-300" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium text-white/85">{m.name} <span className="text-white/40">· {accessLabel}{m.model ? ` · ${m.model}` : ""}</span></span>
          {detail && <span className="block truncate text-[9px] text-white/40">{detail}</span>}
        </span>
        <button type="button" onClick={test} disabled={probe.state === "run"} title="Probar conexión"
          className="cursor-pointer rounded-md p-1 text-white/40 transition-colors hover:bg-cyan-500/15 hover:text-cyan-300 disabled:opacity-50">
          {probe.state === "run" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : probe.state === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : probe.state === "fail" ? <XCircle className="h-3.5 w-3.5 text-rose-300" /> : <Gauge className="h-3.5 w-3.5" />}
        </button>
        <button type="button" title="Quitar" onClick={() => removeCustomModel(m.id)}
          className="cursor-pointer rounded-md p-1 text-white/40 transition-colors hover:bg-rose-500/15 hover:text-rose-300">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {probe.msg && <p className={cn("mt-0.5 pl-6 text-[9px]", probe.state === "ok" ? "text-emerald-300/80" : "text-rose-300/80")}>{probe.msg}</p>}
    </div>
  );
}

export default ModelDownloadsPanel;
