"use client";

// src/components/canvas/work-centers.tsx
// StarSeed · /pizarras — Hub de CENTROS DE TRABAJO INFINITOS.
// Lista, crea, renombra y elimina centros; cada uno agrupa múltiples lienzos
// (pizarras) que se pueden añadir/quitar. Asignación a folder, exportar (JSON),
// compartir (toggle + referencia), guardar en biblioteca (vault/memoria) y
// abrir un lienzo en el tablero. Rejilla estilo dashboards. SSR-safe.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Pencil,
  X,
  Share2,
  Download,
  FolderInput,
  Library,
  Layers,
  LayoutGrid,
  ExternalLink,
  Brain,
  Network,
  Send,
  ChevronRight,
  Folder,
  PanelsTopLeft,
} from "lucide-react";
import {
  listCanvases,
  summarizeCanvas,
  type Canvas,
} from "@/lib/canvas/canvas";
import {
  listWorkCenters,
  saveWorkCenter,
  deleteWorkCenter,
  newWorkCenter,
  addCanvasToCenter,
  removeCanvasFromCenter,
  downloadWorkCenter,
  shareWorkCenter,
  saveWorkCenterToLibrary,
  publishWorkCenterAsPost,
  VIEW_MODES,
  VIEW_MODE_LABELS,
  type WorkCenter,
  type ViewMode,
} from "@/lib/canvas/workcenters";

const VIEW_ICONS: Record<ViewMode, React.ComponentType<{ className?: string }>> = {
  libre: LayoutGrid,
  "mapa-mental": Network,
  cerebro: Brain,
};

export default function WorkCenters() {
  const [userId, setUserId] = useState<string | null>(null);
  const [centers, setCenters] = useState<WorkCenter[]>([]);
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [folderFilter, setFolderFilter] = useState<string | null>(null);

  const canvasById = useMemo(() => new Map(canvases.map((c) => [c.id, c])), [canvases]);

  // ---- carga inicial -------------------------------------------------------
  const refresh = useCallback(async () => {
    const [wcs, cs] = await Promise.all([listWorkCenters(), listCanvases()]);
    setCenters(wcs);
    setCanvases(cs);
    return { wcs, cs };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        if (alive) setUserId(data?.user?.id ?? null);
      } catch {
        /* */
      }
      await refresh();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  // Folders existentes (para el filtro superior).
  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const wc of centers) if (wc.folder) set.add(wc.folder);
    return [...set].sort();
  }, [centers]);

  const visibleCenters = useMemo(
    () => (folderFilter ? centers.filter((wc) => wc.folder === folderFilter) : centers),
    [centers, folderFilter],
  );

  // ---- crear / renombrar / borrar -----------------------------------------
  async function handleCreate() {
    const name = newName.trim() || "Centro de trabajo";
    const persisted = await saveWorkCenter(newWorkCenter(name, folderFilter));
    setCreating(false);
    setNewName("");
    if (persisted) {
      toast.success("Centro de trabajo creado");
      setCenters((cur) => [persisted, ...cur]);
    } else {
      toast.error("No se pudo crear (¿sesión iniciada?)");
    }
  }

  function startRename(wc: WorkCenter) {
    setRenamingId(wc.id);
    setRenameDraft(wc.name);
  }

  async function commitRename(wc: WorkCenter) {
    const name = renameDraft.trim() || wc.name;
    setRenamingId(null);
    if (name === wc.name) return;
    const saved = await saveWorkCenter({ ...wc, name });
    if (saved) setCenters((cur) => cur.map((c) => (c.id === saved.id ? saved : c)));
  }

  async function handleDelete(wc: WorkCenter) {
    const ok = await deleteWorkCenter(wc.id);
    if (ok) {
      toast.success("Centro eliminado");
      setCenters((cur) => cur.filter((c) => c.id !== wc.id));
    } else {
      toast.error("No se pudo eliminar");
    }
  }

  // ---- adjuntar / quitar lienzos ------------------------------------------
  async function handleAddCanvas(wc: WorkCenter, canvasId: string) {
    const saved = await addCanvasToCenter(wc, canvasId);
    if (saved) setCenters((cur) => cur.map((c) => (c.id === saved.id ? saved : c)));
  }

  async function handleRemoveCanvas(wc: WorkCenter, canvasId: string) {
    const saved = await removeCanvasFromCenter(wc, canvasId);
    if (saved) setCenters((cur) => cur.map((c) => (c.id === saved.id ? saved : c)));
  }

  // ---- folder -------------------------------------------------------------
  async function assignFolder(wc: WorkCenter) {
    const next = typeof window !== "undefined" ? window.prompt("Folder del centro", wc.folder ?? "") : null;
    if (next === null) return;
    const folder = next.trim() || null;
    const saved = await saveWorkCenter({ ...wc, folder });
    if (saved) {
      setCenters((cur) => cur.map((c) => (c.id === saved.id ? saved : c)));
      toast.success(folder ? `Movido a «${folder}»` : "Folder quitado");
    }
  }

  // ---- vista ---------------------------------------------------------------
  async function cycleView(wc: WorkCenter) {
    const idx = VIEW_MODES.indexOf(wc.view.mode);
    const mode = VIEW_MODES[(idx + 1) % VIEW_MODES.length];
    const saved = await saveWorkCenter({ ...wc, view: { ...wc.view, mode } });
    if (saved) {
      setCenters((cur) => cur.map((c) => (c.id === saved.id ? saved : c)));
      toast.message(`Vista: ${VIEW_MODE_LABELS[mode]}`);
    }
  }

  // ---- exportar / compartir / biblioteca / publicar -----------------------
  function handleExport(wc: WorkCenter) {
    const ok = downloadWorkCenter(wc, canvases);
    if (ok) toast.success("Exportado (JSON)");
    else toast.error("No se pudo exportar");
  }

  async function handleShareToggle(wc: WorkCenter, v: boolean) {
    if (v) {
      const { ref, saved } = await shareWorkCenter(wc, canvases);
      if (saved) setCenters((cur) => cur.map((c) => (c.id === saved.id ? saved : c)));
      const text = JSON.stringify(ref);
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(text);
          toast.success("Compartido · referencia copiada para adjuntar");
        } else {
          toast.message("Referencia de adjunto", { description: text });
        }
      } catch {
        toast.message("Referencia de adjunto", { description: text });
      }
    } else {
      const saved = await saveWorkCenter({ ...wc, shared: false });
      if (saved) setCenters((cur) => cur.map((c) => (c.id === saved.id ? saved : c)));
      toast.message("Compartir desactivado");
    }
  }

  async function handleLibrary(wc: WorkCenter) {
    const { ok, ref, detail } = await saveWorkCenterToLibrary(wc, canvases);
    if (ok) toast.success(detail);
    else {
      const text = JSON.stringify(ref);
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) await navigator.clipboard.writeText(text);
      } catch {
        /* */
      }
      toast.message(detail, { description: "Referencia copiada." });
    }
  }

  async function handlePublish(wc: WorkCenter) {
    const res = await publishWorkCenterAsPost(wc, canvases, { visibility: "public" });
    if (res.ok) toast.success("Centro publicado como post");
    else toast.error(res.detail);
  }

  // ---- render --------------------------------------------------------------
  return (
    <div className="space-y-5">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-fuchsia-500 to-amber-500 flex items-center justify-center shrink-0">
            <PanelsTopLeft className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-amber-50">Centros de trabajo</div>
            <div className="text-[11px] text-white/40">
              {centers.length} centro{centers.length === 1 ? "" : "s"} · {canvases.length} pizarra{canvases.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Link href="/pizarra">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 border-white/15 text-white/80">
              <Layers className="w-3.5 h-3.5" /> Abrir tablero
            </Button>
          </Link>
          {creating ? (
            <span className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="Nombre del centro…"
                className="h-8 w-48 bg-white/5 text-xs"
              />
              <Button size="sm" className="h-8 bg-fuchsia-600 hover:bg-fuchsia-500 text-white" onClick={handleCreate}>
                Crear
              </Button>
            </span>
          ) : (
            <Button size="sm" className="gap-1.5 h-8 bg-fuchsia-600 hover:bg-fuchsia-500 text-white" onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5" /> Nuevo centro
            </Button>
          )}
        </div>
      </div>

      {/* Filtro de folders */}
      {folders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFolderFilter(null)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]",
              folderFilter === null ? "border-fuchsia-500/40 bg-fuchsia-600/15 text-fuchsia-100" : "border-white/10 text-white/55 hover:bg-white/5",
            )}
          >
            <LayoutGrid className="w-3 h-3" /> Todas
          </button>
          {folders.map((f) => (
            <button
              key={f}
              onClick={() => setFolderFilter(f)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]",
                folderFilter === f ? "border-fuchsia-500/40 bg-fuchsia-600/15 text-fuchsia-100" : "border-white/10 text-white/55 hover:bg-white/5",
              )}
            >
              <Folder className="w-3 h-3" /> {f}
            </button>
          ))}
        </div>
      )}

      {/* Estados vacíos */}
      {!userId && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-3 text-[12px] text-amber-100/80">
          Inicia sesión para crear y guardar centros de trabajo persistentes.
        </div>
      )}

      {loading ? (
        <div className="text-sm text-white/40">Cargando centros…</div>
      ) : visibleCenters.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-zinc-950/40 px-6 py-12 text-center">
          <PanelsTopLeft className="w-10 h-10 text-fuchsia-400/40 mx-auto mb-3" />
          <p className="text-sm text-white/55">
            Aún no hay centros de trabajo. Crea uno para agrupar varias pizarras como un{" "}
            <span className="text-fuchsia-200">centro infinito</span>: exportable, compartible y organizable en folders, con vista{" "}
            <span className="text-fuchsia-200">mapa mental</span> o <span className="text-fuchsia-200">cerebro</span>.
          </p>
        </div>
      ) : (
        // Rejilla estilo dashboards
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleCenters.map((wc) => (
            <WorkCenterCard
              key={wc.id}
              wc={wc}
              canvases={canvases}
              canvasById={canvasById}
              isRenaming={renamingId === wc.id}
              renameDraft={renameDraft}
              onRenameDraft={setRenameDraft}
              onStartRename={() => startRename(wc)}
              onCommitRename={() => commitRename(wc)}
              onCancelRename={() => setRenamingId(null)}
              onDelete={() => handleDelete(wc)}
              onAddCanvas={(id) => handleAddCanvas(wc, id)}
              onRemoveCanvas={(id) => handleRemoveCanvas(wc, id)}
              onAssignFolder={() => assignFolder(wc)}
              onCycleView={() => cycleView(wc)}
              onExport={() => handleExport(wc)}
              onShareToggle={(v) => handleShareToggle(wc, v)}
              onLibrary={() => handleLibrary(wc)}
              onPublish={() => handlePublish(wc)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Tarjeta de un centro de trabajo
// =============================================================================

function WorkCenterCard({
  wc,
  canvases,
  canvasById,
  isRenaming,
  renameDraft,
  onRenameDraft,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  onAddCanvas,
  onRemoveCanvas,
  onAssignFolder,
  onCycleView,
  onExport,
  onShareToggle,
  onLibrary,
  onPublish,
}: {
  wc: WorkCenter;
  canvases: Canvas[];
  canvasById: Map<string, Canvas>;
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraft: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onAddCanvas: (canvasId: string) => void;
  onRemoveCanvas: (canvasId: string) => void;
  onAssignFolder: () => void;
  onCycleView: () => void;
  onExport: () => void;
  onShareToggle: (v: boolean) => void;
  onLibrary: () => void;
  onPublish: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const ViewIcon = VIEW_ICONS[wc.view.mode] ?? LayoutGrid;

  const members = wc.canvas_ids
    .map((id) => canvasById.get(id))
    .filter((c): c is Canvas => !!c);
  const available = canvases.filter((c) => !wc.canvas_ids.includes(c.id));

  return (
    <div className="rounded-2xl border border-fuchsia-500/15 bg-fuchsia-950/[0.07] p-3.5 flex flex-col gap-3 hover:border-fuchsia-500/30 transition-colors">
      {/* Cabecera */}
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-fuchsia-500/80 to-amber-500/80 flex items-center justify-center shrink-0">
          <PanelsTopLeft className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <Input
              autoFocus
              value={renameDraft}
              onChange={(e) => onRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitRename();
                if (e.key === "Escape") onCancelRename();
              }}
              onBlur={onCommitRename}
              className="h-7 bg-white/5 text-xs"
            />
          ) : (
            <button onClick={onStartRename} className="group flex items-center gap-1.5 text-left min-w-0">
              <span className="text-sm font-semibold text-amber-50 truncate">{wc.name}</span>
              <Pencil className="w-3 h-3 text-white/25 group-hover:text-fuchsia-300 shrink-0" />
            </button>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[9px] border-fuchsia-500/30 text-fuchsia-200/70">
              {members.length} pizarra{members.length === 1 ? "" : "s"}
            </Badge>
            {wc.folder && (
              <span className="inline-flex items-center gap-1 text-[10px] text-white/40">
                <Folder className="w-3 h-3" /> {wc.folder}
              </span>
            )}
            {wc.shared && <Badge className="text-[9px] bg-emerald-600/20 text-emerald-200 border-0">compartido</Badge>}
          </div>
        </div>
        <button onClick={onDelete} className="text-white/25 hover:text-red-400 shrink-0" title="Eliminar centro">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Vista + compartir */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onCycleView}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/70 hover:bg-white/5"
          title="Cambiar modo de vista"
        >
          <ViewIcon className="w-3.5 h-3.5 text-fuchsia-300" /> {VIEW_MODE_LABELS[wc.view.mode]}
        </button>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1">
          <Share2 className="w-3.5 h-3.5 text-amber-300/70" />
          <span className="text-[10px] text-white/55">Compartir</span>
          <Switch checked={wc.shared} onCheckedChange={onShareToggle} />
        </span>
      </div>

      {/* Pizarras del centro */}
      <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-1.5 min-h-[68px]">
        {members.length === 0 ? (
          <div className="px-2 py-3 text-[11px] text-white/30 italic text-center">
            Sin pizarras. Añade una para empezar este centro.
          </div>
        ) : (
          <div className="space-y-1 max-h-44 overflow-auto">
            {members.map((c) => (
              <div key={c.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                <Layers className="w-3.5 h-3.5 text-fuchsia-300 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-white/85 truncate">{c.title}</span>
                  <span className="block text-[9px] text-white/35 truncate">{summarizeCanvas(c)}</span>
                </span>
                <Link
                  href={`/pizarra?canvas=${encodeURIComponent(c.id)}`}
                  className="text-white/30 hover:text-fuchsia-300 shrink-0"
                  title="Abrir en el tablero"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
                <button
                  onClick={() => onRemoveCanvas(c.id)}
                  className="text-white/25 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100"
                  title="Quitar del centro"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Añadir pizarra */}
      <div className="relative">
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 h-8 border-fuchsia-500/25 text-fuchsia-100"
          onClick={() => setAdding((s) => !s)}
        >
          <Plus className="w-3.5 h-3.5" /> Añadir pizarra
        </Button>
        {adding && (
          <div className="absolute left-0 right-0 top-9 z-30 rounded-lg border border-white/10 bg-zinc-950/95 backdrop-blur p-1.5 shadow-xl max-h-56 overflow-auto">
            {available.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-white/40">
                No hay más pizarras disponibles.{" "}
                <Link href="/pizarra" className="text-fuchsia-300 hover:underline">
                  Crea una
                </Link>
                .
              </div>
            ) : (
              available.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onAddCanvas(c.id);
                    setAdding(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-white/5 flex items-center gap-2"
                >
                  <Layers className="w-3.5 h-3.5 text-fuchsia-300 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-white/85 truncate">{c.title}</span>
                    <span className="block text-[9px] text-white/35 truncate">{summarizeCanvas(c)}</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-white/25 shrink-0" />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="outline" className="gap-1.5 h-8 border-white/15 text-white/75" onClick={onExport}>
          <Download className="w-3.5 h-3.5" /> Exportar
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 h-8 border-white/15 text-white/75" onClick={onAssignFolder}>
          <FolderInput className="w-3.5 h-3.5" /> Folder
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 h-8 border-amber-500/30 text-amber-100" onClick={onLibrary}>
          <Library className="w-3.5 h-3.5" /> Biblioteca
        </Button>
        <Button size="sm" className="gap-1.5 h-8 bg-amber-600 hover:bg-amber-500 text-white" onClick={onPublish}>
          <Send className="w-3.5 h-3.5" /> Publicar
        </Button>
      </div>
    </div>
  );
}
