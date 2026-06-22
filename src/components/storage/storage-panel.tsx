"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { chat } from "@/ai/client/chat";
import { loadConfigs } from "@/ai/client/providerStore";
import type { ChatMessage } from "@/ai/providers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Database,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plug,
  RefreshCw,
  Sparkles,
  HardDrive,
  CloudUpload,
  AlertTriangle,
  CheckCircle2,
  Wand2,
  FlaskConical,
  Settings2,
  Save,
  X,
  Network,
  RefreshCcw,
  Brain,
  Archive,
  Info,
} from "lucide-react";
import {
  STORAGE_KINDS,
  kindById,
  listBackends,
  saveBackend,
  deleteBackend,
  setEnabled,
  reorderPriority,
  updateBackend,
  getPolicy,
  savePolicy,
  ensureDefaults,
  SCOPES_EXT,
  type StorageBackend,
  type StorageKind,
  type StoragePolicy,
} from "@/lib/storage/backends";
import { chooseBackend, capacityInfo, explainPolicy } from "@/lib/storage/router";

const BOT_BASE = "https://starseed-neurocortex.vercel.app";

const SCOPES: { id: string; label: string }[] = SCOPES_EXT;

/** Scopes that target a concrete brain (cerebro) or vault (baúl). */
type ScopeTarget = { id: string; name: string };

type Msg = { kind: "ok" | "err" | "info"; text: string } | null;

export default function StoragePanel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [scope, setScope] = useState("account");
  const [scopeRef, setScopeRef] = useState("");
  const [scopeTargets, setScopeTargets] = useState<ScopeTarget[]>([]);
  const [backends, setBackends] = useState<StorageBackend[]>([]);
  const [policy, setPolicy] = useState<StoragePolicy>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  // add form
  const [adding, setAdding] = useState(false);
  const [newKind, setNewKind] = useState<string>("starseed");
  const [newName, setNewName] = useState("");
  const [newFields, setNewFields] = useState<Record<string, string>>({});

  // edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFields, setEditFields] = useState<Record<string, string>>({});

  // simulator
  const [simSize, setSimSize] = useState("12");
  const [simKind, setSimKind] = useState("memory");
  const [simFundamental, setSimFundamental] = useState(false);
  const [simTerm, setSimTerm] = useState<"short" | "mid" | "long">("mid");

  // astraura suggestion
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState("");

  const hasProvider = useMemo(() => {
    try {
      return loadConfigs().some((c) => c.enabled);
    } catch {
      return false;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createClient();
      const { data: au } = await sb.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        if (scope === "account") await ensureDefaults(uid);
        const list = await listBackends(scope, scope === "account" ? null : scopeRef || null);
        setBackends(list);
        setPolicy(await getPolicy());
      }
    } catch {
      /* */
    }
    setLoading(false);
  }, [scope, scopeRef]);

  useEffect(() => {
    load();
  }, [load]);

  // Load the user's brains / vaults so a datastore can be attached to one by scope.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (scope !== "brain" && scope !== "vault") {
        setScopeTargets([]);
        return;
      }
      try {
        const sb = createClient();
        const { data: au } = await sb.auth.getUser();
        const uid = au?.user?.id;
        if (!uid) return;
        const table = scope === "brain" ? "brains" : "vaults";
        const { data } = await sb
          .from(table)
          .select("id,name")
          .eq("owner", uid)
          .order("created_at", { ascending: true });
        if (!alive) return;
        const rows = ((data as { id: string; name?: string | null }[]) ?? []).map((r) => ({
          id: String(r.id),
          name: r.name && String(r.name).trim() ? String(r.name) : String(r.id),
        }));
        setScopeTargets(rows);
      } catch {
        if (alive) setScopeTargets([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [scope]);

  /* --------------------------- backend actions --------------------------- */

  async function toggle(b: StorageBackend) {
    await setEnabled(b.id, !b.enabled);
    setBackends((prev) => prev.map((x) => (x.id === b.id ? { ...x, enabled: !b.enabled } : x)));
  }

  async function move(b: StorageBackend, dir: -1 | 1) {
    const sorted = [...backends].sort((a, c) => (a.priority ?? 99) - (c.priority ?? 99));
    const idx = sorted.findIndex((x) => x.id === b.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    const bp = b.priority ?? 99;
    const sp = swap.priority ?? 99;
    await Promise.all([reorderPriority(b.id, sp), reorderPriority(swap.id, bp)]);
    await load();
  }

  async function remove(b: StorageBackend) {
    if (!confirm(`¿Eliminar el almacén «${b.name}»? Las memorias no se borran, sólo deja de usarse para enrutar.`)) return;
    await deleteBackend(b.id);
    setBackends((prev) => prev.filter((x) => x.id !== b.id));
    toast.success("Almacén eliminado");
  }

  function startEdit(b: StorageBackend) {
    setEditId(b.id);
    setEditName(b.name);
    const f: Record<string, string> = {};
    const k = kindById(b.kind);
    (k?.fields ?? []).forEach((fl) => {
      const v = (b.config as Record<string, unknown>)?.[fl.key];
      f[fl.key] = v == null ? "" : String(v);
    });
    setEditFields(f);
  }

  async function saveEdit(b: StorageBackend) {
    await updateBackend(b.id, { name: editName, config: { ...(b.config || {}), ...editFields } });
    setEditId(null);
    toast.success("Almacén actualizado");
    await load();
  }

  async function addBackend() {
    if (!newName.trim()) {
      toast.error("Ponle un nombre al almacén");
      return;
    }
    const saved = await saveBackend({
      kind: newKind,
      name: newName.trim(),
      scope,
      scope_ref: scope === "account" ? null : scopeRef || null,
      config: { ...newFields },
      priority: (backends.length || 0) + 1,
    });
    if (saved) {
      toast.success("Almacén añadido");
      setAdding(false);
      setNewName("");
      setNewFields({});
      setNewKind("starseed");
      await load();
    } else {
      toast.error("No se pudo guardar el almacén");
    }
  }

  /* --------------------------- connection tests --------------------------- */

  async function testConnection(b: StorageBackend) {
    setMsg(null);
    if (b.kind === "starseed") {
      await updateBackend(b.id, { status: "ok" });
      setBackends((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "ok" } : x)));
      toast.success("Servidor StarSeed disponible");
      return;
    }
    if (b.kind === "gdrive") {
      if (!userId) return;
      try {
        const st = await fetch(`${BOT_BASE}/api/drive?action=status&account_id=${userId}`).then((r) => r.json());
        if (!st?.ok) {
          await updateBackend(b.id, { status: "unconfigured" });
          setBackends((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "unconfigured" } : x)));
          toast.message("Drive no configurado por el proyecto aún");
          return;
        }
        if (!st.connected) {
          await updateBackend(b.id, { status: "disconnected" });
          setBackends((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "disconnected" } : x)));
          toast.message("Drive aún no conectado. Pulsa «Conectar Google Drive».");
          return;
        }
        const about = await fetch(`${BOT_BASE}/api/drive?action=about&account_id=${userId}`).then((r) => r.json());
        let quotaMb: number | null = null;
        let usedMb = 0;
        if (about?.ok && about.storageQuota) {
          const limit = Number(about.storageQuota.limit);
          const usage = Number(about.storageQuota.usage);
          if (Number.isFinite(limit) && limit > 0) quotaMb = Math.round(limit / (1024 * 1024));
          if (Number.isFinite(usage)) usedMb = Math.round(usage / (1024 * 1024));
        }
        await updateBackend(b.id, { status: "ok", quota_mb: quotaMb, used_mb: usedMb });
        setBackends((prev) =>
          prev.map((x) => (x.id === b.id ? { ...x, status: "ok", quota_mb: quotaMb, used_mb: usedMb } : x)),
        );
        toast.success("Google Drive conectado");
      } catch {
        toast.error("No se pudo contactar con el puente de Drive");
      }
      return;
    }
    // Open-source server-side datastores: direct browser pings suelen estar
    // bloqueados por CORS; se conectan vía el servidor del cerebro/proxy en runtime.
    const SERVER_OSS = ["postgres", "qdrant", "couchdb", "minio", "nextcloud"];
    if (SERVER_OSS.includes(b.kind)) {
      const ready = (kindById(b.kind)?.fields ?? []).every((f) =>
        String((b.config as Record<string, unknown>)?.[f.key] ?? "").trim(),
      );
      await updateBackend(b.id, { status: ready ? "configured" : "unknown" });
      setBackends((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: ready ? "configured" : "unknown" } : x)));
      toast.message(
        ready
          ? "Configurado (open-source). Se conecta vía el servidor del cerebro/proxy en runtime."
          : "Faltan datos de configuración",
      );
      return;
    }
    // others (sqlite, syncthing, github, obsidian, webdav, s3, custom…): mark configured/unknown
    const ok = (kindById(b.kind)?.fields ?? []).every((f) => String((b.config as Record<string, unknown>)?.[f.key] ?? "").trim());
    await updateBackend(b.id, { status: ok ? "configured" : "unknown" });
    setBackends((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: ok ? "configured" : "unknown" } : x)));
    toast.message(ok ? "Marcado como configurado" : "Faltan datos de configuración");
  }

  function connectDrive() {
    if (!userId) {
      toast.error("Inicia sesión para conectar Google Drive");
      return;
    }
    window.open(`${BOT_BASE}/api/drive_oauth?action=authorize&account_id=${userId}`, "_blank", "noopener,noreferrer");
  }

  /* --------------------------- policy --------------------------- */

  async function persistPolicy(next: StoragePolicy) {
    setPolicy(next);
    await savePolicy(next);
  }

  /* --------------------------- simulator --------------------------- */

  const simResult = useMemo(
    () =>
      chooseBackend(
        {
          sizeMb: Number(simSize) || 0,
          kind: simKind,
          fundamental: simFundamental,
          term: simTerm,
        },
        backends,
        policy,
      ),
    [simSize, simKind, simFundamental, simTerm, backends, policy],
  );

  /* --------------------------- astraura --------------------------- */

  async function suggest() {
    if (!hasProvider) {
      toast.error("Activa un proveedor de IA en Ajustes → IA & Modelos para que Astraura sugiera.");
      return;
    }
    setSuggesting(true);
    setSuggestion("");
    try {
      const summary = backends
        .map(
          (b) =>
            `- ${kindById(b.kind)?.label ?? b.kind} (kind=${b.kind}, prioridad ${b.priority}, cuota ${
              b.quota_mb ?? "ilimitada"
            } MB, ${b.enabled ? "activo" : "inactivo"})`,
        )
        .join("\n");
      const content = `Eres Astraura, guía de StarSeed OS. Filosofía de almacenamiento: el servidor StarSeed (Supabase) es LIMITADO y se prefiere para contexto, memoria de corto/medio plazo y memorias fundamentales; Google Drive del usuario para ficheros grandes y sincronizables; memoria local con capacidad por dispositivo (Syncthing); y fuentes ilimitadas (GitHub, WebDAV, S3, etc.) como overflow.
Almacenes del usuario:
${summary || "(sin almacenes)"}
Política actual: starseedMaxMb=${policy.starseedMaxMb ?? 5}, preferLargeTarget=${policy.preferLargeTarget ?? "(ninguno)"}, keepFundamentalOnStarseed=${policy.keepFundamentalOnStarseed !== false}.
Propón en español, de forma breve y accionable, una política de enrutado óptima (umbral MB para StarSeed, destino para ficheros grandes, y qué dejar como fundamental). Máximo 6 líneas.`;
      const messages: ChatMessage[] = [{ role: "user", content }];
      const r = await chat({ messages, temperature: 0.5 });
      setSuggestion(r.text);
    } catch (e) {
      toast.error("Astraura no pudo responder. Revisa tu proveedor de IA.");
      setSuggestion("");
    }
    setSuggesting(false);
  }

  /* --------------------------- render --------------------------- */

  if (!userId && !loading) {
    return (
      <div className="m-1 rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        Inicia sesión para configurar tus almacenes de datos y el enrutado inteligente.
      </div>
    );
  }

  const sorted = [...backends].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  const newKindDef = kindById(newKind) as StorageKind | undefined;

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-600">
            <Database className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-violet-50">Almacenes de datos · enrutado inteligente</span>
            <span className="text-[11px] text-violet-300/70">
              El servidor StarSeed es limitado (contexto y memorias fundamentales) · Google Drive para ficheros grandes ·
              local con capacidad por dispositivo · fuentes ilimitadas como overflow.
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-violet-500/30 text-violet-100"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Actualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Scope */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest text-violet-300/60">Ámbito</span>
        <div className="flex flex-wrap gap-1.5">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                scope === s.id
                  ? "border-violet-400/50 bg-violet-500/15 text-violet-100"
                  : "border-white/10 text-white/50 hover:text-white/80",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {scope !== "account" &&
          (scope === "brain" || scope === "vault" ? (
            <div className="flex items-center gap-1.5">
              {scope === "brain" ? (
                <Brain className="h-3.5 w-3.5 text-violet-300/70" />
              ) : (
                <Archive className="h-3.5 w-3.5 text-violet-300/70" />
              )}
              <select
                value={scopeRef}
                onChange={(e) => setScopeRef(e.target.value)}
                className="h-8 w-56 rounded-md border border-white/15 bg-black/30 px-2 text-xs text-white"
              >
                <option value="">
                  {scopeTargets.length
                    ? scope === "brain"
                      ? "Elige un cerebro…"
                      : "Elige un baúl…"
                    : scope === "brain"
                      ? "Sin cerebros (escribe un ID)"
                      : "Sin baúles (escribe un ID)"}
                </option>
                {scopeTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {scopeTargets.length === 0 && (
                <Input
                  value={scopeRef}
                  onChange={(e) => setScopeRef(e.target.value)}
                  placeholder={scope === "brain" ? "ID del cerebro" : "ID del baúl"}
                  className="h-8 w-44 border-white/15 bg-black/30 text-white placeholder:text-white/30"
                />
              )}
            </div>
          ) : (
            <Input
              value={scopeRef}
              onChange={(e) => setScopeRef(e.target.value)}
              placeholder="ID del perfil/grupo/página"
              className="h-8 w-56 border-white/15 bg-black/30 text-white placeholder:text-white/30"
            />
          ))}
      </div>

      {/* Open-source primero + Interconexión & Sincronización */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-950/15 px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <div className="text-[11px] leading-relaxed text-emerald-100/85">
            <span className="font-semibold text-emerald-200">Open-source primero.</span> Prioriza conexiones
            directas y soberanas: PostgreSQL/Supabase, SQLite, Qdrant (vectores), MinIO/S3, CouchDB, Nextcloud y
            Syncthing. Cualquier datastore puede vincularse a un{" "}
            <span className="font-medium text-emerald-200">Cerebro</span> o{" "}
            <span className="font-medium text-emerald-200">Baúl</span> eligiendo su ámbito arriba.
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-cyan-500/20 bg-cyan-950/15 px-3 py-2.5">
          <Network className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          <div className="text-[11px] leading-relaxed text-cyan-100/85">
            <span className="font-semibold text-cyan-200">Interconexión & Sincronización.</span>
            <span className="mt-1 flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5">
                <RefreshCcw className="h-3 w-3 text-cyan-300/80" /> <b>Syncthing</b> sincroniza ficheros entre
                dispositivos sin servidor central (open-source).
              </span>
              <span className="flex items-center gap-1.5">
                <RefreshCcw className="h-3 w-3 text-cyan-300/80" /> <b>CouchDB</b> y <b>PostgreSQL</b> replican
                datos (sync bidireccional / replicación lógica).
              </span>
              <span className="flex items-center gap-1.5">
                <Brain className="h-3 w-3 text-cyan-300/80" /> Vincula cualquier datastore a un cerebro o baúl
                por ámbito; se conecta vía el servidor del cerebro/proxy en runtime.
              </span>
            </span>
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            msg.kind === "ok" && "border-emerald-500/25 bg-emerald-950/20 text-emerald-200",
            msg.kind === "err" && "border-amber-500/25 bg-amber-950/20 text-amber-200",
            msg.kind === "info" && "border-cyan-500/25 bg-cyan-950/20 text-cyan-100",
          )}
        >
          {msg.kind === "err" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Backends list */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-violet-300/60">Almacenes ({sorted.length})</span>
          <Button
            size="sm"
            className="ml-auto gap-2 bg-violet-600 text-white hover:bg-violet-500"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus className="h-4 w-4" /> Añadir almacén
          </Button>
        </div>

        {adding && (
          <div className="rounded-xl border border-violet-500/30 bg-violet-950/10 p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STORAGE_KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => {
                    setNewKind(k.id);
                    setNewName((n) => n || k.label);
                  }}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-left text-xs",
                    newKind === k.id ? "border-violet-400/60 bg-violet-500/15 text-violet-50" : "border-white/10 text-white/60 hover:text-white/90",
                  )}
                >
                  <span className="mr-1">{k.icon}</span>
                  {k.label}
                  {k.oss && (
                    <span className="ml-1 rounded bg-emerald-500/20 px-1 py-0.5 text-[8px] font-semibold text-emerald-300">
                      OSS
                    </span>
                  )}
                </button>
              ))}
            </div>
            {newKindDef && (
              <p className="text-[11px] text-white/50">
                {newKindDef.oss && <span className="mr-1 font-semibold text-emerald-300">Open-source ·</span>}
                {newKindDef.blurb}
              </p>
            )}
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del almacén"
              className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
            />
            {(newKindDef?.fields ?? []).map((f) => (
              <Input
                key={f.key}
                type={f.type === "number" ? "number" : f.type === "password" ? "password" : "text"}
                value={newFields[f.key] ?? ""}
                onChange={(e) => setNewFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.label + (f.placeholder ? ` (${f.placeholder})` : "")}
                className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
              />
            ))}
            {newKind === "gdrive" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-2 border-emerald-500/30 text-emerald-100" onClick={connectDrive}>
                  <CloudUpload className="h-4 w-4" /> Conectar Google Drive
                </Button>
              </div>
            )}
            {["postgres", "qdrant", "couchdb", "minio", "nextcloud"].includes(newKind) && (
              <p className="flex items-start gap-1.5 rounded-md border border-cyan-500/15 bg-cyan-950/10 px-2 py-1.5 text-[10px] text-cyan-200/75">
                <Network className="mt-0.5 h-3 w-3 shrink-0" />
                Datastore open-source: se conecta directamente vía el servidor del cerebro/proxy en runtime (los
                pings directos desde el navegador pueden estar bloqueados por CORS). Guarda las credenciales como
                referencia a la bóveda.
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" className="gap-2 bg-violet-600 text-white hover:bg-violet-500" onClick={addBackend}>
                <Save className="h-4 w-4" /> Guardar
              </Button>
              <Button size="sm" variant="ghost" className="text-white/60" onClick={() => setAdding(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {sorted.length === 0 && !adding ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
            Aún no tienes almacenes en este ámbito. Por defecto se usa el servidor StarSeed; añade Google Drive o un almacén
            local para los ficheros grandes.
          </div>
        ) : (
          sorted.map((b, i) => {
            const k = kindById(b.kind);
            const cap = capacityInfo(b);
            const editing = editId === b.id;
            return (
              <div key={b.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg">{k?.icon ?? "📦"}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">{b.name}</span>
                      <Badge variant="outline" className="border-white/15 text-[9px] text-white/50">
                        {k?.label ?? b.kind}
                      </Badge>
                      <StatusBadge status={b.status} />
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <div className="flex flex-col">
                      <button onClick={() => move(b, -1)} disabled={i === 0} className="text-white/30 hover:text-violet-300 disabled:opacity-20">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => move(b, 1)} disabled={i === sorted.length - 1} className="text-white/30 hover:text-violet-300 disabled:opacity-20">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="text-[10px] text-white/30">#{b.priority}</span>
                    <Switch checked={b.enabled} onCheckedChange={() => toggle(b)} className="ml-1" />
                    <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-white/60" onClick={() => testConnection(b)}>
                      <Plug className="h-3.5 w-3.5" /> Probar
                    </Button>
                    <button onClick={() => (editing ? setEditId(null) : startEdit(b))} className="text-white/30 hover:text-violet-300">
                      <Settings2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(b)} className="text-white/30 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* capacity bar */}
                <div className="mt-2">
                  {cap.unlimited ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-300/80">
                      <HardDrive className="h-3 w-3" /> {cap.usedMb > 0 ? `${cap.usedMb} MB usados · ` : ""}capacidad ~ilimitada
                    </div>
                  ) : (
                    <div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className={cn("h-full rounded-full", cap.warning ? "bg-amber-400" : "bg-violet-400")}
                          style={{ width: `${cap.pct ?? 0}%` }}
                        />
                      </div>
                      <div className={cn("mt-1 text-[11px]", cap.warning ? "text-amber-300" : "text-white/40")}>
                        {cap.usedMb} / {cap.quotaMb} MB ({cap.pct}%) {cap.warning && "· casi lleno"}
                      </div>
                    </div>
                  )}
                </div>

                {/* gdrive connect inline */}
                {b.kind === "gdrive" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 border-emerald-500/30 text-emerald-100" onClick={connectDrive}>
                      <CloudUpload className="h-3.5 w-3.5" /> Conectar Google Drive
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-white/60" onClick={() => testConnection(b)}>
                      <RefreshCw className="h-3.5 w-3.5" /> Ya conecté → comprobar
                    </Button>
                  </div>
                )}

                {/* edit fields */}
                {editing && (
                  <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-black/20 p-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Nombre"
                      className="border-white/15 bg-black/30 text-white"
                    />
                    {(k?.fields ?? []).map((f) => (
                      <Input
                        key={f.key}
                        type={f.type === "number" ? "number" : f.type === "password" ? "password" : "text"}
                        value={editFields[f.key] ?? ""}
                        onChange={(e) => setEditFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.label}
                        className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
                      />
                    ))}
                    <div className="flex gap-2">
                      <Button size="sm" className="gap-1.5 bg-violet-600 text-white hover:bg-violet-500" onClick={() => saveEdit(b)}>
                        <Save className="h-3.5 w-3.5" /> Guardar
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1.5 text-white/60" onClick={() => setEditId(null)}>
                        <X className="h-3.5 w-3.5" /> Cerrar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Policy editor */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-violet-300/60">
          <Settings2 className="h-3.5 w-3.5" /> Política de enrutado
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Umbral StarSeed (MB)</span>
            <Input
              type="number"
              value={policy.starseedMaxMb ?? 5}
              onChange={(e) => persistPolicy({ ...policy, starseedMaxMb: Number(e.target.value) })}
              className="border-white/15 bg-black/30 text-white"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Ficheros grandes →</span>
            <div className="flex gap-1.5">
              {(["gdrive", "local"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => persistPolicy({ ...policy, preferLargeTarget: t })}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-xs",
                    policy.preferLargeTarget === t
                      ? "border-violet-400/60 bg-violet-500/15 text-violet-50"
                      : "border-white/10 text-white/50 hover:text-white/80",
                  )}
                >
                  {t === "gdrive" ? "Google Drive" : "Local"}
                </button>
              ))}
            </div>
          </label>
          <label className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 sm:self-end">
            <span className="text-xs text-white/60">Fundamentales en StarSeed</span>
            <Switch
              checked={policy.keepFundamentalOnStarseed !== false}
              onCheckedChange={(v) => persistPolicy({ ...policy, keepFundamentalOnStarseed: v })}
            />
          </label>
        </div>
        <p className="mt-3 rounded-lg border border-violet-500/15 bg-violet-950/10 px-3 py-2 text-[11px] leading-relaxed text-violet-200/80">
          {explainPolicy(policy, backends)}
        </p>
      </div>

      {/* Simulator */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-violet-300/60">
          <FlaskConical className="h-3.5 w-3.5" /> Simulador de enrutado
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Tamaño (MB)</span>
            <Input type="number" value={simSize} onChange={(e) => setSimSize(e.target.value)} className="border-white/15 bg-black/30 text-white" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Tipo</span>
            <Input value={simKind} onChange={(e) => setSimKind(e.target.value)} placeholder="memory / soul / dream…" className="border-white/15 bg-black/30 text-white placeholder:text-white/30" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Plazo</span>
            <div className="flex gap-1">
              {(["short", "mid", "long"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSimTerm(t)}
                  className={cn(
                    "flex-1 rounded-md border px-1.5 py-1.5 text-[11px]",
                    simTerm === t ? "border-violet-400/60 bg-violet-500/15 text-violet-50" : "border-white/10 text-white/50",
                  )}
                >
                  {t === "short" ? "Corto" : t === "mid" ? "Medio" : "Largo"}
                </button>
              ))}
            </div>
          </label>
          <label className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 sm:self-end">
            <span className="text-xs text-white/60">¿Fundamental?</span>
            <Switch checked={simFundamental} onCheckedChange={setSimFundamental} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-950/10 px-3 py-2">
          <span className="text-lg">{kindById(simResult.backend?.kind ?? "")?.icon ?? "🎯"}</span>
          <div>
            <div className="text-sm font-medium text-violet-50">
              {simResult.backend ? simResult.backend.name : "Sin destino"}
            </div>
            <div className="text-[11px] text-violet-200/70">{simResult.reason}</div>
          </div>
        </div>
      </div>

      {/* Astraura */}
      <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-300" />
          <span className="text-sm font-semibold text-fuchsia-50">Astraura</span>
          <span className="text-[11px] text-fuchsia-300/70">Sugiere una política de enrutado a partir de tus almacenes.</span>
          <Button size="sm" className="ml-auto gap-2 bg-fuchsia-600 text-white hover:bg-fuchsia-500" onClick={suggest} disabled={suggesting}>
            <Wand2 className={cn("h-4 w-4", suggesting && "animate-pulse")} /> Sugerir configuración
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

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    ok: { label: "OK", cls: "border-emerald-400/40 text-emerald-300" },
    configured: { label: "Configurado", cls: "border-cyan-400/40 text-cyan-300" },
    disconnected: { label: "Sin conectar", cls: "border-amber-400/40 text-amber-300" },
    unconfigured: { label: "No disponible", cls: "border-amber-400/40 text-amber-300" },
    unknown: { label: "Desconocido", cls: "border-white/15 text-white/40" },
  };
  const s = map[status ?? "unknown"] ?? map.unknown;
  return (
    <Badge variant="outline" className={cn("text-[9px]", s.cls)}>
      {s.label}
    </Badge>
  );
}
