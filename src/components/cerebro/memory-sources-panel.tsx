"use client";

/**
 * CEREBRO · FUENTES DE MEMORIA (Adenda I2 · tarea 3).
 * ============================================================================
 * Sub-sección del pilar Memoria: gestiona las FUENTES de memoria de un cerebro.
 *
 *   1. Fuente OS (predeterminada · funcional) — Supabase brain_memory_files +
 *      memories. Siempre presente; no se puede quitar.
 *   2. Obsidian — vía el backend de almacenamiento GitHub-bridge existente
 *      (storage/backends.ts, kind 'obsidian'), scoped al cerebro.
 *   3. Servidor externo / almacenamiento propio — endpoint registrado como
 *      brain_server (registro) + enlace brain_server_links con rol
 *      'memory-source' y sync {direction, auto}.
 *   4. Carpeta memory_root — importación real (MemoryFolderConnect · tarea 5).
 *
 * Además: PERMISOS por rama/fuente (includes.permissions con niveles
 * lectura/escritura/admin; el acceso PARCIAL por ramas usa AccessGrant.sections
 * vía «Compartir») y un resumen de SINCRONIZACIÓN con neuronas/servidores,
 * páginas/grupos (scope), programas (ability_links) y cuentas (includes.tokens).
 *
 * Todo Supabase-backed + defensivo. SIN DDL.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Database,
  Server,
  FolderSync,
  ShieldCheck,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Cpu,
  Users,
  FileCode,
  KeyRound,
  BookMarked,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { getBrain, saveBrain, type Brain, type BrainPermission } from "@/lib/brains/brains";
import {
  saveServer,
  deleteServer,
  linkServer,
  unlinkServer,
  serversForBrain,
  SYNC_DIRECTIONS,
  type LinkedServer,
  type SyncDirection,
} from "@/lib/brains/servers";
import { listBackends, saveBackend, deleteBackend, type StorageBackend } from "@/lib/storage/backends";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
import { MemoryFolderConnect } from "@/components/exocortex/memory-folder-connect";
import { OssLibraryBrowser } from "@/components/settings/ai/oss-library-browser";

const PERM_LEVELS: BrainPermission["level"][] = ["lectura", "escritura", "admin"];

export default function MemorySourcesPanel({
  brainId,
  brainName,
}: {
  brainId: string | null;
  brainName?: string;
}) {
  const [brain, setBrain] = useState<Brain | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<{ files: number; memories: number }>({ files: 0, memories: 0 });
  const [obsidian, setObsidian] = useState<StorageBackend[]>([]);
  const [linked, setLinked] = useState<LinkedServer[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const b = brainId ? await getBrain(brainId) : null;
      setBrain(b);
      const files = await listMemoryFiles(brainId);
      let mem = 0;
      try {
        const sb = createClient();
        const { data: au } = await sb.auth.getUser();
        const uid = au?.user?.id;
        if (uid && brainId) {
          const { count } = await sb
            .from("memories")
            .select("id", { count: "exact", head: true })
            .eq("owner", uid)
            .eq("scope", "brain")
            .eq("scope_ref", brainId);
          mem = count ?? 0;
        }
      } catch { /* opcional */ }
      setCounts({ files: files.length, memories: mem });
      if (brainId) {
        const backs = await listBackends("brain", brainId);
        setObsidian(backs.filter((x) => x.kind === "obsidian"));
        setLinked(await serversForBrain(brainId));
      } else {
        setObsidian([]);
        setLinked([]);
      }
    } finally {
      setLoading(false);
    }
  }, [brainId]);

  useEffect(() => { void reload(); }, [reload]);

  if (!brainId) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-sm text-white/55">
        Selecciona o crea un cerebro para gestionar sus fuentes de memoria.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OsSourceCard files={counts.files} memories={counts.memories} loading={loading} />
      <ObsidianCard brainId={brainId} obsidian={obsidian} onChanged={reload} />
      <ExternalServerCard brainId={brainId} linked={linked} onChanged={reload} />
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <FolderSync className="w-4 h-4 text-fuchsia-300" />
          <span className="text-sm font-semibold text-fuchsia-50">Carpeta memory_root</span>
          <Badge variant="outline" className="ml-auto border-white/15 text-white/50 text-[10px]">importación real</Badge>
        </div>
        <p className="text-[11px] text-white/50">Importa una carpeta de memorias del disco a este cerebro (ramas → archivos .md), con conflicto por «updated».</p>
        <MemoryFolderConnect brainId={brainId} brainName={brainName} onImported={reload} />
      </div>
      <PermissionsCard brain={brain} onSaved={reload} />
      <SyncSummaryCard brain={brain} linked={linked} />
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <BookMarked className="w-4 h-4 text-emerald-300" />
          <span className="text-sm font-semibold text-emerald-50">Librería: sistemas de memoria de agentes</span>
        </div>
        <p className="text-[11px] text-white/50 mb-2">Backends de memoria (mem0, Letta, Zep/Graphiti, Cognee, memU…) que puedes conectar como fuente de este cerebro o detrás de un memory_root.</p>
        <OssLibraryBrowser category="agent-memory" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fuente OS (predeterminada)                                          */
/* ------------------------------------------------------------------ */

function OsSourceCard({ files, memories, loading }: { files: number; memories: number; loading: boolean }) {
  return (
    <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/10 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Database className="w-4 h-4 text-cyan-300" />
        <span className="text-sm font-semibold text-cyan-50">Fuente OS · Supabase</span>
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px] gap-1">
          <CheckCircle2 className="w-3 h-3" /> predeterminada · funcional
        </Badge>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40 ml-auto" />}
      </div>
      <p className="text-[11px] text-white/55 mt-1.5">
        La memoria del cerebro vive por defecto en la red StarSeed:{" "}
        <span className="font-mono text-white/70">brain_memory_files</span> (archivos .md) +{" "}
        <span className="font-mono text-white/70">memories</span> (Hub). Siempre presente, con RLS y realtime; no se puede quitar.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Badge variant="outline" className="border-white/15 text-white/70 text-[10px]">{files} archivos .md</Badge>
        <Badge variant="outline" className="border-white/15 text-white/70 text-[10px]">{memories} memorias</Badge>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Obsidian (backend GitHub-bridge)                                    */
/* ------------------------------------------------------------------ */

function ObsidianCard({ brainId, obsidian, onChanged }: { brainId: string; obsidian: StorageBackend[]; onChanged: () => void }) {
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [vaultPath, setVaultPath] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const ok = await saveBackend({
      kind: "obsidian",
      name: name.trim(),
      scope: "brain",
      scope_ref: brainId,
      config: { repo: repo.trim(), vaultPath: vaultPath.trim(), bridge: "github" },
    });
    setSaving(false);
    if (ok) { setAdding(false); setName(""); setRepo(""); setVaultPath(""); onChanged(); toast.success("Bóveda Obsidian conectada como fuente."); }
    else toast.error("No se pudo conectar Obsidian.");
  };

  const remove = async (id: string) => {
    if (!(await confirm({ title: "Quitar fuente", description: "¿Quitar esta fuente Obsidian?", destructive: true }))) return;
    if (await deleteBackend(id)) { onChanged(); toast.success("Fuente Obsidian quitada."); }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">🪨</span>
        <span className="text-sm font-semibold text-violet-50">Obsidian (puente GitHub)</span>
        <Button size="sm" variant="outline" className="ml-auto h-7 gap-1.5 text-xs" onClick={() => setAdding((s) => !s)}>
          <Plus className="w-3.5 h-3.5" /> Conectar
        </Button>
      </div>
      <p className="text-[11px] text-white/50">Sincroniza una bóveda Obsidian (markdown) vía repositorio GitHub, reutilizando el backend de almacenamiento del OS.</p>
      {obsidian.length === 0 ? (
        <p className="text-[11px] text-white/40">Sin bóvedas Obsidian conectadas a este cerebro.</p>
      ) : (
        <ul className="space-y-1.5">
          {obsidian.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2">
              <span className="text-xs text-white/80 truncate flex-1">{b.name}</span>
              <Badge variant="outline" className="text-[9px] border-white/15 text-white/50">{String(b.config?.repo || b.config?.vaultPath || "sin ruta")}</Badge>
              <Badge variant="outline" className={cn("text-[9px]", b.enabled ? "border-emerald-500/40 text-emerald-300" : "border-white/15 text-white/40")}>{b.enabled ? "activa" : "pausada"}</Badge>
              <button onClick={() => remove(b.id)} className="text-white/30 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="rounded-lg border border-violet-500/20 bg-black/30 p-3 space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (p.ej. Mi bóveda)" className="h-8 text-sm bg-black/30" />
          <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="Repo GitHub (owner/repo)" className="h-8 text-sm bg-black/30" />
          <Input value={vaultPath} onChange={(e) => setVaultPath(e.target.value)} placeholder="Ruta de la bóveda (opcional)" className="h-8 text-sm bg-black/30" />
          <Button size="sm" className="gap-1.5" disabled={saving || !name.trim()} onClick={add}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Conectar bóveda
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Servidor externo / almacenamiento propio (brain_server_links)       */
/* ------------------------------------------------------------------ */

function ExternalServerCard({ brainId, linked, onChanged }: { brainId: string; linked: LinkedServer[]; onChanged: () => void }) {
  const confirm = useConfirm();
  const memSources = useMemo(() => linked.filter((l) => l.link.role === "memory-source" || l.link.role === "storage"), [linked]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [direction, setDirection] = useState<SyncDirection>("both");
  const [auto, setAuto] = useState(true);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!name.trim() || !endpoint.trim()) return;
    setSaving(true);
    try {
      const srv = await saveServer({ kind: "own", name: name.trim(), endpoint: endpoint.trim(), status: "pendiente", config: { memorySource: true } });
      if (srv?.id) {
        await linkServer(brainId, srv.id, { role: "memory-source", sync: { direction, auto } });
        setAdding(false); setName(""); setEndpoint(""); setDirection("both"); setAuto(true);
        onChanged();
        toast.success("Servidor externo enlazado como fuente de memoria.");
      } else {
        toast.error("No se pudo registrar el servidor.");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (serverId: string) => {
    if (!(await confirm({ title: "Quitar fuente", description: "¿Quitar esta fuente (servidor externo)?", destructive: true }))) return;
    await unlinkServer(brainId, serverId);
    await deleteServer(serverId);
    onChanged();
    toast.success("Fuente externa quitada.");
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Server className="w-4 h-4 text-amber-300" />
        <span className="text-sm font-semibold text-amber-50">Almacenamiento propio / servidor externo</span>
        <Button size="sm" variant="outline" className="ml-auto h-7 gap-1.5 text-xs" onClick={() => setAdding((s) => !s)}>
          <Plus className="w-3.5 h-3.5" /> Añadir
        </Button>
      </div>
      <p className="text-[11px] text-white/50">Un endpoint propio (tu neurona/servidor) como fuente de memoria del cerebro, con dirección de sincronización y modo automático.</p>
      {memSources.length === 0 ? (
        <p className="text-[11px] text-white/40">Sin servidores externos enlazados como fuente.</p>
      ) : (
        <ul className="space-y-1.5">
          {memSources.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2">
              <span className="text-xs text-white/80 truncate flex-1">{s.name}</span>
              <Badge variant="outline" className="text-[9px] border-white/15 text-white/50">{s.endpoint || "sin endpoint"}</Badge>
              <Badge variant="outline" className="text-[9px] border-cyan-500/30 text-cyan-200/80">{SYNC_DIRECTIONS.find((d) => d.id === s.link.sync.direction)?.label ?? "Bidireccional"}{s.link.sync.auto ? " · auto" : ""}</Badge>
              <Badge variant="outline" className={cn("text-[9px]", s.status === "conectado" ? "border-emerald-500/40 text-emerald-300" : "border-white/15 text-white/40")}>{s.status || "pendiente"}</Badge>
              <button onClick={() => remove(s.id)} className="text-white/30 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="rounded-lg border border-amber-500/20 bg-black/30 p-3 space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (p.ej. Mi neurona)" className="h-8 text-sm bg-black/30" />
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="Endpoint (https://tu-neurona:8800/memory)" className="h-8 text-sm bg-black/30" />
          <div className="flex items-center gap-2">
            <select value={direction} onChange={(e) => setDirection(e.target.value as SyncDirection)} className="h-8 flex-1 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-white/85">
              {SYNC_DIRECTIONS.map((d) => <option key={d.id} value={d.id} className="bg-zinc-900">{d.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[11px] text-white/70">
              <Switch checked={auto} onCheckedChange={setAuto} /> auto
            </label>
          </div>
          <Button size="sm" className="gap-1.5" disabled={saving || !name.trim() || !endpoint.trim()} onClick={add}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Enlazar como fuente
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Permisos por rama/fuente (includes.permissions)                     */
/* ------------------------------------------------------------------ */

function PermissionsCard({ brain, onSaved }: { brain: Brain | null; onSaved: () => void }) {
  const perms: BrainPermission[] = Array.isArray(brain?.includes?.permissions) ? (brain!.includes.permissions as BrainPermission[]) : [];
  const [who, setWho] = useState("");
  const [level, setLevel] = useState<BrainPermission["level"]>("lectura");
  const [saving, setSaving] = useState(false);

  const persist = async (next: BrainPermission[]) => {
    if (!brain) return;
    setSaving(true);
    const ok = await saveBrain({ ...brain, includes: { ...brain.includes, permissions: next } });
    setSaving(false);
    if (ok) onSaved(); else toast.error("No se pudieron guardar los permisos.");
  };

  const add = async () => {
    if (!who.trim()) return;
    await persist([...perms.filter((p) => p.who !== who.trim()), { who: who.trim(), level }]);
    setWho("");
  };
  const remove = async (w: string) => persist(perms.filter((p) => p.who !== w));

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-300" />
        <span className="text-sm font-semibold text-emerald-50">Permisos por rama / fuente</span>
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40 ml-auto" />}
      </div>
      <p className="text-[11px] text-white/50">
        Niveles <span className="text-white/70">lectura · escritura · admin</span> por perfil/grupo/página. El acceso PARCIAL por ramas
        (memoria/habilidades/contexto) se concede desde «Compartir» (AccessGrant.sections).
      </p>
      {perms.length === 0 ? (
        <p className="text-[11px] text-white/40">Sin permisos concedidos (privado en lo personal).</p>
      ) : (
        <ul className="space-y-1.5">
          {perms.map((p) => (
            <li key={p.who} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2">
              <span className="text-xs text-white/80 truncate flex-1">{p.who}</span>
              <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-200/80">{p.level}</Badge>
              <button onClick={() => remove(p.who)} className="text-white/30 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input value={who} onChange={(e) => setWho(e.target.value)} placeholder="perfil/grupo/página (id o @usuario)" className="h-8 text-sm bg-black/30" />
        <select value={level} onChange={(e) => setLevel(e.target.value as BrainPermission["level"])} className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-white/85">
          {PERM_LEVELS.map((l) => <option key={l} value={l} className="bg-zinc-900">{l}</option>)}
        </select>
        <Button size="sm" className="gap-1.5 shrink-0" disabled={!who.trim() || !brain} onClick={add}><Plus className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resumen de sincronización con el resto del OS                        */
/* ------------------------------------------------------------------ */

function SyncSummaryCard({ brain, linked }: { brain: Brain | null; linked: LinkedServer[] }) {
  const inc = brain?.includes;
  const scope = brain?.scope ?? "account";
  const scopeRef = brain?.scope_ref ?? null;
  const tokens = Array.isArray(inc?.tokens) ? inc!.tokens.length : 0;
  const connections = Array.isArray(inc?.connections) ? inc!.connections.length : 0;
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <RefreshCw className="w-4 h-4 text-cyan-300" />
        <span className="text-sm font-semibold text-cyan-50">Sincronización con el resto del OS</span>
      </div>
      <p className="text-[11px] text-white/50">Este cerebro y sus fuentes se enlazan con neuronas, páginas/grupos, programas y cuentas conectadas mediante los vínculos ya existentes.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <SyncStat icon={<Cpu className="w-3.5 h-3.5 text-emerald-300" />} label="Neuronas / servidores" value={`${linked.length}`} href="/cerebro" />
        <SyncStat icon={<Users className="w-3.5 h-3.5 text-violet-300" />} label="Ámbito (página/grupo)" value={scope === "account" ? "cuenta" : `${scope}${scopeRef ? " · " + scopeRef.slice(0, 8) : ""}`} />
        <SyncStat icon={<FileCode className="w-3.5 h-3.5 text-amber-300" />} label="Programas / conexiones" value={`${connections}`} href="/cerebro" />
        <SyncStat icon={<KeyRound className="w-3.5 h-3.5 text-fuchsia-300" />} label="Cuentas / tokens" value={`${tokens}`} href="/cerebros" />
      </div>
    </div>
  );
}

function SyncStat({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  const inner = (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2">
      {icon}
      <span className="text-[11px] text-white/70 flex-1">{label}</span>
      <Badge variant="outline" className="text-[10px] border-white/15 text-white/70">{value}</Badge>
    </div>
  );
  return href ? <a href={href} className="hover:opacity-90">{inner}</a> : inner;
}
