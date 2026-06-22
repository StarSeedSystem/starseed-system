"use client";

/**
 * BrainsPanel — gestor de Cerebros. Un cerebro empaqueta TODO tu contexto
 * (memorias, baúles, conexiones, sistemas de IA con sus configs y adaptaciones
 * a Astraura y Aurora, permisos, accesos, ficheros, APIs, cuentas, fuentes y
 * servidores) y es seleccionable por contexto. Conéctalo a Higgsfield, a
 * cualquier servidor online, o a un servidor local que actúe como cerebro.
 *
 * Sigue los patrones de storage-panel.tsx y aurora-studio.tsx.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { chat } from "@/ai/client/chat";
import { loadConfigs } from "@/ai/client/providerStore";
import type { ChatMessage } from "@/ai/providers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Brain as BrainIcon,
  Plus,
  Trash2,
  Copy,
  Download,
  Upload,
  Server,
  Plug,
  Save,
  X,
  Sparkles,
  Wand2,
  Settings2,
  Check,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Cpu,
  Layers,
  RefreshCw,
  Play,
  UploadCloud,
  BookOpen,
  Terminal,
  Link2,
  Image as ImageIcon,
} from "lucide-react";
import {
  SERVER_KINDS,
  serverKindById,
  listBrains,
  saveBrain,
  deleteBrain,
  duplicateBrain,
  addServer,
  removeServer,
  updateServer,
  selectBrainForContext,
  getSelection,
  listSelections,
  assembleBrainBundle,
  importBrainBundle,
  loadBrainCatalog,
  brainFromTemplate,
  BRAIN_TEMPLATES,
  type Brain,
  type BrainServer,
  type BrainIncludes,
  type BrainCatalog,
  type BrainPermission,
  type BrainSelection,
  type NamedRef,
} from "@/lib/brains/brains";
import {
  runOnServer,
  syncToServer,
  pingServer as pingServerRuntime,
} from "@/lib/brains/runtime";
import {
  GEN_PRESETS,
  applyPreset,
  type GenAdapter,
} from "@/lib/brains/adapters";

const BOT_BASE = "https://starseed-neurocortex.vercel.app";

const SCOPES: { id: string; label: string }[] = [
  { id: "account", label: "Cuenta" },
  { id: "profile", label: "Perfil" },
  { id: "group", label: "Grupo" },
  { id: "page", label: "Página" },
];

const CONTEXTS: { id: string; label: string }[] = [
  { id: "global", label: "Global" },
  { id: "profile", label: "Perfil" },
  { id: "group", label: "Grupo" },
  { id: "page", label: "Página" },
  { id: "chat", label: "Chat" },
];

const PERM_LEVELS = ["lectura", "escritura", "admin"];

type IncKey = "vaults" | "backends" | "personalities" | "runtimes" | "tokens" | "memories";

const INC_SECTIONS: { key: IncKey; label: string; icon: string }[] = [
  { key: "vaults", label: "Baúles", icon: "🗄️" },
  { key: "backends", label: "Almacenes", icon: "📦" },
  { key: "personalities", label: "Personalidades Aurora", icon: "🌸" },
  { key: "runtimes", label: "Runtimes / Agentes", icon: "🤖" },
  { key: "tokens", label: "Tokens de proveedor", icon: "🔐" },
  { key: "memories", label: "Memorias", icon: "🧠" },
];

export default function BrainsPanel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [brains, setBrains] = useState<Brain[]>([]);
  const [catalog, setCatalog] = useState<BrainCatalog | null>(null);
  const [selections, setSelections] = useState<BrainSelection[]>([]);
  const [loading, setLoading] = useState(false);

  const [editId, setEditId] = useState<string | null>(null); // brain.id being edited, or "__new__"
  const [draft, setDraft] = useState<Brain | null>(null);

  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState("");

  const fileRef = useRef<HTMLInputElement | null>(null);

  const providers = useMemo(() => {
    try {
      return loadConfigs();
    } catch {
      return [];
    }
  }, []);
  const hasProvider = providers.some((c) => c.enabled);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createClient();
      const { data: au } = await sb.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const [list, cat, sels] = await Promise.all([listBrains(), loadBrainCatalog(), listSelections()]);
        setBrains(list);
        setCatalog(cat);
        setSelections(sels);
      }
    } catch {
      /* */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------------------------- editor helpers ---------------------------- */

  function startNew() {
    setEditId("__new__");
    setDraft({
      id: "",
      name: "",
      scope: "account",
      scope_ref: null,
      description: "",
      config: {},
      includes: {
        vaults: [],
        backends: [],
        personalities: [],
        runtimes: [],
        tokens: [],
        memories: [],
        connections: [],
        bindScope: false,
        permissions: [],
        aiProvider: undefined,
      },
      servers: [],
    });
  }

  function startFromTemplate(tid: string) {
    const t = BRAIN_TEMPLATES.find((x) => x.id === tid);
    if (!t) return;
    const partial = brainFromTemplate(t);
    setEditId("__new__");
    setDraft({
      id: "",
      name: partial.name || "",
      scope: partial.scope || "account",
      scope_ref: null,
      description: partial.description || "",
      config: partial.config || {},
      includes: partial.includes as BrainIncludes,
      servers: partial.servers || [],
    });
  }

  function startEdit(b: Brain) {
    setEditId(b.id);
    setDraft(JSON.parse(JSON.stringify(b)));
  }

  function closeEditor() {
    setEditId(null);
    setDraft(null);
  }

  function patchDraft(patch: Partial<Brain>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }
  function patchIncludes(patch: Partial<BrainIncludes>) {
    setDraft((d) => (d ? { ...d, includes: { ...d.includes, ...patch } } : d));
  }

  function toggleInc(key: IncKey, id: string) {
    setDraft((d) => {
      if (!d) return d;
      const cur = d.includes[key] as string[];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...d, includes: { ...d.includes, [key]: next } };
    });
  }

  async function onSaveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Ponle un nombre al cerebro.");
      return;
    }
    const saved = await saveBrain(draft);
    if (saved) {
      toast.success(`Cerebro «${saved.name}» guardado.`);
      closeEditor();
      await load();
    } else {
      toast.error("No se pudo guardar. ¿Has iniciado sesión?");
    }
  }

  async function onDelete(b: Brain) {
    if (!confirm(`¿Eliminar el cerebro «${b.name}»? Esto no borra tus memorias ni subsistemas, sólo el cerebro.`)) return;
    const ok = await deleteBrain(b.id);
    if (ok) {
      toast.success("Cerebro eliminado.");
      if (editId === b.id) closeEditor();
      await load();
    }
  }

  async function onDuplicate(b: Brain) {
    const copy = await duplicateBrain(b);
    if (copy) {
      toast.success("Cerebro duplicado.");
      await load();
    }
  }

  /* ---------------------------- permissions ---------------------------- */

  function permList(): BrainPermission[] {
    const p = draft?.includes.permissions;
    return Array.isArray(p) ? (p as BrainPermission[]) : [];
  }
  function addPerm() {
    patchIncludes({ permissions: [...permList(), { who: "", level: "lectura" }] });
  }
  function updatePerm(i: number, patch: Partial<BrainPermission>) {
    const next = permList().map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    patchIncludes({ permissions: next });
  }
  function removePerm(i: number) {
    patchIncludes({ permissions: permList().filter((_, idx) => idx !== i) });
  }

  /* ---------------------------- servers ---------------------------- */

  const [newSrvKind, setNewSrvKind] = useState<string>("higgsfield");
  const [newSrvName, setNewSrvName] = useState("");
  const [newSrvFields, setNewSrvFields] = useState<Record<string, string>>({});

  async function onAddServer() {
    if (!draft) return;
    const kindDef = serverKindById(newSrvKind);
    const server: Partial<BrainServer> = {
      kind: newSrvKind,
      name: newSrvName.trim() || kindDef?.label || "Servidor",
      ...newSrvFields,
    };
    // Persist immediately if the brain already exists; otherwise stage in draft.
    if (draft.id) {
      const updated = await addServer(draft, server);
      if (updated) {
        setDraft(updated);
        toast.success("Servidor añadido.");
      }
    } else {
      const next: BrainServer = {
        id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: newSrvKind,
        name: server.name as string,
        status: "pendiente",
        ...newSrvFields,
      };
      patchDraft({ servers: [...draft.servers, next] });
    }
    setNewSrvName("");
    setNewSrvFields({});
  }

  async function onRemoveServer(s: BrainServer) {
    if (!draft) return;
    if (draft.id) {
      const updated = await removeServer(draft, s.id);
      if (updated) setDraft(updated);
    } else {
      patchDraft({ servers: draft.servers.filter((x) => x.id !== s.id) });
    }
  }

  /**
   * Aplica un parche a un servidor (p.ej. su `adapter` de generación) y lo
   * persiste si el cerebro ya existe; si es nuevo, lo guarda en el borrador.
   * Mismo patrón que pingServer/onAddServer.
   */
  async function patchServer(serverId: string, patch: Partial<BrainServer>) {
    if (!draft) return;
    if (draft.id) {
      const updated = await updateServer(draft, serverId, patch);
      if (updated) setDraft(updated);
    } else {
      setDraft((d) =>
        d ? { ...d, servers: d.servers.map((x) => (x.id === serverId ? { ...x, ...patch, id: x.id } : x)) } : d,
      );
    }
  }

  async function pingServer(s: BrainServer) {
    setDraft((d) =>
      d ? { ...d, servers: d.servers.map((x) => (x.id === s.id ? { ...x, status: "probando" } : x)) } : d,
    );
    // Enrutado automático local-vs-remoto dentro de runtime.ts.
    const r = await pingServerRuntime(s, userId);
    const status = r.ok ? "ok" : r.reachable ? "error" : "pendiente";
    toast[r.ok ? "success" : "message"](r.detail || (r.ok ? "Servidor disponible." : "El servidor no respondió."));
    if (draft?.id) {
      const updated = await updateServer(draft, s.id, { status });
      if (updated) setDraft(updated);
    } else {
      setDraft((d) =>
        d ? { ...d, servers: d.servers.map((x) => (x.id === s.id ? { ...x, status } : x)) } : d,
      );
    }
  }

  /* ---- ejecutar / sincronizar contra el servidor (local o remoto) ---- */

  const [taskByServer, setTaskByServer] = useState<Record<string, string>>({});
  const [busyServer, setBusyServer] = useState<string | null>(null);
  const [resultByServer, setResultByServer] = useState<Record<string, string>>({});

  function setTaskFor(id: string, v: string) {
    setTaskByServer((m) => ({ ...m, [id]: v }));
  }

  async function runServer(s: BrainServer) {
    const task = (taskByServer[s.id] || "").trim();
    if (!task) {
      toast.error("Escribe una tarea para ejecutar.");
      return;
    }
    setBusyServer(s.id);
    try {
      const r = await runOnServer(s, task, { brain: draft?.name, scope: draft?.scope }, userId);
      if (r.ok) {
        const text = typeof r.result === "string" ? r.result : JSON.stringify(r.result, null, 2);
        setResultByServer((m) => ({ ...m, [s.id]: text }));
        toast.success(`Ejecutado (${r.via === "local" ? "directo" : "vía proxy"}).`);
      } else {
        setResultByServer((m) => ({ ...m, [s.id]: `Error: ${r.error ?? "desconocido"}` }));
        toast.message(r.error || "No se pudo ejecutar.");
      }
    } finally {
      setBusyServer(null);
    }
  }

  async function syncServer(s: BrainServer) {
    if (!draft?.id) {
      toast.error("Guarda el cerebro antes de sincronizar.");
      return;
    }
    setBusyServer(s.id);
    try {
      const bundle = await assembleBrainBundle(draft.id);
      if (!bundle) {
        toast.error("No se pudo ensamblar el cerebro.");
        return;
      }
      const r = await syncToServer(s, bundle, userId);
      if (r.ok) {
        const text =
          typeof r.stored === "string" ? r.stored : JSON.stringify(r.stored, null, 2);
        setResultByServer((m) => ({ ...m, [s.id]: text }));
        toast.success(`Sincronizado (${r.via === "local" ? "directo" : "vía proxy"}).`);
      } else {
        setResultByServer((m) => ({ ...m, [s.id]: `Error: ${r.error ?? "desconocido"}` }));
        toast.message(r.error || "No se pudo sincronizar.");
      }
    } finally {
      setBusyServer(null);
    }
  }

  /* ---------------------------- export / import ---------------------------- */

  async function onExport(b: Brain) {
    if (typeof window === "undefined") return;
    const bundle = await assembleBrainBundle(b.id);
    if (!bundle) {
      toast.error("No se pudo ensamblar el cerebro.");
      return;
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const slug = (b.name || "cerebro").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "cerebro";
    a.download = `${slug}.brain.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const created = await importBrainBundle(json);
      if (created) {
        toast.success(`Cerebro «${created.name}» importado.`);
        await load();
      } else {
        toast.error("Archivo .brain.json no válido.");
      }
    } catch {
      toast.error("No se pudo leer el archivo.");
    }
    e.target.value = "";
  }

  /* ---------------------------- context selection ---------------------------- */

  const [selContext, setSelContext] = useState("global");
  const [selRef, setSelRef] = useState("");
  const [selBrain, setSelBrain] = useState("");
  const [selServers, setSelServers] = useState<string[]>([]);

  const selBrainObj = useMemo(() => brains.find((b) => b.id === selBrain) || null, [brains, selBrain]);

  async function applySelection() {
    if (!selBrain) {
      toast.error("Elige un cerebro para este contexto.");
      return;
    }
    const ok = await selectBrainForContext(selContext, selContext === "global" ? "" : selRef || "", selBrain, selServers);
    if (ok) {
      toast.success("Cerebro asignado a este contexto.");
      await load();
    } else {
      toast.error("No se pudo asignar.");
    }
  }

  function brainName(id: string) {
    return brains.find((b) => b.id === id)?.name ?? id.slice(0, 8);
  }

  /* ---------------------------- astraura ---------------------------- */

  async function suggest() {
    if (!hasProvider) {
      toast.error("Activa un proveedor de IA en Ajustes → IA & Modelos para que Astraura sugiera.");
      return;
    }
    setSuggesting(true);
    setSuggestion("");
    try {
      const summary = brains
        .map(
          (b) =>
            `- ${b.name} (alcance ${b.scope}, ${
              (b.includes.vaults.length || 0) +
              (b.includes.backends.length || 0) +
              (b.includes.personalities.length || 0) +
              (b.includes.runtimes.length || 0) +
              (b.includes.tokens.length || 0) +
              (b.includes.memories.length || 0)
            } elementos, ${b.servers.length} servidores${b.includes.bindScope ? ", vincula todo el alcance" : ""})`,
        )
        .join("\n");
      const content = `Eres Astraura, guía de StarSeed OS. Un "cerebro" es el contenedor maestro y portable que empaqueta TODO el contexto del usuario: memorias, baúles y carpetas, conexiones, sistemas de IA (configs y adaptaciones a Astraura y Aurora), permisos, accesos, ficheros, APIs, cuentas, fuentes y servidores. Un cerebro puede conectarse a Higgsfield, a cualquier servidor online o a un servidor local. Los usuarios eligen cerebros por contexto (global, perfil, grupo, página, chat) y qué servidor(es) usar.
Cerebros actuales del usuario:
${summary || "(ninguno todavía)"}
Sugiere en español, breve y accionable, cómo organizar sus cerebros: qué cerebros conviene tener, qué incluir en cada uno, qué servidores conectar y qué cerebro usar en cada contexto. Máximo 8 líneas.`;
      const messages: ChatMessage[] = [{ role: "user", content }];
      const r = await chat({ messages, temperature: 0.5 });
      setSuggestion(r.text);
    } catch {
      toast.error("Astraura no pudo responder. Revisa tu proveedor de IA.");
    }
    setSuggesting(false);
  }

  /* ---------------------------- render ---------------------------- */

  if (!userId && !loading) {
    return (
      <div className="m-1 rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        Inicia sesión para crear y administrar tus cerebros.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      {/* Header / concepto */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-fuchsia-600">
            <BrainIcon className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-cyan-50">Cerebros · tu contexto portable</span>
            <span className="max-w-2xl text-[11px] text-cyan-300/70">
              Un cerebro empaqueta TODO: memorias, baúles y carpetas, conexiones, sistemas de IA con sus configs y
              adaptaciones a Astraura y Aurora, permisos, accesos, ficheros, APIs, cuentas, fuentes y servidores.
              Conéctalo a Higgsfield, a cualquier servidor online o a un servidor local, y elígelo por contexto.
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="gap-2 border-cyan-500/30 text-cyan-100" onClick={load} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Actualizar
            </Button>
            <label>
              <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onImport} />
              <span className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-cyan-500/30 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/10">
                <Upload className="h-4 w-4" /> Importar
              </span>
            </label>
            <Button size="sm" className="gap-2 bg-cyan-600 text-white hover:bg-cyan-500" onClick={startNew}>
              <Plus className="h-4 w-4" /> Nuevo cerebro
            </Button>
          </div>
        </div>
      </div>

      {/* Plantillas */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest text-cyan-300/60">Plantillas</span>
        {BRAIN_TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => startFromTemplate(t.id)}
            title={t.description}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60 hover:border-cyan-400/40 hover:text-cyan-100"
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Editor */}
      {draft && (
        <BrainEditor
          draft={draft}
          isNew={editId === "__new__"}
          catalog={catalog}
          providers={providers}
          incSections={INC_SECTIONS}
          onClose={closeEditor}
          onSave={onSaveDraft}
          patchDraft={patchDraft}
          patchIncludes={patchIncludes}
          toggleInc={toggleInc}
          permList={permList}
          addPerm={addPerm}
          updatePerm={updatePerm}
          removePerm={removePerm}
          newSrvKind={newSrvKind}
          setNewSrvKind={setNewSrvKind}
          newSrvName={newSrvName}
          setNewSrvName={setNewSrvName}
          newSrvFields={newSrvFields}
          setNewSrvFields={setNewSrvFields}
          onAddServer={onAddServer}
          onRemoveServer={onRemoveServer}
          patchServer={patchServer}
          pingServer={pingServer}
          runServer={runServer}
          syncServer={syncServer}
          taskByServer={taskByServer}
          setTaskFor={setTaskFor}
          busyServer={busyServer}
          resultByServer={resultByServer}
          onExport={() => draft.id && onExport(draft)}
        />
      )}

      {/* Lista de cerebros */}
      <div className="space-y-2">
        <span className="text-[11px] uppercase tracking-widest text-cyan-300/60">
          Tus cerebros ({brains.length})
        </span>
        {brains.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
            Aún no tienes cerebros. Crea uno desde cero o usa una plantilla para empaquetar tu contexto.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {brains.map((b) => {
              const incCount =
                b.includes.vaults.length +
                b.includes.backends.length +
                b.includes.personalities.length +
                b.includes.runtimes.length +
                b.includes.tokens.length +
                b.includes.memories.length +
                b.includes.connections.length;
              return (
                <div key={b.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-500/30 to-fuchsia-500/30">
                      <BrainIcon className="h-4 w-4 text-cyan-200" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">{b.name}</span>
                        <Badge variant="outline" className="border-white/15 text-[9px] text-white/50">
                          {SCOPES.find((s) => s.id === b.scope)?.label ?? b.scope}
                        </Badge>
                        {b.includes.bindScope && (
                          <Badge variant="outline" className="border-cyan-400/40 text-[9px] text-cyan-300">
                            todo el alcance
                          </Badge>
                        )}
                      </div>
                      {b.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-white/45">{b.description}</p>}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="gap-1 border-white/15 text-[10px] text-white/60">
                      <Layers className="h-3 w-3" /> {incCount} incluidos
                    </Badge>
                    <Badge variant="outline" className="gap-1 border-white/15 text-[10px] text-white/60">
                      <Server className="h-3 w-3" /> {b.servers.length} servidores
                    </Badge>
                    {b.includes.aiProvider && (
                      <Badge variant="outline" className="gap-1 border-fuchsia-400/30 text-[10px] text-fuchsia-200">
                        <Sparkles className="h-3 w-3" /> {b.includes.aiProvider}
                      </Badge>
                    )}
                    {b.servers.slice(0, 3).map((s) => (
                      <ServerStatusChip key={s.id} status={s.status} />
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 border-white/15 text-white/80" onClick={() => startEdit(b)}>
                      <Settings2 className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-white/60" onClick={() => onDuplicate(b)}>
                      <Copy className="h-3.5 w-3.5" /> Duplicar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-white/60" onClick={() => onExport(b)}>
                      <Download className="h-3.5 w-3.5" /> Exportar
                    </Button>
                    <button onClick={() => onDelete(b)} className="ml-auto text-white/30 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selección por contexto */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-300/60">
          <BrainIcon className="h-3.5 w-3.5" /> Usar este cerebro en…
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Contexto</span>
            <div className="flex flex-wrap gap-1.5">
              {CONTEXTS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelContext(c.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    selContext === c.id
                      ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 text-white/50 hover:text-white/80",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </label>
          {selContext !== "global" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/50">Referencia (id de {selContext})</span>
              <Input
                value={selRef}
                onChange={(e) => setSelRef(e.target.value)}
                placeholder="ID del perfil/grupo/página/chat"
                className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
              />
            </label>
          )}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Cerebro</span>
            <select
              value={selBrain}
              onChange={(e) => {
                setSelBrain(e.target.value);
                const b = brains.find((x) => x.id === e.target.value);
                setSelServers((b?.servers || []).map((s) => s.id));
              }}
              className="rounded-md border border-white/15 bg-black/30 px-2 py-2 text-sm text-white"
            >
              <option value="">— elige un cerebro —</option>
              {brains.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          {selBrainObj && selBrainObj.servers.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/50">Servidor(es)</span>
              <div className="flex flex-wrap gap-1.5">
                {selBrainObj.servers.map((s) => {
                  const on = selServers.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelServers((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px]",
                        on ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-white/10 text-white/50",
                      )}
                    >
                      {on ? <Check className="h-3 w-3" /> : <Server className="h-3 w-3" />}
                      {serverKindById(String(s.kind))?.icon ?? ""} {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="mt-3">
          <Button size="sm" className="gap-2 bg-cyan-600 text-white hover:bg-cyan-500" onClick={applySelection}>
            <Check className="h-4 w-4" /> Usar aquí
          </Button>
        </div>

        {selections.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-cyan-300/50">Selecciones actuales</div>
            <div className="space-y-1">
              {selections.map((s, i) => (
                <div
                  key={`${s.context}:${s.context_ref}:${i}`}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] text-white/70"
                >
                  <Badge variant="outline" className="border-cyan-400/30 text-[9px] text-cyan-200">
                    {CONTEXTS.find((c) => c.id === s.context)?.label ?? s.context}
                    {s.context_ref ? ` · ${s.context_ref}` : ""}
                  </Badge>
                  <BrainIcon className="h-3 w-3 text-cyan-300/70" />
                  <span className="text-white/85">{brainName(s.brain_id)}</span>
                  {s.server_ids.length > 0 && (
                    <span className="text-white/40">· {s.server_ids.length} servidor(es)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Convertir este equipo en cerebro */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Terminal className="h-4 w-4 text-emerald-300" />
          <span className="text-sm font-semibold text-emerald-50">Convierte este equipo en cerebro</span>
          <span className="text-[11px] text-emerald-300/70">
            Un pequeño servidor local (sin dependencias) que actúa como cerebro.
          </span>
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12px] text-emerald-100/80">
          <li>
            Descarga el servidor de referencia{" "}
            <a href="/brain/local_brain.py" download className="text-emerald-200 underline hover:text-emerald-100">
              local_brain.py
            </a>{" "}
            (Python 3, sin dependencias).
          </li>
          <li>
            Ejecútalo: <code className="rounded bg-black/40 px-1 text-emerald-100">python3 local_brain.py</code> — escuchará en{" "}
            <code className="rounded bg-black/40 px-1 text-emerald-100">http://127.0.0.1:8800</code>.
          </li>
          <li>
            En un cerebro, añade un servidor de tipo «Servidor local» con la URL{" "}
            <code className="rounded bg-black/40 px-1 text-emerald-100">http://localhost:8800</code> y pulsa Probar.
          </li>
          <li>Apunta una carpeta de Syncthing a ./starseed_brain para sincronizar entre dispositivos.</li>
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
            href="/brain/README.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/10"
          >
            <BookOpen className="h-3.5 w-3.5" /> Guía y contrato
          </a>
        </div>
      </div>

      {/* Astraura */}
      <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-300" />
          <span className="text-sm font-semibold text-fuchsia-50">Astraura</span>
          <span className="text-[11px] text-fuchsia-300/70">Sugiere cómo organizar tus cerebros.</span>
          <Button size="sm" className="ml-auto gap-2 bg-fuchsia-600 text-white hover:bg-fuchsia-500" onClick={suggest} disabled={suggesting}>
            <Wand2 className={cn("h-4 w-4", suggesting && "animate-pulse")} /> Sugerir cómo organizar mis cerebros
          </Button>
        </div>
        {!hasProvider && (
          <p className="mt-2 text-[11px] text-fuchsia-200/60">
            Activa un proveedor de IA en Ajustes → IA & Modelos para usar a Astraura.
          </p>
        )}
        {suggestion && (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-fuchsia-500/20 bg-black/30 p-3 text-[12px] leading-relaxed text-fuchsia-100">
            {suggestion}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Editor de cerebro                                                       */
/* ====================================================================== */

function BrainEditor(props: {
  draft: Brain;
  isNew: boolean;
  catalog: BrainCatalog | null;
  providers: { id: string; label: string; enabled: boolean }[];
  incSections: { key: IncKey; label: string; icon: string }[];
  onClose: () => void;
  onSave: () => void;
  patchDraft: (p: Partial<Brain>) => void;
  patchIncludes: (p: Partial<BrainIncludes>) => void;
  toggleInc: (key: IncKey, id: string) => void;
  permList: () => BrainPermission[];
  addPerm: () => void;
  updatePerm: (i: number, p: Partial<BrainPermission>) => void;
  removePerm: (i: number) => void;
  newSrvKind: string;
  setNewSrvKind: (s: string) => void;
  newSrvName: string;
  setNewSrvName: (s: string) => void;
  newSrvFields: Record<string, string>;
  setNewSrvFields: (f: Record<string, string>) => void;
  onAddServer: () => void;
  onRemoveServer: (s: BrainServer) => void;
  patchServer: (serverId: string, patch: Partial<BrainServer>) => void;
  pingServer: (s: BrainServer) => void;
  runServer: (s: BrainServer) => void;
  syncServer: (s: BrainServer) => void;
  taskByServer: Record<string, string>;
  setTaskFor: (id: string, v: string) => void;
  busyServer: string | null;
  resultByServer: Record<string, string>;
  onExport: () => void;
}) {
  const {
    draft,
    isNew,
    catalog,
    providers,
    incSections,
    onClose,
    onSave,
    patchDraft,
    patchIncludes,
    toggleInc,
    permList,
    addPerm,
    updatePerm,
    removePerm,
    newSrvKind,
    setNewSrvKind,
    newSrvName,
    setNewSrvName,
    newSrvFields,
    setNewSrvFields,
    onAddServer,
    onRemoveServer,
    patchServer,
    pingServer,
    runServer,
    syncServer,
    taskByServer,
    setTaskFor,
    busyServer,
    resultByServer,
    onExport,
  } = props;

  const refsFor = (key: IncKey): NamedRef[] => {
    if (!catalog) return [];
    const map: Record<IncKey, NamedRef[]> = {
      vaults: catalog.vaults,
      backends: catalog.backends,
      personalities: catalog.personalities,
      runtimes: catalog.runtimes,
      tokens: catalog.tokens,
      memories: catalog.memories,
    };
    return map[key] || [];
  };

  const newKindDef = serverKindById(newSrvKind);

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/10 p-4 space-y-5">
      <div className="flex items-center gap-2">
        <BrainIcon className="h-4 w-4 text-cyan-300" />
        <span className="text-sm font-semibold text-cyan-50">{isNew ? "Nuevo cerebro" : `Editar: ${draft.name || "cerebro"}`}</span>
        <div className="ml-auto flex gap-2">
          {!isNew && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-white/60" onClick={onExport}>
              <Download className="h-3.5 w-3.5" /> Exportar
            </Button>
          )}
          <Button size="sm" className="gap-1.5 bg-cyan-600 text-white hover:bg-cyan-500" onClick={onSave}>
            <Save className="h-3.5 w-3.5" /> Guardar
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-white/60" onClick={onClose}>
            <X className="h-3.5 w-3.5" /> Cerrar
          </Button>
        </div>
      </div>

      {/* Datos básicos */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50">Nombre</span>
          <Input
            value={draft.name}
            onChange={(e) => patchDraft({ name: e.target.value })}
            placeholder="Nombre del cerebro"
            className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50">Alcance</span>
          <div className="flex flex-wrap gap-1.5">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                onClick={() => patchDraft({ scope: s.id, scope_ref: s.id === "account" ? null : draft.scope_ref })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  draft.scope === s.id
                    ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                    : "border-white/10 text-white/50 hover:text-white/80",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </label>
      </div>

      {draft.scope !== "account" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50">Referencia del alcance (id de {draft.scope})</span>
          <Input
            value={draft.scope_ref ?? ""}
            onChange={(e) => patchDraft({ scope_ref: e.target.value })}
            placeholder="ID del perfil/grupo/página"
            className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/50">Descripción</span>
        <Textarea
          value={draft.description}
          onChange={(e) => patchDraft({ description: e.target.value })}
          placeholder="¿Qué contexto empaqueta este cerebro y para qué lo usarás?"
          className="min-h-[64px] border-white/15 bg-black/30 text-white placeholder:text-white/30"
        />
      </label>

      {/* Vincular todo el alcance */}
      <label className="flex items-center justify-between gap-2 rounded-lg border border-cyan-500/20 bg-black/20 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-cyan-50">Vincular todo el alcance</span>
          <span className="text-[10px] text-white/40">Incluye automáticamente todo lo que exista en este alcance (baúles, almacenes, memorias…).</span>
        </div>
        <Switch checked={draft.includes.bindScope} onCheckedChange={(v) => patchIncludes({ bindScope: v })} />
      </label>

      {/* Incluye: multi-selects */}
      <div className={cn("space-y-3", draft.includes.bindScope && "opacity-50 pointer-events-none")}>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-300/60">
          <Layers className="h-3.5 w-3.5" /> Incluye
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {incSections.map((sec) => {
            const refs = refsFor(sec.key);
            const selected = draft.includes[sec.key] as string[];
            return (
              <div key={sec.key} className="rounded-lg border border-white/10 bg-black/20 p-2">
                <div className="mb-1 flex items-center gap-1.5 text-xs text-white/70">
                  <span>{sec.icon}</span> {sec.label}
                  <span className="ml-auto text-[10px] text-white/35">{selected.length}/{refs.length}</span>
                </div>
                {refs.length === 0 ? (
                  <div className="text-[10px] text-white/30">Sin elementos en tu cuenta.</div>
                ) : (
                  <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                    {refs.map((r) => {
                      const on = selected.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => toggleInc(sec.key, r.id)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                            on ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 text-white/55 hover:text-white/90",
                          )}
                        >
                          {on && <Check className="h-3 w-3" />} {r.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Conexiones (texto libre) */}
          <div className="rounded-lg border border-white/10 bg-black/20 p-2">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-white/70">
              <Plug className="h-3.5 w-3.5" /> Conexiones
              <span className="ml-auto text-[10px] text-white/35">{draft.includes.connections.length}</span>
            </div>
            <Input
              value={draft.includes.connections.join(", ")}
              onChange={(e) =>
                patchIncludes({
                  connections: e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
              placeholder="syncthing, drive, vps, vpn… (separadas por comas)"
              className="h-8 border-white/15 bg-black/30 text-white placeholder:text-white/30"
            />
          </div>
        </div>
      </div>

      {/* IA: proveedor + nota Aurora */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-white/50">
            <Cpu className="h-3.5 w-3.5" /> Proveedor de IA (Astraura)
          </span>
          <select
            value={draft.includes.aiProvider ?? ""}
            onChange={(e) => patchIncludes({ aiProvider: e.target.value || undefined })}
            className="rounded-md border border-white/15 bg-black/30 px-2 py-2 text-sm text-white"
          >
            <option value="">— por defecto del sistema —</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.enabled ? "" : " (inactivo)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-white/50">
            <Sparkles className="h-3.5 w-3.5" /> Personalidad Aurora
          </span>
          <select
            value={(draft.includes.personalities[0] as string) ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              const rest = (draft.includes.personalities as string[]).filter((x) => x !== v);
              patchIncludes({ personalities: v ? [v, ...rest] : rest });
            }}
            className="rounded-md border border-white/15 bg-black/30 px-2 py-2 text-sm text-white"
          >
            <option value="">— ninguna / por defecto —</option>
            {(catalog?.personalities || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Permisos */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-2">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-white/70">
          <ShieldCheck className="h-3.5 w-3.5" /> Permisos
          <Button size="sm" variant="ghost" className="ml-auto h-6 gap-1 px-2 text-[11px] text-cyan-200" onClick={addPerm}>
            <Plus className="h-3 w-3" /> Añadir
          </Button>
        </div>
        {permList().length === 0 ? (
          <div className="text-[10px] text-white/30">Sin permisos definidos (sólo tú, el propietario).</div>
        ) : (
          <div className="space-y-1.5">
            {permList().map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <Input
                  value={p.who}
                  onChange={(e) => updatePerm(i, { who: e.target.value })}
                  placeholder="¿A quién? (usuario, grupo, página)"
                  className="h-8 flex-1 border-white/15 bg-black/30 text-white placeholder:text-white/30"
                />
                <select
                  value={p.level}
                  onChange={(e) => updatePerm(i, { level: e.target.value })}
                  className="h-8 rounded-md border border-white/15 bg-black/30 px-2 text-xs text-white"
                >
                  {PERM_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <button onClick={() => removePerm(i)} className="text-white/30 hover:text-red-400">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Servidores */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-300/60">
          <Server className="h-3.5 w-3.5" /> Servidores
        </div>

        {draft.servers.length > 0 && (
          <div className="space-y-1.5">
            {draft.servers.map((s) => {
              const isLocal = String(s.kind) === "local";
              const busy = busyServer === s.id;
              const result = resultByServer[s.id];
              return (
                <div key={s.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base">{serverKindById(String(s.kind))?.icon ?? "🔌"}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-white">{s.name}</span>
                        <Badge variant="outline" className="border-white/15 text-[9px] text-white/50">
                          {serverKindById(String(s.kind))?.label ?? s.kind}
                        </Badge>
                        <Badge variant="outline" className="border-white/15 text-[9px] text-white/40">
                          {isLocal ? "directo" : "vía proxy"}
                        </Badge>
                        <ServerStatusChip status={s.status} />
                      </div>
                      {s.endpoint && <div className="truncate text-[10px] text-white/35">{String(s.endpoint)}</div>}
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-white/60" onClick={() => pingServer(s)}>
                        <Plug className="h-3.5 w-3.5" /> Probar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-cyan-200"
                        disabled={busy}
                        onClick={() => syncServer(s)}
                      >
                        <UploadCloud className="h-3.5 w-3.5" /> Sincronizar
                      </Button>
                      <button onClick={() => onRemoveServer(s)} className="text-white/30 hover:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Adaptador de generación (Higgsfield / cualquier API de gen) */}
                  {(String(s.kind) === "higgsfield" || String(s.kind) === "online") && (
                    <GenAdapterEditor server={s} patchServer={patchServer} />
                  )}

                  {/* Ejecutar una tarea contra este servidor */}
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <Textarea
                      value={taskByServer[s.id] ?? ""}
                      onChange={(e) => setTaskFor(s.id, e.target.value)}
                      placeholder="Tarea para este cerebro (p.ej. «resume mi contexto»)…"
                      className="min-h-[38px] flex-1 border-white/15 bg-black/30 text-white placeholder:text-white/30"
                    />
                    <Button
                      size="sm"
                      className="gap-1.5 bg-cyan-600 text-white hover:bg-cyan-500"
                      disabled={busy}
                      onClick={() => runServer(s)}
                    >
                      <Play className={cn("h-3.5 w-3.5", busy && "animate-pulse")} /> Ejecutar
                    </Button>
                  </div>
                  {result && <RunResultView text={result} />}
                </div>
              );
            })}
          </div>
        )}

        {/* Añadir servidor */}
        <div className="rounded-lg border border-cyan-500/20 bg-black/20 p-2 space-y-2">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {SERVER_KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => {
                  setNewSrvKind(k.id);
                  setNewSrvName(k.label);
                  setNewSrvFields(
                    k.id === "higgsfield"
                      ? { endpoint: "https://api.higgsfield.ai", keyRef: "higgsfield" }
                      : k.id === "local"
                        ? { endpoint: "http://localhost:8800" }
                        : {},
                  );
                }}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-left text-[11px]",
                  newSrvKind === k.id ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-50" : "border-white/10 text-white/55 hover:text-white/90",
                )}
              >
                <span className="mr-1">{k.icon}</span>
                {k.label}
              </button>
            ))}
          </div>
          {newKindDef && <p className="text-[10px] text-white/45">{newKindDef.blurb}</p>}
          {newSrvKind === "higgsfield" && (
            <div className="rounded-md border border-fuchsia-400/30 bg-fuchsia-950/20 p-2 text-[10px] text-fuchsia-200/80">
              <span className="font-medium text-fuchsia-100">Preset Higgsfield.</span> Endpoint{" "}
              <code className="text-fuchsia-100">https://api.higgsfield.ai</code>. En el campo «Clave», pega el{" "}
              <span className="font-medium">nombre</span> de tu clave guardada en la bóveda (nunca la clave en claro). Se
              conecta vía el proxy del bot.
            </div>
          )}
          {(newSrvKind === "higgsfield" || newSrvKind === "online" || newSrvKind === "vps") && (
            <p className="text-[10px] text-white/35">
              Servidor remoto: se contacta a través del proxy del bot usando la clave de tu bóveda.
            </p>
          )}
          {newSrvKind === "local" && (
            <p className="text-[10px] text-white/35">
              Servidor local: se contacta directo desde el navegador (debe enviar CORS permisivo).
            </p>
          )}
          <Input
            value={newSrvName}
            onChange={(e) => setNewSrvName(e.target.value)}
            placeholder="Nombre del servidor"
            className="h-8 border-white/15 bg-black/30 text-white placeholder:text-white/30"
          />
          {(newKindDef?.fields ?? []).map((f) => (
            <Input
              key={f.key}
              value={newSrvFields[f.key] ?? ""}
              onChange={(e) => setNewSrvFields({ ...newSrvFields, [f.key]: e.target.value })}
              placeholder={f.label}
              className="h-8 border-white/15 bg-black/30 text-white placeholder:text-white/30"
            />
          ))}
          <Button size="sm" className="gap-1.5 bg-cyan-600 text-white hover:bg-cyan-500" onClick={onAddServer}>
            <Plus className="h-3.5 w-3.5" /> Añadir servidor
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Adaptador de generación (Higgsfield / cualquier API de gen)             */
/* ====================================================================== */

/**
 * Editor colapsable del adaptador de generación de un servidor. Permite elegir
 * un preset (GEN_PRESETS) y editar a mano la plantilla de la petición, el
 * resultPath y, opcionalmente, la configuración de sondeo (poll) como JSON.
 * Lo guardado se persiste en `server.adapter` vía `patchServer`.
 */
function GenAdapterEditor(props: {
  server: BrainServer;
  patchServer: (serverId: string, patch: Partial<BrainServer>) => void;
}) {
  const { server, patchServer } = props;
  const adapter = (server.adapter as GenAdapter | undefined) || undefined;
  const [open, setOpen] = useState(false);
  // Texto del poll editado a mano (JSON). Se inicializa desde el adaptador.
  const [pollText, setPollText] = useState<string>(
    adapter?.poll ? JSON.stringify(adapter.poll, null, 2) : "",
  );
  const [pollErr, setPollErr] = useState<string | null>(null);

  function setAdapter(next: GenAdapter | undefined) {
    patchServer(server.id, { adapter: next });
  }

  function onPreset(presetId: string) {
    if (!presetId) return; // placeholder: no-op
    if (presetId === "__none__") {
      setAdapter(undefined);
      setPollText("");
      setPollErr(null);
      return;
    }
    const next = applyPreset(presetId);
    setAdapter(next);
    setPollText(next.poll ? JSON.stringify(next.poll, null, 2) : "");
    setPollErr(null);
  }

  function patchAdapter(patch: Partial<GenAdapter>) {
    const base: GenAdapter = adapter || { template: '{\n  "prompt": "{{task}}"\n}', resultPath: "url" };
    setAdapter({ ...base, ...patch });
  }

  function commitPoll(text: string) {
    setPollText(text);
    const trimmed = text.trim();
    if (!trimmed) {
      setPollErr(null);
      // quitar poll del adaptador
      if (adapter) {
        const { poll: _omit, ...rest } = adapter;
        void _omit;
        setAdapter({ ...rest });
      }
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      setPollErr(null);
      patchAdapter({ poll: parsed });
    } catch {
      setPollErr("JSON de sondeo no válido.");
    }
  }

  return (
    <div className="mt-2 rounded-md border border-fuchsia-400/20 bg-fuchsia-950/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] text-fuchsia-100"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" />
        <span className="font-medium">Adaptador de generación</span>
        {adapter ? (
          <Badge variant="outline" className="border-fuchsia-400/40 text-[9px] text-fuchsia-200">
            activo{adapter.poll ? " · async" : ""}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-white/15 text-[9px] text-white/40">
            sin configurar
          </Badge>
        )}
      </button>

      {open && (
        <div className="space-y-2 px-2 pb-2">
          <p className="text-[10px] text-white/40">
            Convierte una tarea en una petición a una API de generación (imagen/vídeo). El proxy sustituye{" "}
            <code className="text-fuchsia-200">{"{{task}}"}</code> /{" "}
            <code className="text-fuchsia-200">{"{{prompt}}"}</code> en la plantilla, hace POST a tu endpoint con tu
            clave de la bóveda, y extrae el resultado por el path indicado.
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-white/50">Preset</span>
            <select
              value=""
              onChange={(e) => onPreset(e.target.value)}
              className="h-8 rounded-md border border-white/15 bg-black/30 px-2 text-xs text-white"
            >
              <option value="">{adapter ? "— aplicar otro preset —" : "— elige un preset —"}</option>
              {GEN_PRESETS.map((p) => (
                <option key={p.id} value={p.id} title={p.blurb}>
                  {p.label}
                </option>
              ))}
              {adapter && <option value="__none__">— quitar adaptador —</option>}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-white/50">
              Cuerpo de la petición (JSON, usa {"{{task}}"})
            </span>
            <Textarea
              value={adapter?.template ?? ""}
              onChange={(e) => patchAdapter({ template: e.target.value })}
              placeholder={'{\n  "prompt": "{{task}}"\n}'}
              className="min-h-[72px] border-white/15 bg-black/30 font-mono text-[11px] text-white placeholder:text-white/30"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-white/50">resultPath (path al output, p.ej. result.url, data.0.url)</span>
            <Input
              value={adapter?.resultPath ?? ""}
              onChange={(e) => patchAdapter({ resultPath: e.target.value })}
              placeholder="result.url"
              className="h-8 border-white/15 bg-black/30 font-mono text-[11px] text-white placeholder:text-white/30"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-white/50">
              Sondeo asíncrono (poll, JSON · opcional · vacío = síncrono)
            </span>
            <Textarea
              value={pollText}
              onChange={(e) => commitPoll(e.target.value)}
              placeholder={
                '{\n  "statusUrl": "https://…/{{id}}",\n  "idPath": "id",\n  "donePath": "status",\n  "doneValue": "completed",\n  "resultPath": "result.url",\n  "intervalMs": 3000,\n  "maxTries": 40\n}'
              }
              className="min-h-[72px] border-white/15 bg-black/30 font-mono text-[11px] text-white placeholder:text-white/30"
            />
            {pollErr && <span className="text-[10px] text-red-300">{pollErr}</span>}
          </label>

          <p className="text-[10px] text-white/35">
            Para Higgsfield Image-to-Video añade <code className="text-fuchsia-200">{'"image_url"'}</code> al cuerpo; para
            Soul Mode usa <code className="text-fuchsia-200">{'"reference_image_urls"'}</code>. Pega tu endpoint exacto en
            el campo «Base URL/API» del servidor.
          </p>
        </div>
      )}
    </div>
  );
}

/* ====================================================================== */
/* Render del resultado de ejecución (link/preview si es URL)              */
/* ====================================================================== */

/** Extrae la primera URL http(s) de un texto, si la hay. */
function firstUrl(text: string): string | null {
  const m = String(text || "").match(/https?:\/\/[^\s"'<>)\]]+/);
  return m ? m[0] : null;
}

/** ¿La URL apunta a una imagen por extensión? */
function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(url);
}

/** ¿La URL apunta a un vídeo por extensión? */
function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(url);
}

/**
 * Muestra el resultado de `run`. Si contiene una URL, ofrece un enlace y, si es
 * imagen/vídeo, una previsualización. Siempre incluye el texto crudo.
 */
function RunResultView({ text }: { text: string }) {
  const url = firstUrl(text);
  return (
    <div className="mt-2 space-y-2">
      {url && (
        <div className="space-y-1.5">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/20"
          >
            {isImageUrl(url) ? <ImageIcon className="h-3.5 w-3.5 shrink-0" /> : <Link2 className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{url}</span>
          </a>
          {isImageUrl(url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="resultado de generación" className="max-h-48 rounded-md border border-white/10" />
          )}
          {isVideoUrl(url) && (
            <video src={url} controls className="max-h-48 rounded-md border border-white/10" />
          )}
        </div>
      )}
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/40 p-2 text-[11px] leading-relaxed text-white/70">
        {text}
      </pre>
    </div>
  );
}

function ServerStatusChip({ status }: { status?: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    ok: { label: "OK", cls: "border-emerald-400/40 text-emerald-300" },
    error: { label: "Error", cls: "border-red-400/40 text-red-300" },
    probando: { label: "Probando…", cls: "border-cyan-400/40 text-cyan-300" },
    pendiente: { label: "Pendiente", cls: "border-amber-400/40 text-amber-300" },
  };
  const s = map[status ?? "pendiente"] ?? map.pendiente;
  return (
    <Badge variant="outline" className={cn("text-[9px]", s.cls)}>
      {s.label}
    </Badge>
  );
}
