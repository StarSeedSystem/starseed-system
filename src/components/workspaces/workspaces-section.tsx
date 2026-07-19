"use client";

/**
 * WorkspacesSection — GESTIÓN COMPLETA de Espacios de Trabajo (Adenda 76 · G2).
 * Contrato con G1: `export function WorkspacesSection()`. Además exporta
 * `WorkspacesCompactList` para la pestaña "Espacios" del Exocórtex.
 *
 * Un espacio agrupa chats + carpetas + archivos (Librería) + memorias + enlaces,
 * con instrucciones (inyectadas al system prompt de sus chats), personalidad
 * FIJA o VARIABLE, preferencias (voz/proveedor) y accesos/permisos (compartir en
 * grupo real vía os_spaces). Estilo Crystal Liquid Glass.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Boxes, Plus, Trash2, Pencil, Share2, ShieldCheck, MessageSquare, FolderOpen, FileText,
  Brain, Link2, Sparkles, Check, X, ExternalLink, Save, ChevronLeft, Mic, MicOff, Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspaces, type Workspace, type WorkspaceConfigExtra } from "@/lib/workspaces/workspaces";
import { normalizeAccess, grantCount } from "@/lib/workspaces/workspace-sharing";
import { WorkspaceAccessDialog } from "@/components/workspaces/workspace-access-dialog";
import { useAiConversations } from "@/lib/aurora/conversations";
import { useChatFolders } from "@/lib/aurora/chat-folders-store";
import { useSavedLibrary } from "@/lib/library-store";
import { listMemories, type MemoryDoc } from "@/lib/memory-vault";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";

const ICONS = ["🗂️", "🚀", "🧠", "🎨", "⚙️", "🌌", "📚", "🛠️", "💡", "🔭", "🌱", "🪐"];

function personalityName(id?: string | null): string | null {
  if (!id) return null;
  try {
    return listPersonalityProfiles().find((p) => p.id === id)?.name ?? null;
  } catch {
    return null;
  }
}

/* ═══════════════════════════ Sección principal ═══════════════════════════ */

export function WorkspacesSection() {
  const { workspaces, loading, create, update, remove } = useWorkspaces();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [accessId, setAccessId] = useState<string | null>(null);

  const editing = useMemo(
    () => (editingId ? workspaces.find((w) => w.id === editingId) ?? null : null),
    [editingId, workspaces],
  );

  if (creating) {
    return <WorkspaceEditor onBack={() => setCreating(false)} onCreate={create} />;
  }
  if (editing) {
    return (
      <>
        <WorkspaceEditor
          workspace={editing}
          onBack={() => setEditingId(null)}
          onUpdate={update}
          onDelete={async (id) => {
            await remove(id);
            setEditingId(null);
          }}
          onShare={() => setAccessId(editing.id)}
        />
        {accessId && (
          <WorkspaceAccessDialog
            open
            onClose={() => setAccessId(null)}
            target={{ kind: "workspace", id: accessId, title: editing.name }}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Boxes className="h-4 w-4 text-violet-300" />
        <h3 className="flex-1 text-sm font-light text-white/90">Espacios de trabajo</h3>
        <Button size="sm" className="h-8 gap-1.5 text-[11px]" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" /> Nuevo espacio
        </Button>
      </div>

      {loading && workspaces.length === 0 ? (
        <p className="rounded-xl border border-white/5 px-3 py-6 text-center text-[11px] text-white/35">Cargando espacios…</p>
      ) : workspaces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
          <Boxes className="mx-auto mb-2 h-6 w-6 text-white/20" />
          <p className="text-[12px] text-white/50">Aún no tienes espacios de trabajo.</p>
          <p className="mt-1 text-[11px] text-white/35">
            Agrupa chats, carpetas, archivos y memorias bajo un mismo contexto con instrucciones y personalidad propias.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {workspaces.map((w) => (
            <WorkspaceCard
              key={w.id}
              ws={w}
              onOpen={() => setEditingId(w.id)}
              onShare={() => setAccessId(w.id)}
            />
          ))}
        </div>
      )}

      {accessId && !editing && (
        <WorkspaceAccessDialog
          open
          onClose={() => setAccessId(null)}
          target={{ kind: "workspace", id: accessId, title: workspaces.find((w) => w.id === accessId)?.name }}
        />
      )}
    </div>
  );
}

function WorkspaceCard({ ws, onOpen, onShare }: { ws: Workspace; onOpen: () => void; onShare: () => void }) {
  const access = normalizeAccess(ws.access);
  const shared = grantCount(access);
  const pers = ws.personalityMode === "fija" ? personalityName(ws.personalityId) : null;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-violet-600/15 via-white/[0.02] to-black/40 p-3 backdrop-blur-xl transition hover:border-violet-400/40">
      <button onClick={onOpen} className="block w-full text-left cursor-pointer">
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none">{ws.icon || "🗂️"}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white/90">{ws.name}</div>
            {ws.description && <div className="truncate text-[11px] text-white/45">{ws.description}</div>}
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1 text-[10px] text-white/50">
          <Counter icon={MessageSquare} n={ws.chatIds.length} label="chats" />
          <Counter icon={FolderOpen} n={ws.folderIds.length} label="folders" />
          <Counter icon={FileText} n={ws.fileRefs.length} label="archivos" />
          <Counter icon={Brain} n={ws.memoryIds.length} label="memorias" />
          <Counter icon={Link2} n={ws.links.length} label="enlaces" />
        </div>
        {(pers || shared > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {pers && (
              <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] text-fuchsia-200">
                <Sparkles className="h-2.5 w-2.5" /> {pers} (fija)
              </span>
            )}
            {shared > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] text-cyan-200">
                <Users className="h-2.5 w-2.5" /> Compartido con {shared}
              </span>
            )}
          </div>
        )}
      </button>
      <div className="mt-2 flex items-center gap-1 border-t border-white/5 pt-2">
        <button onClick={onOpen} className="flex-1 rounded-md px-2 py-1 text-[11px] text-white/60 hover:bg-white/10 cursor-pointer">
          <Pencil className="mr-1 inline h-3 w-3" /> Configurar
        </button>
        <button onClick={onShare} className="rounded-md px-2 py-1 text-[11px] text-cyan-200/70 hover:bg-cyan-500/10 cursor-pointer">
          <Share2 className="mr-1 inline h-3 w-3" /> Compartir
        </button>
      </div>
    </div>
  );
}

function Counter({ icon: Icon, n, label }: { icon: typeof Boxes; n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-white/5 px-1.5 py-0.5" title={`${n} ${label}`}>
      <Icon className="h-2.5 w-2.5" /> {n}
    </span>
  );
}

/* ═══════════════════════════ Editor (crear / configurar) ═══════════════════════════ */

function WorkspaceEditor({
  workspace, onBack, onCreate, onUpdate, onDelete, onShare,
}: {
  workspace?: Workspace;
  onBack: () => void;
  onCreate?: (input: {
    name: string; icon?: string; description?: string; instructions?: string;
    personalityId?: string | null; personalityMode?: "fija" | "variable";
    chatIds?: string[]; folderIds?: string[]; fileRefs?: string[]; memoryIds?: string[];
    links?: { label: string; url: string }[]; config?: Record<string, unknown>;
  }) => Promise<Workspace>;
  onUpdate?: (id: string, patch: Partial<Workspace>) => Promise<Workspace | null>;
  onDelete?: (id: string) => Promise<void>;
  onShare?: () => void;
}) {
  const isNew = !workspace;
  const [name, setName] = useState(workspace?.name ?? "");
  const [icon, setIcon] = useState(workspace?.icon ?? "🗂️");
  const [description, setDescription] = useState(workspace?.description ?? "");
  const [instructions, setInstructions] = useState(workspace?.instructions ?? "");
  const [personalityId, setPersonalityId] = useState<string | null>(workspace?.personalityId ?? null);
  const [personalityMode, setPersonalityMode] = useState<"fija" | "variable">(workspace?.personalityMode ?? "variable");
  const [chatIds, setChatIds] = useState<string[]>(workspace?.chatIds ?? []);
  const [folderIds, setFolderIds] = useState<string[]>(workspace?.folderIds ?? []);
  const [fileRefs, setFileRefs] = useState<string[]>(workspace?.fileRefs ?? []);
  const [memoryIds, setMemoryIds] = useState<string[]>(workspace?.memoryIds ?? []);
  const [links, setLinks] = useState<{ label: string; url: string }[]>(workspace?.links ?? []);
  const cfg = (workspace?.config ?? {}) as WorkspaceConfigExtra;
  const [voice, setVoice] = useState<boolean>(cfg.voice !== false);
  const [busy, setBusy] = useState(false);

  const { conversations } = useAiConversations();
  const { folders } = useChatFolders();
  const { items: libItems } = useSavedLibrary();
  const [memories, setMemories] = useState<MemoryDoc[]>([]);
  useEffect(() => {
    try { setMemories(listMemories()); } catch { setMemories([]); }
  }, []);
  const personalities = useMemo(() => {
    try { return listPersonalityProfiles().map((p) => ({ id: p.id, name: p.name })); } catch { return []; }
  }, []);

  const toggle = (arr: string[], setArr: (v: string[]) => void, id: string) => {
    setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };

  const buildConfig = (): Record<string, unknown> => ({ ...cfg, voice });

  const save = async () => {
    const clean = name.trim();
    if (!clean) {
      toast.error("Ponle un nombre al espacio");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: clean,
        icon,
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        personalityId,
        personalityMode,
        chatIds,
        folderIds,
        fileRefs,
        memoryIds,
        links,
        config: buildConfig(),
      };
      if (isNew && onCreate) {
        await onCreate(payload);
        toast.success(`Espacio «${clean}» creado`);
      } else if (workspace && onUpdate) {
        await onUpdate(workspace.id, payload);
        toast.success("Espacio guardado");
      }
      onBack();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white cursor-pointer">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="flex-1 text-sm font-light text-white/90">{isNew ? "Nuevo espacio" : "Configurar espacio"}</h3>
        {!isNew && onShare && (
          <button onClick={onShare} className="rounded-md px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/10 cursor-pointer">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> Accesos
          </button>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
        {/* Identidad */}
        <div className="flex gap-2">
          <div className="flex flex-col items-center gap-1">
            <span className="text-3xl">{icon}</span>
            <div className="flex max-w-[7rem] flex-wrap justify-center gap-0.5">
              {ICONS.map((e) => (
                <button
                  key={e}
                  onClick={() => setIcon(e)}
                  className={cn("rounded p-0.5 text-sm hover:bg-white/10 cursor-pointer", icon === e && "bg-white/15")}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del espacio" className="h-8 border-white/10 bg-black/40 text-sm" />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción (opcional)" className="h-8 border-white/10 bg-black/40 text-xs" />
          </div>
        </div>

        {/* Instrucciones (se inyectan al system prompt de los chats del espacio) */}
        <Field label="Instrucciones del espacio" hint="Se inyectan al system prompt de los chats de este espacio.">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Ej.: Responde siempre citando la Constitución StarSeed y prioriza fuentes internas…"
            rows={3}
            className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-violet-400/40"
          />
        </Field>

        {/* Personalidad */}
        <Field label="Personalidad">
          <div className="flex items-center gap-1.5">
            <select
              value={personalityId ?? ""}
              onChange={(e) => setPersonalityId(e.target.value || null)}
              className="h-8 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-white outline-none"
            >
              <option value="" className="bg-black">Sin fijar (sugerida)</option>
              {personalities.map((p) => (
                <option key={p.id} value={p.id} className="bg-black">{p.name}</option>
              ))}
            </select>
            <div className="flex rounded-lg border border-white/10 p-0.5">
              {(["variable", "fija"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPersonalityMode(m)}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] capitalize cursor-pointer",
                    personalityMode === m ? "bg-fuchsia-500/20 text-fuchsia-100" : "text-white/45 hover:text-white/70",
                  )}
                  title={m === "fija" ? "Fuerza esta personalidad en los chats del espacio" : "Solo sugerida como preferida"}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </Field>

        {/* Preferencias */}
        <Field label="Preferencias por defecto">
          <button
            onClick={() => setVoice((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer",
              voice ? "border-emerald-400/30 text-emerald-100" : "border-white/10 text-white/50",
            )}
          >
            {voice ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
            Voz {voice ? "activada" : "desactivada"} por defecto
          </button>
        </Field>

        {/* Adjuntos */}
        <PickerBlock
          icon={MessageSquare}
          label="Chats"
          empty="No hay chats."
          items={conversations.map((c) => ({ id: c.id, label: c.title }))}
          selected={chatIds}
          onToggle={(id) => toggle(chatIds, setChatIds, id)}
        />
        <PickerBlock
          icon={FolderOpen}
          label="Carpetas"
          empty="No hay carpetas."
          items={folders.map((f) => ({ id: f.id, label: f.name }))}
          selected={folderIds}
          onToggle={(id) => toggle(folderIds, setFolderIds, id)}
        />
        <PickerBlock
          icon={FileText}
          label="Archivos (Librería)"
          empty="No hay archivos guardados en la Librería."
          items={libItems.map((it) => ({ id: it.id, label: it.title }))}
          selected={fileRefs}
          onToggle={(id) => toggle(fileRefs, setFileRefs, id)}
        />
        <PickerBlock
          icon={Brain}
          label="Memorias"
          empty="No hay memorias en la Bóveda."
          items={memories.map((m) => ({ id: m.id, label: m.name }))}
          selected={memoryIds}
          onToggle={(id) => toggle(memoryIds, setMemoryIds, id)}
        />

        {/* Enlaces */}
        <LinksEditor links={links} setLinks={setLinks} />
      </div>

      <div className="flex items-center gap-2">
        {!isNew && onDelete && workspace && (
          <button
            onClick={() => {
              if (typeof window === "undefined" || window.confirm(`¿Eliminar el espacio «${workspace.name}»?`)) void onDelete(workspace.id);
            }}
            className="rounded-lg px-2.5 py-2 text-[11px] text-rose-300 hover:bg-rose-500/10 cursor-pointer"
          >
            <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Eliminar
          </button>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onBack}>
          Cancelar
        </Button>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void save()} disabled={busy}>
          <Save className="h-3.5 w-3.5" /> {isNew ? "Crear espacio" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{label}</span>
        {hint && <span className="text-[10px] text-white/30">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function PickerBlock({
  icon: Icon, label, items, selected, onToggle, empty,
}: {
  icon: typeof Boxes;
  label: string;
  items: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  empty: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-white/70 hover:bg-white/5 cursor-pointer"
      >
        <Icon className="h-3.5 w-3.5 text-violet-300" />
        <span className="flex-1">{label}</span>
        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">{selected.length}</span>
        <span className={cn("text-[10px] text-white/40 transition-transform", open && "rotate-90")}>›</span>
      </button>
      {open && (
        <div className="max-h-40 space-y-0.5 overflow-y-auto border-t border-white/5 p-1.5">
          {items.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-white/30">{empty}</p>
          ) : (
            items.map((it) => {
              const on = selected.includes(it.id);
              return (
                <button
                  key={it.id}
                  onClick={() => onToggle(it.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] cursor-pointer",
                    on ? "bg-violet-500/15 text-white" : "text-white/60 hover:bg-white/5",
                  )}
                >
                  <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded border", on ? "border-violet-400 bg-violet-500/40" : "border-white/20")}>
                    {on && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function LinksEditor({ links, setLinks }: { links: { label: string; url: string }[]; setLinks: (v: { label: string; url: string }[]) => void }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const add = () => {
    const u = url.trim();
    if (!u) return;
    setLinks([...links, { label: label.trim() || u, url: u }]);
    setLabel("");
    setUrl("");
  };
  return (
    <Field label="Enlaces">
      <div className="space-y-1">
        {links.map((l, i) => (
          <div key={`${l.url}-${i}`} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1">
            <Link2 className="h-3 w-3 shrink-0 text-cyan-300" />
            <span className="min-w-0 flex-1 truncate text-[11px] text-white/70">{l.label}</span>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white cursor-pointer">
              <ExternalLink className="h-3 w-3" />
            </a>
            <button onClick={() => setLinks(links.filter((_, j) => j !== i))} className="text-white/30 hover:text-rose-400 cursor-pointer">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Etiqueta" className="h-7 w-24 border-white/10 bg-black/40 text-[11px]" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="https://…"
            className="h-7 flex-1 border-white/10 bg-black/40 text-[11px]"
          />
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={add}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Field>
  );
}

/* ═══════════════════════════ Lista compacta (Exocórtex) ═══════════════════════════ */

export function WorkspacesCompactList({ activeConvId }: { activeConvId?: string | null }) {
  const { workspaces, loading } = useWorkspaces();

  const openAstraura = () => {
    if (typeof window !== "undefined") window.location.href = "/agent?tab=espacios";
  };
  const openFullscreen = () => {
    if (typeof window === "undefined") return;
    window.location.href = activeConvId ? `/agent/chat?id=${encodeURIComponent(activeConvId)}` : "/agent";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-0.5">
        <Boxes className="h-4 w-4 text-violet-300" />
        <span className="flex-1 text-xs font-semibold text-white/80">Espacios de trabajo</span>
        <button onClick={openAstraura} className="rounded-md px-2 py-1 text-[10px] text-violet-200 hover:bg-violet-500/15 cursor-pointer">
          Gestionar en Astraura IA
        </button>
      </div>

      {loading && workspaces.length === 0 ? (
        <p className="axc-card px-3 py-5 text-center text-[11px] text-white/35">Cargando espacios…</p>
      ) : workspaces.length === 0 ? (
        <div className="axc-card px-3 py-6 text-center text-[11px] leading-relaxed text-white/40">
          Aún no hay espacios. Créalos en Astraura IA para agrupar chats, carpetas, archivos y memorias con
          instrucciones y personalidad propias.
          <div className="mt-2">
            <button onClick={openAstraura} className="rounded-lg border border-violet-400/40 px-2.5 py-1 text-[11px] text-violet-100 hover:bg-violet-500/15 cursor-pointer">
              <ExternalLink className="mr-1 inline h-3 w-3" /> Abrir en Astraura IA
            </button>
          </div>
        </div>
      ) : (
        workspaces.map((w) => {
          const pers = w.personalityMode === "fija" ? personalityName(w.personalityId) : null;
          const shared = grantCount(normalizeAccess(w.access));
          return (
            <div key={w.id} className="axc-card overflow-hidden p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xl leading-none">{w.icon || "🗂️"}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-white/90">{w.name}</div>
                  <div className="truncate text-[10px] text-white/45">
                    {w.chatIds.length} chats · {w.folderIds.length} folders · {w.fileRefs.length} archivos · {w.memoryIds.length} memorias
                  </div>
                </div>
              </div>
              {(pers || shared > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {pers && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] text-fuchsia-200">
                      <Sparkles className="h-2.5 w-2.5" /> {pers} (fija)
                    </span>
                  )}
                  {shared > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[9px] text-cyan-200">
                      <Users className="h-2.5 w-2.5" /> {shared}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  onClick={openAstraura}
                  className="flex-1 rounded-md border border-violet-400/30 px-2 py-1 text-[10px] text-violet-100 hover:bg-violet-500/15 cursor-pointer"
                >
                  <ExternalLink className="mr-1 inline h-3 w-3" /> Abrir en Astraura IA
                </button>
                <button
                  onClick={openFullscreen}
                  className="rounded-md border border-white/15 px-2 py-1 text-[10px] text-white/60 hover:bg-white/10 cursor-pointer"
                  title="Abrir el chat activo en pantalla completa"
                >
                  Pantalla completa
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default WorkspacesSection;
