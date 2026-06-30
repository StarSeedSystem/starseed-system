"use client";

import { OssLibraryBrowser } from "@/components/settings/ai/oss-library-browser";

/**
 * ServersPanel — Registro de servidores de cerebros + enlaces MUCHOS-A-MUCHOS.
 *
 * Un servidor es el "ordenador online del cerebro": donde viven/ejecutan/
 * sincronizan sus datos y conexiones. Open-source PRIMERO: cerebro local,
 * Hostinger (VPS/nube con el servidor abierto desplegado), servidor StarSeed,
 * servidor propio configurado, VPS (otro), servicio conectado integrado o
 * cualquier servidor online. Preferimos conectar DIRECTAMENTE a cada servicio,
 * lo más abierto posible (Ollama, llama.cpp, ComfyUI, vLLM, el local_brain.py…).
 * Higgsfield es solo UNA opción de generación (propietaria), no la principal.
 *
 * Relación N:N: un servidor puede dar servicio a varios cerebros y un cerebro a
 * varios servidores (rol, prioridad, sincronización).
 *
 * Sigue EXACTAMENTE los patrones de brains-panel.tsx (UI, supabase, runtime,
 * toasts, iconos lucide, cn). SSR-guard por userId.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Server,
  Plus,
  Trash2,
  Save,
  X,
  RefreshCw,
  Network,
  Link2,
  BookOpen,
  Download,
  Terminal,
  Sparkles,
  ShieldCheck,
  Cpu,
  Plug,
  Brain as BrainIcon,
  RefreshCcw,
  FolderSync,
  Settings2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  SERVER_KINDS,
  serverKindById,
  GENERATION_SERVICES,
  listBrains,
  type Brain,
} from "@/lib/brains/brains";
import { pingServer as pingServerRuntime } from "@/lib/brains/runtime";
import {
  OSS_CONNECTORS,
  ossConnectorById,
  HOSTINGER,
  LINK_ROLES,
  SYNC_DIRECTIONS,
  linkRoleById,
  listServers,
  saveServer,
  deleteServer,
  setServerStatus,
  listLinks,
  linkServer,
  unlinkServer,
  brainsForServer,
  type RegistryServer,
  type ServerLink,
} from "@/lib/brains/servers";
import { runLinkSync, type RunLinkSyncResult, type SyncStep } from "@/lib/brains/sync";

type Draft = Partial<RegistryServer> & { _connector?: string };

function emptyDraft(): Draft {
  return {
    name: "",
    kind: "local",
    endpoint: "",
    keyRef: "",
    config: {},
    shared: false,
    status: "pendiente",
    _connector: "",
  };
}

export default function ServersPanel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [servers, setServers] = useState<RegistryServer[]>([]);
  const [brains, setBrains] = useState<Brain[]>([]);
  const [links, setLinks] = useState<ServerLink[]>([]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* ---------------------------- load ---------------------------- */

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createClient();
      const { data } = await sb.auth.getUser();
      const id = data?.user?.id ?? null;
      setUserId(id);
      if (!id) {
        setServers([]);
        setBrains([]);
        setLinks([]);
        return;
      }
      const [srv, br, lk] = await Promise.all([listServers(), listBrains(), listLinks()]);
      setServers(srv);
      setBrains(br);
      setLinks(lk);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------------------------- editor ---------------------------- */

  function startNew() {
    setDraft(emptyDraft());
  }

  function startEdit(s: RegistryServer) {
    setDraft({ ...s, _connector: "" });
  }

  function closeEditor() {
    setDraft(null);
  }

  function patchDraft(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  function patchConfig(patch: Record<string, unknown>) {
    setDraft((d) => (d ? { ...d, config: { ...(d.config || {}), ...patch } } : d));
  }

  /** Aplica un conector OSS: ajusta tipo, endpoint sugerido y guarda metadatos. */
  function applyConnector(connId: string) {
    const c = ossConnectorById(connId);
    if (!c) {
      patchDraft({ _connector: "" });
      return;
    }
    const host = "http://localhost";
    const endpoint = c.defaultPort ? `${host}:${c.defaultPort}` : "";
    setDraft((d) =>
      d
        ? {
            ...d,
            _connector: connId,
            kind: c.kind || d.kind,
            name: d.name || c.label,
            endpoint: endpoint || d.endpoint,
            config: { ...(d.config || {}), connector: c.id, contract: c.contract, oss: true },
          }
        : d,
    );
  }

  async function onSave() {
    if (!draft) return;
    if (!draft.name?.trim()) {
      toast.error("Pon un nombre al servidor.");
      return;
    }
    const saved = await saveServer({
      id: draft.id,
      name: draft.name.trim(),
      kind: draft.kind || "online",
      endpoint: draft.endpoint || undefined,
      keyRef: draft.keyRef || undefined,
      config: draft.config || {},
      shared: !!draft.shared,
      status: draft.status || "pendiente",
    });
    if (saved) {
      toast.success("Servidor guardado en el registro.");
      setDraft(null);
      await load();
    } else {
      toast.error("No se pudo guardar.");
    }
  }

  async function onDelete(s: RegistryServer) {
    if (typeof window !== "undefined" && !window.confirm(`¿Eliminar el servidor «${s.name}» y sus enlaces?`)) return;
    const ok = await deleteServer(s.id);
    if (ok) {
      toast.message("Servidor eliminado.");
      if (selectedId === s.id) setSelectedId(null);
      await load();
    } else {
      toast.error("No se pudo eliminar.");
    }
  }

  /** Convierte una fila del registro en el BrainServer que espera el runtime. */
  function toRuntimeServer(s: RegistryServer) {
    return {
      id: s.id,
      kind: s.kind,
      name: s.name,
      endpoint: s.endpoint,
      keyRef: s.keyRef,
      status: s.status,
    };
  }

  async function onPing(s: RegistryServer) {
    setServers((cur) => cur.map((x) => (x.id === s.id ? { ...x, status: "probando" } : x)));
    const r = await pingServerRuntime(toRuntimeServer(s), userId);
    const status = r.ok ? "conectado" : "error";
    toast[r.ok ? "success" : "message"](r.detail || (r.ok ? "Servidor disponible." : "El servidor no respondió."));
    await setServerStatus(s.id, status);
    setServers((cur) => cur.map((x) => (x.id === s.id ? { ...x, status } : x)));
  }

  /* ---------------------------- enlaces N:N ---------------------------- */

  const selected = useMemo(() => servers.find((s) => s.id === selectedId) || null, [servers, selectedId]);
  const [srvLinks, setSrvLinks] = useState<ServerLink[]>([]);
  // Sincronización por enlace: estado de ejecución, resultado y editor de config.
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [syncResults, setSyncResults] = useState<Record<string, RunLinkSyncResult>>({});
  const [cfgOpen, setCfgOpen] = useState<Record<string, boolean>>({});
  const [cfgDir, setCfgDir] = useState<Record<string, string>>({});
  const [cfgFolder, setCfgFolder] = useState<Record<string, string>>({});
  const [pickBrain, setPickBrain] = useState("");
  const [pickRole, setPickRole] = useState("primary");
  const [pickPriority, setPickPriority] = useState(0);
  const [pickSync, setPickSync] = useState("both");

  const loadSrvLinks = useCallback(async (serverId: string) => {
    const l = await brainsForServer(serverId);
    setSrvLinks(l);
  }, []);

  useEffect(() => {
    if (selectedId) void loadSrvLinks(selectedId);
    else setSrvLinks([]);
  }, [selectedId, loadSrvLinks]);

  function brainName(id: string) {
    return brains.find((b) => b.id === id)?.name ?? id.slice(0, 8);
  }

  const availableBrains = useMemo(() => {
    const used = new Set(srvLinks.map((l) => l.brain_id));
    return brains.filter((b) => !used.has(b.id));
  }, [brains, srvLinks]);

  async function attachBrain() {
    if (!selectedId) return;
    if (!pickBrain) {
      toast.error("Elige un cerebro.");
      return;
    }
    const ok = await linkServer(selectedId, pickBrain, {
      role: pickRole,
      priority: pickPriority,
      sync: { direction: pickSync, auto: pickSync !== "none" },
    });
    if (ok) {
      toast.success("Cerebro enlazado a este servidor.");
      setPickBrain("");
      setPickRole("primary");
      setPickPriority(0);
      setPickSync("both");
      await loadSrvLinks(selectedId);
      await load();
    } else {
      toast.error("No se pudo enlazar.");
    }
  }

  /** Clave única por enlace (servidor seleccionado + cerebro). */
  function linkKey(brainId: string): string {
    return `${selectedId ?? ""}::${brainId}`;
  }

  /** Ejecuta la sincronización REAL de un enlace (Syncthing + push de bundle). */
  async function runSync(link: ServerLink, server: RegistryServer) {
    const key = linkKey(link.brain_id);
    setSyncing((m) => ({ ...m, [key]: true }));
    setSyncResults((m) => {
      const next = { ...m };
      delete next[key];
      return next;
    });
    try {
      const res = await runLinkSync(link, server, { accountId: userId });
      setSyncResults((m) => ({ ...m, [key]: res }));
      if (res.ok) toast.success(res.detail);
      else toast.message(res.detail);
    } catch {
      toast.error("No se pudo sincronizar este enlace.");
    } finally {
      setSyncing((m) => ({ ...m, [key]: false }));
    }
  }

  /** Abre/cierra el editor de config de sync de un enlace (precarga valores). */
  function toggleSyncConfig(link: ServerLink) {
    const key = linkKey(link.brain_id);
    setCfgOpen((m) => {
      const open = !m[key];
      if (open) {
        const sync = (link.sync || {}) as Record<string, unknown>;
        setCfgDir((d) => ({ ...d, [key]: String(sync.direction ?? "both") }));
        setCfgFolder((f) => ({ ...f, [key]: String(sync.syncthingFolderId ?? "") }));
      }
      return { ...m, [key]: open };
    });
  }

  /** Guarda la config de sync (dirección + carpeta Syncthing) en el enlace. */
  async function saveLinkSyncConfig(link: ServerLink) {
    if (!selectedId) return;
    const key = linkKey(link.brain_id);
    const direction = cfgDir[key] ?? String((link.sync as Record<string, unknown>)?.direction ?? "both");
    const folder = (cfgFolder[key] ?? "").trim();
    const nextSync: Record<string, unknown> = {
      ...((link.sync || {}) as Record<string, unknown>),
      direction,
      auto: direction !== "none",
    };
    if (folder) nextSync.syncthingFolderId = folder;
    else delete nextSync.syncthingFolderId;
    const ok = await linkServer(link.brain_id, selectedId, {
      role: link.role,
      priority: link.priority,
      sync: nextSync,
    });
    if (ok) {
      toast.success("Configuración de sincronización guardada.");
      setCfgOpen((m) => ({ ...m, [key]: false }));
      await loadSrvLinks(selectedId);
      await load();
    } else {
      toast.error("No se pudo guardar la configuración.");
    }
  }

  async function detachBrain(brainId: string) {
    if (!selectedId) return;
    const ok = await unlinkServer(brainId, selectedId);
    if (ok) {
      toast.message("Enlace eliminado.");
      await loadSrvLinks(selectedId);
      await load();
    } else {
      toast.error("No se pudo desenlazar.");
    }
  }

  /** Cuántos cerebros usan cada servidor (para "da servicio a N cerebros"). */
  const linkCountByServer = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of links) m.set(l.server_id, (m.get(l.server_id) || 0) + 1);
    return m;
  }, [links]);

  /* ---------------------------- render ---------------------------- */

  if (!userId && !loading) {
    return (
      <div className="m-1 rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        Inicia sesión para administrar el registro de servidores de cerebros.
      </div>
    );
  }

  const kindDef = serverKindById(String(draft?.kind || "online"));

  return (
    <div className="space-y-6 p-1">
      {/* Header / concepto */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-500">
            <Network className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-indigo-50">Servidores de cerebros · registro N:N</span>
            <span className="max-w-2xl text-[11px] text-indigo-300/70">
              El "ordenador online del cerebro" para TODOS sus datos y conexiones. Open-source primero: cerebro local,
              Hostinger, servidor StarSeed, propio configurado o cualquier servicio conectado. Un servidor da servicio a
              varios cerebros y un cerebro usa varios servidores.
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="gap-2 border-indigo-500/30 text-indigo-100" onClick={load} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Actualizar
            </Button>
            <Link href="/agent" className="inline-flex items-center gap-2 rounded-md border border-indigo-500/30 px-3 py-1.5 text-sm text-indigo-100 hover:bg-indigo-500/10">
              <BrainIcon className="h-4 w-4" /> Cerebros
            </Link>
            <Button size="sm" className="gap-2 bg-indigo-600 text-white hover:bg-indigo-500" onClick={startNew}>
              <Plus className="h-4 w-4" /> Nuevo servidor
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="gap-1 border-emerald-400/30 text-[10px] text-emerald-200">
            <ShieldCheck className="h-3 w-3" /> Open-source primero
          </Badge>
          {SERVER_KINDS.map((k) => (
            <Badge
              key={k.id}
              variant="outline"
              className={cn("text-[10px]", k.oss ? "border-emerald-400/25 text-emerald-200/80" : "border-white/15 text-white/55")}
              title={k.blurb}
            >
              {k.icon} {k.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Editor de servidor */}
      {draft && (
        <div className="rounded-xl border border-indigo-500/30 bg-black/30 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Server className="h-4 w-4 text-indigo-300" />
            <span className="text-sm font-semibold text-indigo-50">
              {draft.id ? "Editar servidor" : "Nuevo servidor del registro"}
            </span>
            <button onClick={closeEditor} className="ml-auto text-white/40 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Conector OSS (preset) */}
          <label className="mb-3 flex flex-col gap-1">
            <span className="text-xs text-white/50">Conector open-source (preset)</span>
            <select
              value={draft._connector || ""}
              onChange={(e) => applyConnector(e.target.value)}
              className="h-9 rounded-md border border-emerald-500/25 bg-black/40 px-2 text-sm text-white"
            >
              <option value="">— sin preset (configuración manual) —</option>
              {OSS_CONNECTORS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} {c.defaultPort ? `(:${c.defaultPort})` : ""}
                </option>
              ))}
            </select>
            {draft._connector && ossConnectorById(draft._connector) && (
              <span className="text-[10px] text-emerald-200/70">
                {ossConnectorById(draft._connector)!.blurb} · Contrato: {ossConnectorById(draft._connector)!.contract}
              </span>
            )}
          </label>

          {/* Tipo de servidor */}
          <span className="text-xs text-white/50">Tipo de servidor</span>
          <div className="mt-1 mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {SERVER_KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => patchDraft({ kind: k.id })}
                title={k.blurb}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-left text-[11px]",
                  draft.kind === k.id ? "border-indigo-400/60 bg-indigo-500/15 text-indigo-50" : "border-white/10 text-white/55 hover:text-white/90",
                )}
              >
                <span className="mr-1">{k.icon}</span>
                {k.label}
                {k.oss && <span className="ml-1 text-[8px] text-emerald-300">OSS</span>}
              </button>
            ))}
          </div>
          {kindDef && <p className="mb-2 text-[10px] text-white/45">{kindDef.blurb}</p>}

          {String(draft.kind) === "local" ? (
            <p className="mb-2 text-[10px] text-white/35">
              Servidor local: se contacta directo desde el navegador (debe enviar CORS permisivo).
            </p>
          ) : (
            <p className="mb-2 text-[10px] text-white/35">
              Servidor remoto: se contacta a través del proxy del bot usando la clave de tu bóveda (key_ref).
            </p>
          )}

          {/* Nombre */}
          <label className="mb-2 flex flex-col gap-1">
            <span className="text-xs text-white/50">Nombre</span>
            <Input
              value={draft.name || ""}
              onChange={(e) => patchDraft({ name: e.target.value })}
              placeholder="Nombre del servidor"
              className="h-9 border-white/15 bg-black/30 text-white placeholder:text-white/30"
            />
          </label>

          {/* Campos por tipo */}
          {(kindDef?.fields ?? []).map((f) => {
            const val = f.key === "endpoint" ? draft.endpoint : f.key === "keyRef" ? draft.keyRef : (draft.config?.[f.key] as string) ?? "";
            return (
              <label key={f.key} className="mb-2 flex flex-col gap-1">
                <span className="text-xs text-white/50">{f.label}</span>
                <Input
                  value={(val as string) || ""}
                  onChange={(e) => {
                    if (f.key === "endpoint") patchDraft({ endpoint: e.target.value });
                    else if (f.key === "keyRef") patchDraft({ keyRef: e.target.value });
                    else patchConfig({ [f.key]: e.target.value });
                  }}
                  placeholder={f.label}
                  className="h-9 border-white/15 bg-black/30 text-white placeholder:text-white/30"
                />
              </label>
            );
          })}

          {/* Notas */}
          <label className="mb-3 flex flex-col gap-1">
            <span className="text-xs text-white/50">Notas (opcional)</span>
            <Textarea
              value={(draft.config?.notes as string) || ""}
              onChange={(e) => patchConfig({ notes: e.target.value })}
              placeholder="Detalles, puerto, conector, recordatorios…"
              className="min-h-[60px] border-white/15 bg-black/30 text-white placeholder:text-white/30"
            />
          </label>

          {/* Compartido */}
          <div className="mb-3 flex items-center gap-2">
            <Switch checked={!!draft.shared} onCheckedChange={(v) => patchDraft({ shared: v })} />
            <span className="text-xs text-white/60">Compartido (otros pueden ver este servidor)</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-500" onClick={onSave}>
              <Save className="h-3.5 w-3.5" /> Guardar
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-white/60" onClick={closeEditor}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Lista del registro */}
      <div className="space-y-2">
        <span className="text-[11px] uppercase tracking-widest text-indigo-300/60">
          Registro de servidores ({servers.length})
        </span>
        {servers.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
            Aún no hay servidores en el registro. Crea uno (cerebro local, Hostinger, StarSeed, propio o un servicio
            conectado) y enlázalo a tus cerebros.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {servers.map((s) => {
              const n = linkCountByServer.get(s.id) || 0;
              const def = serverKindById(String(s.kind));
              return (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-xl border bg-white/5 p-3",
                    selectedId === s.id ? "border-indigo-400/50" : "border-white/10",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500/30 to-cyan-500/30">
                      <Server className="h-4 w-4 text-indigo-200" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">{s.name}</span>
                        <Badge variant="outline" className="border-white/15 text-[9px] text-white/55">
                          {def?.icon} {def?.label ?? s.kind}
                        </Badge>
                        {def?.oss && (
                          <Badge variant="outline" className="border-emerald-400/30 text-[9px] text-emerald-200">
                            OSS
                          </Badge>
                        )}
                        {s.shared && (
                          <Badge variant="outline" className="border-cyan-400/30 text-[9px] text-cyan-200">
                            compartido
                          </Badge>
                        )}
                        <ServerStatusChip status={s.status} />
                      </div>
                      {s.endpoint && <p className="mt-0.5 truncate text-[11px] text-white/40">{s.endpoint}</p>}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="gap-1 border-indigo-400/30 text-[10px] text-indigo-200">
                      <Network className="h-3 w-3" /> da servicio a {n} cerebro{n === 1 ? "" : "s"}
                    </Badge>
                    {s.keyRef && (
                      <Badge variant="outline" className="gap-1 border-amber-400/30 text-[10px] text-amber-200">
                        <ShieldCheck className="h-3 w-3" /> clave: {s.keyRef}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn("h-7 gap-1.5 border-white/15 text-white/80", selectedId === s.id && "border-indigo-400/50 text-indigo-100")}
                      onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
                    >
                      <Link2 className="h-3.5 w-3.5" /> {selectedId === s.id ? "Ocultar enlaces" : "Enlaces"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-white/60" onClick={() => onPing(s)}>
                      <Plug className="h-3.5 w-3.5" /> Probar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-white/60" onClick={() => startEdit(s)}>
                      <Cpu className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <button onClick={() => onDelete(s)} className="ml-auto text-white/30 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Enlaces N:N de ESTE servidor */}
                  {selectedId === s.id && (
                    <div className="mt-3 rounded-lg border border-indigo-500/20 bg-indigo-950/15 p-2">
                      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-indigo-100">
                        <Network className="h-3.5 w-3.5 text-indigo-300" />
                        Cerebros enlazados
                        <Badge variant="outline" className="border-indigo-400/40 text-[9px] text-indigo-200">
                          {srvLinks.length}
                        </Badge>
                        <span className="ml-auto text-[10px] text-indigo-200/60">
                          Este servidor da servicio a {srvLinks.length} cerebro{srvLinks.length === 1 ? "" : "s"}.
                        </span>
                      </div>

                      {srvLinks.length === 0 ? (
                        <p className="text-[10px] text-white/40">Aún no hay cerebros enlazados a este servidor.</p>
                      ) : (
                        <div className="space-y-1">
                          {srvLinks.map((l) => {
                            const lk = `${selectedId ?? ""}::${l.brain_id}`;
                            const busy = !!syncing[lk];
                            const result = syncResults[lk];
                            const open = !!cfgOpen[lk];
                            const folderId = String((l.sync as Record<string, unknown> | undefined)?.syncthingFolderId ?? "");
                            return (
                              <div
                                key={l.brain_id}
                                className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white/80"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <BrainIcon className="h-3.5 w-3.5 text-cyan-300" />
                                  <span className="truncate font-medium">{brainName(l.brain_id)}</span>
                                  <Badge variant="outline" className="border-indigo-400/30 text-[9px] text-indigo-200">
                                    {linkRoleById(String(l.role))?.label ?? l.role}
                                  </Badge>
                                  <span className="text-[9px] text-white/40">prio {l.priority}</span>
                                  <Badge variant="outline" className="border-white/15 text-[9px] text-white/50">
                                    {SYNC_DIRECTIONS.find((d) => d.id === l.sync?.direction)?.label ?? "Bidireccional"}
                                  </Badge>
                                  {folderId && (
                                    <Badge variant="outline" className="gap-1 border-cyan-400/30 text-[9px] text-cyan-200" title="Carpeta Syncthing">
                                      <FolderSync className="h-3 w-3" /> {folderId}
                                    </Badge>
                                  )}
                                  <button
                                    onClick={() => detachBrain(l.brain_id)}
                                    className="ml-auto text-white/30 hover:text-red-400"
                                    title="Desenlazar"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                {/* Acciones de sincronización del enlace */}
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <Button
                                    size="sm"
                                    className="h-6 gap-1.5 bg-cyan-600 px-2 text-[10px] text-white hover:bg-cyan-500"
                                    onClick={() => runSync(l, s)}
                                    disabled={busy}
                                    title="Dispara Syncthing y empuja el bundle del cerebro a este servidor"
                                  >
                                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                                    Sincronizar ahora
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className={cn("h-6 gap-1.5 border-white/15 px-2 text-[10px] text-white/70", open && "border-cyan-400/40 text-cyan-100")}
                                    onClick={() => toggleSyncConfig(l)}
                                    title="Configurar sincronización (dirección y carpeta Syncthing)"
                                  >
                                    <Settings2 className="h-3 w-3" /> Config. sync
                                  </Button>
                                  {result && (
                                    <span className={cn("inline-flex items-center gap-1 text-[10px]", result.ok ? "text-emerald-300" : "text-amber-300")}>
                                      {result.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                                      {result.detail}
                                    </span>
                                  )}
                                </div>

                                {/* Editor de config de sync del enlace */}
                                {open && (
                                  <div className="mt-1.5 grid grid-cols-1 gap-1.5 rounded-md border border-cyan-500/20 bg-cyan-950/15 p-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
                                    <label className="flex flex-col gap-0.5">
                                      <span className="text-[9px] text-white/40">Dirección</span>
                                      <select
                                        value={cfgDir[lk] ?? String((l.sync as Record<string, unknown>)?.direction ?? "both")}
                                        onChange={(e) => setCfgDir((m) => ({ ...m, [lk]: e.target.value }))}
                                        className="h-7 rounded-md border border-white/15 bg-black/40 px-1.5 text-[11px] text-white"
                                      >
                                        {SYNC_DIRECTIONS.map((d) => (
                                          <option key={d.id} value={d.id}>
                                            {d.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="flex flex-col gap-0.5">
                                      <span className="text-[9px] text-white/40">Carpeta Syncthing (id)</span>
                                      <Input
                                        value={cfgFolder[lk] ?? ""}
                                        onChange={(e) => setCfgFolder((m) => ({ ...m, [lk]: e.target.value }))}
                                        placeholder="p.ej. starseed-memorias"
                                        className="h-7 border-white/15 bg-black/40 px-1.5 text-[11px] text-white placeholder:text-white/25"
                                        spellCheck={false}
                                      />
                                    </label>
                                    <Button
                                      size="sm"
                                      className="h-7 gap-1.5 bg-indigo-600 px-2 text-[10px] text-white hover:bg-indigo-500"
                                      onClick={() => saveLinkSyncConfig(l)}
                                    >
                                      <Save className="h-3 w-3" /> Guardar
                                    </Button>
                                  </div>
                                )}

                                {/* Pasos del último intento de sincronización */}
                                {result && result.steps.length > 0 && (
                                  <ul className="mt-1.5 space-y-0.5 border-t border-white/10 pt-1.5">
                                    {result.steps.map((st: SyncStep, i: number) => (
                                      <li key={i} className={cn("flex items-start gap-1.5 text-[10px]", st.ok ? "text-white/70" : "text-amber-300")}>
                                        {st.ok ? (
                                          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                                        ) : (
                                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                        )}
                                        <span>{st.detail}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Linker */}
                      {availableBrains.length > 0 ? (
                        <div className="mt-2 grid grid-cols-1 gap-1.5 rounded-md border border-white/10 bg-black/20 p-2 sm:grid-cols-2">
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[9px] text-white/40">Cerebro</span>
                            <select
                              value={pickBrain}
                              onChange={(e) => setPickBrain(e.target.value)}
                              className="h-7 rounded-md border border-white/15 bg-black/40 px-1.5 text-[11px] text-white"
                            >
                              <option value="">— elige —</option>
                              {availableBrains.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[9px] text-white/40">Rol</span>
                            <select
                              value={pickRole}
                              onChange={(e) => setPickRole(e.target.value)}
                              className="h-7 rounded-md border border-white/15 bg-black/40 px-1.5 text-[11px] text-white"
                              title={linkRoleById(pickRole)?.blurb}
                            >
                              {LINK_ROLES.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[9px] text-white/40">Sincronización</span>
                            <select
                              value={pickSync}
                              onChange={(e) => setPickSync(e.target.value)}
                              className="h-7 rounded-md border border-white/15 bg-black/40 px-1.5 text-[11px] text-white"
                            >
                              {SYNC_DIRECTIONS.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="flex items-end gap-1.5">
                            <label className="flex w-16 flex-col gap-0.5">
                              <span className="text-[9px] text-white/40">Prioridad</span>
                              <Input
                                type="number"
                                value={pickPriority}
                                onChange={(e) => setPickPriority(Number(e.target.value) || 0)}
                                className="h-7 border-white/15 bg-black/40 px-1.5 text-[11px] text-white"
                              />
                            </label>
                            <Button size="sm" className="h-7 gap-1.5 bg-indigo-600 text-white hover:bg-indigo-500" onClick={attachBrain}>
                              <Link2 className="h-3.5 w-3.5" /> Enlazar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-[10px] text-white/35">
                          {brains.length === 0 ? (
                            <>
                              No tienes cerebros todavía.{" "}
                              <Link href="/agent" className="text-indigo-200 underline hover:text-indigo-100">
                                Crear un cerebro
                              </Link>
                              .
                            </>
                          ) : (
                            "Todos tus cerebros ya están enlazados a este servidor."
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tarjeta Hostinger */}
      <div className="rounded-xl border border-purple-500/25 bg-purple-950/15 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Terminal className="h-4 w-4 text-purple-300" />
          <span className="text-sm font-semibold text-purple-50">{HOSTINGER.label}</span>
          <span className="text-[11px] text-purple-300/70">{HOSTINGER.blurb}</span>
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] text-purple-100/80">
          {HOSTINGER.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-purple-200/70">
          Endpoint por defecto: <code className="rounded bg-black/40 px-1 text-purple-100">{HOSTINGER.defaultEndpoint}</code>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {HOSTINGER.files.map((f) => (
            <a
              key={f.href}
              href={f.href}
              {...(f.href.endsWith(".md") ? { target: "_blank", rel: "noreferrer" } : { download: true })}
              className="inline-flex items-center gap-1.5 rounded-md border border-purple-500/30 px-3 py-1.5 text-xs text-purple-100 hover:bg-purple-500/10"
            >
              {f.href.endsWith(".md") ? <BookOpen className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />} {f.label}
            </a>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-purple-500/30 text-purple-100"
            onClick={() => {
              setDraft({
                ...emptyDraft(),
                kind: "hostinger",
                name: "Hostinger VPS",
                endpoint: HOSTINGER.defaultEndpoint,
                config: { connector: "starseed_brain", oss: true },
                _connector: "starseed_brain",
              });
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Registrar servidor Hostinger
          </Button>
        </div>
      </div>

      {/* Servidor local (convierte este equipo en cerebro) */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Terminal className="h-4 w-4 text-emerald-300" />
          <span className="text-sm font-semibold text-emerald-50">Cerebro local (este equipo)</span>
          <span className="text-[11px] text-emerald-300/70">
            Servidor de referencia open-source, sin dependencias (Python 3).
          </span>
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] text-emerald-100/80">
          <li>
            Descarga{" "}
            <a href="/brain/local_brain.py" download className="text-emerald-200 underline hover:text-emerald-100">
              local_brain.py
            </a>{" "}
            y ejecútalo: <code className="rounded bg-black/40 px-1 text-emerald-100">python3 local_brain.py</code>.
          </li>
          <li>
            Escuchará en <code className="rounded bg-black/40 px-1 text-emerald-100">http://127.0.0.1:8800</code>.
          </li>
          <li>Registra un servidor de tipo «Cerebro local» con esa URL y pulsa «Probar».</li>
        </ol>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href="/brain/local_brain.py"
            download
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/10"
          >
            <Download className="h-3.5 w-3.5" /> Descargar local_brain.py
          </a>
          <a
            href="/brain/install.sh"
            download
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/10"
          >
            <Download className="h-3.5 w-3.5" /> install.sh
          </a>
          <a
            href="/brain/README.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/10"
          >
            <BookOpen className="h-3.5 w-3.5" /> Guía y contrato
          </a>
        </div>
      </div>

      {/* Servicios de generación (OSS primero; Higgsfield una más) */}
      <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-300" />
          <span className="text-sm font-semibold text-fuchsia-50">Servicios de generación</span>
          <span className="text-[11px] text-fuchsia-300/70">
            Conecta DIRECTAMENTE a cada servicio, lo más open-source posible. Higgsfield es solo una opción.
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {GENERATION_SERVICES.map((g) => (
            <div
              key={g.id}
              className={cn(
                "rounded-lg border p-2",
                g.oss ? "border-emerald-400/25 bg-emerald-950/10" : "border-fuchsia-400/25 bg-fuchsia-950/10",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{g.label}</span>
                {g.oss ? (
                  <Badge variant="outline" className="border-emerald-400/30 text-[9px] text-emerald-200">
                    open-source
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-fuchsia-400/30 text-[9px] text-fuchsia-200">
                    propietario
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-white/45">{g.blurb}</p>
              {g.defaultEndpoint && (
                <p className="mt-0.5 truncate text-[10px] text-white/35">{g.defaultEndpoint}</p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-fuchsia-200/50">
          Para generar, registra el servicio como un servidor de tipo «Servicio conectado integrado» (o «Cerebro local»
          para Ollama/ComfyUI locales) y enlázalo a tus cerebros.
        </p>
      </div>
      {/* Catálogo de código abierto: despliegue + almacenamiento + runtimes para cerebros */}
      <div className="mt-4 space-y-4">
        <OssLibraryBrowser category="devops" />
        <OssLibraryBrowser category="storage" />
        <OssLibraryBrowser category="runtime" />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Chip de estado (mismo criterio que brains-panel.tsx)              */
/* ---------------------------------------------------------------- */

function ServerStatusChip({ status }: { status?: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    conectado: { label: "Conectado", cls: "border-emerald-400/40 text-emerald-300" },
    ok: { label: "OK", cls: "border-emerald-400/40 text-emerald-300" },
    error: { label: "Error", cls: "border-red-400/40 text-red-300" },
    probando: { label: "Probando…", cls: "border-cyan-400/40 text-cyan-300" },
    pausado: { label: "Pausado", cls: "border-white/30 text-white/50" },
    pendiente: { label: "Pendiente", cls: "border-amber-400/40 text-amber-300" },
  };
  const s = map[status ?? "pendiente"] ?? map.pendiente;
  return (
    <Badge variant="outline" className={cn("text-[9px]", s.cls)}>
      {s.label}
    </Badge>
  );
}
