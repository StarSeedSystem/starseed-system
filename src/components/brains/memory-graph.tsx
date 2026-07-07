"use client";

/**
 * MemoryGraph — Grafo 2D/3D de memorias por cerebro (Graphify-inspirado).
 * Ver architecture/cerebros-memorias-graphify.md §5. Nodos = memorias
 * (brain_memory_files) coloreadas por TIPO (memory-types.ts); aristas
 * EXTRACTED ([[wiki-links]] resueltos) e INFERRED (mismo cerebro+tipo).
 * Vista 2D (SVG) y 3D (memory-graph-3d.tsx, next/dynamic ssr:false). Clic en
 * un nodo abre un panel de edición simple (tipo, importante, contenido,
 * fusión, ramas). Integra destinos de sync (memory-destinations.ts) y
 * conflictos offline (memory-conflicts-panel.tsx) cuando hay `brainId`.
 *
 * `brainId=null` ⇒ memorias de CUENTA (sin cerebro), mismo significado que en
 * src/lib/cerebro/memory-files.ts.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Network as NetworkIcon,
  Workflow,
  Search as SearchIcon,
  X,
  Save,
  GitBranch,
  GitMerge,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  Star,
  Link2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import { listMemoryFiles, saveMemoryFile, type MemoryFile } from "@/lib/cerebro/memory-files";
import {
  listMemoryTypes,
  memoryTypeById,
  inferMemoryType,
  parseFrontmatter,
  stringifyFrontmatter,
  extractWikiLinks,
  isImportantMemory,
  type MemoryTypeDef,
} from "@/lib/brains/memory-types";
import {
  writeMemoryContentResilient,
  createMemoryBranch,
  downloadBrainMemoryBackup,
  importBrainMemory,
} from "@/lib/brains/memory-offline";
import { getBrain, type Brain } from "@/lib/brains/brains";
import { getMemoryDestinations, syncBrainMemoryNow } from "@/lib/brains/memory-destinations";
import { getBrainMemoryMode, setBrainMemoryMode } from "@/ai/astraura/memory-intelligence";
import MemoryConflictsPanel from "@/components/brains/memory-conflicts-panel";
import type { MemGraphNode, MemGraphEdge } from "@/components/brains/memory-graph-3d";

const MemoryGraph3D = dynamic(() => import("@/components/brains/memory-graph-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-white/60">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparando el grafo 3D…
    </div>
  ),
});

/* ------------------------------------------------------------------ */
/* Construcción del grafo (barata: sin fuerza física, cluster por tipo) */
/* ------------------------------------------------------------------ */

interface BuiltGraph {
  nodes: MemGraphNode[];
  edges: MemGraphEdge[];
  fileById: Map<string, MemoryFile>;
}

function stem(name: string): string {
  return (name || "").replace(/\.md$/i, "").trim().toLowerCase();
}

function buildMemoryGraph(files: MemoryFile[]): BuiltGraph {
  const fileById = new Map(files.map((f) => [f.id, f]));
  const idByStem = new Map(files.map((f) => [stem(f.name), f.id]));
  const edgeKeys = new Set<string>();
  const edges: MemGraphEdge[] = [];

  const addEdge = (a: string, b: string, kind: MemGraphEdge["kind"]) => {
    if (a === b) return;
    const key = [a, b].sort().join("::") + ":" + kind;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source: a, target: b, kind });
  };

  // EXTRACTED: [[wiki-links]] resueltos contra otras memorias del mismo cerebro.
  for (const f of files) {
    for (const link of extractWikiLinks(f.content)) {
      const targetId = idByStem.get(link.trim().toLowerCase());
      if (targetId) addEdge(f.id, targetId, "extracted");
    }
  }

  // INFERRED: mismo tipo (agrupación estructural barata, en anillo — no todos-con-todos).
  const byType = new Map<string, string[]>();
  for (const f of files) {
    const t = inferMemoryType(f.name, f.meta).id;
    const arr = byType.get(t) ?? [];
    arr.push(f.id);
    byType.set(t, arr);
  }
  for (const ids of byType.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) addEdge(ids[i], ids[(i + 1) % ids.length], "inferred");
  }

  // Grado (para tamaño de nodo y "nodos clave").
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  // Layout: clusters en anillo por tipo (barato, legible, sin física).
  const types = [...byType.keys()];
  const nodes: MemGraphNode[] = [];
  types.forEach((typeId, ti) => {
    const ids = byType.get(typeId)!;
    const clusterAngle = types.length <= 1 ? 0 : (ti / types.length) * Math.PI * 2;
    const clusterRadius = Math.max(160, types.length * 40);
    const cx = Math.cos(clusterAngle) * clusterRadius;
    const cz = Math.sin(clusterAngle) * clusterRadius;
    const def = memoryTypeById(typeId);
    ids.forEach((id, i) => {
      const f = fileById.get(id);
      if (!f) return;
      const a = ids.length <= 1 ? 0 : (i / ids.length) * Math.PI * 2;
      const r = 34 + Math.min(ids.length, 12) * 5;
      const pos: [number, number, number] = [
        cx + Math.cos(a) * r,
        ((i % 3) - 1) * 16,
        cz + Math.sin(a) * r,
      ];
      const deg = degree.get(id) ?? 0;
      nodes.push({
        id,
        label: f.name.replace(/\.md$/i, ""),
        typeLabel: def.label,
        color: def.color,
        size: 4 + Math.min(deg, 8) * 0.6,
        position: pos,
        degree: deg,
      });
    });
  });

  return { nodes, edges, fileById };
}

/* ------------------------------------------------------------------ */
/* Vista 2D (SVG, pan/zoom) — reutiliza las MISMAS posiciones (x,z) del 3D    */
/* ------------------------------------------------------------------ */

function Map2DView({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: MemGraphNode[];
  edges: MemGraphEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [scale, setScale] = useState(0.9);
  const [tx, setTx] = useState(340);
  const [ty, setTy] = useState(280);
  const [hover, setHover] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const posById = useMemo(() => new Map(nodes.map((n) => [n.id, { x: n.position[0], y: n.position[2] }])), [nodes]);

  const focusSet = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    for (const e of edges) {
      if (e.source === selectedId) set.add(e.target);
      if (e.target === selectedId) set.add(e.source);
    }
    return set;
  }, [selectedId, edges]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(3, Math.max(0.15, s * (e.deltaY < 0 ? 1.12 : 0.89))));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setTx(dragRef.current.tx + (e.clientX - dragRef.current.x));
    setTy(dragRef.current.ty + (e.clientY - dragRef.current.y));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[#0a0e16]">
      <svg
        className="h-full w-full touch-none"
        style={{ cursor: dragRef.current ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <g transform={`translate(${tx},${ty}) scale(${scale})`}>
          {edges.map((e, i) => {
            const a = posById.get(e.source);
            const b = posById.get(e.target);
            if (!a || !b) return null;
            const hot = !!focusSet && focusSet.has(e.source) && focusSet.has(e.target);
            const dim = !!focusSet && !hot;
            return (
              <line
                key={`e${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={hot ? "#22d3ee" : e.kind === "extracted" ? "#fde68a" : "#ffffff22"}
                strokeWidth={hot ? 2 : e.kind === "extracted" ? 1.4 : 0.8}
                opacity={dim ? 0.08 : e.kind === "extracted" ? 0.75 : 0.35}
              />
            );
          })}
          {nodes.map((n) => {
            const p = posById.get(n.id);
            if (!p) return null;
            const hot = !!focusSet && focusSet.has(n.id);
            const dim = !!focusSet && !hot;
            const isHover = hover === n.id;
            const r = 4 + Math.min(n.degree, 8) * 0.9;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                opacity={dim ? 0.22 : 1}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect(n.id)}
              >
                <circle
                  r={isHover || n.id === selectedId ? r * 1.3 : r}
                  fill={n.color}
                  stroke={n.id === selectedId ? "#fde68a" : "rgba(0,0,0,0.45)"}
                  strokeWidth={n.id === selectedId ? 2.2 : 1}
                />
                {(isHover || hot || scale > 1.1) && (
                  <text
                    x={0}
                    y={-r - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="#f1f5f9"
                    style={{ paintOrder: "stroke", pointerEvents: "none" }}
                    stroke="rgba(8,12,20,0.85)"
                    strokeWidth={3}
                  >
                    {n.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button onClick={() => setScale((s) => Math.min(3, s * 1.2))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur hover:bg-black/70">+</button>
        <button onClick={() => setScale((s) => Math.max(0.15, s * 0.83))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur hover:bg-black/70">−</button>
        <button onClick={() => { setScale(0.9); setTx(340); setTy(280); }} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur hover:bg-black/70" title="Reiniciar vista">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel de edición de la memoria seleccionada                         */
/* ------------------------------------------------------------------ */

function applyFrontmatterPatch(content: string, patch: Record<string, unknown>): string {
  const { data, body } = parseFrontmatter(content);
  return stringifyFrontmatter({ ...data, ...patch }, body);
}

function MemoryInspector({
  file,
  allFiles,
  onClose,
  onChanged,
}: {
  file: MemoryFile;
  allFiles: MemoryFile[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(file.content);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentType = inferMemoryType(file.name, file.meta);
  const [typeId, setTypeId] = useState(currentType.id);
  const [important, setImportant] = useState(isImportantMemory(file.meta, currentType.id));
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [removeOtherAfterMerge, setRemoveOtherAfterMerge] = useState(false);
  const [branchLabel, setBranchLabel] = useState("");

  useEffect(() => {
    setDraft(file.content);
    setDirty(false);
    const t = inferMemoryType(file.name, file.meta);
    setTypeId(t.id);
    setImportant(isImportantMemory(file.meta, t.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  const saveContent = useCallback(async () => {
    setSaving(true);
    const { synced } = await writeMemoryContentResilient(file, draft);
    setSaving(false);
    setDirty(false);
    toast.success(synced ? "Memoria guardada." : "Guardado localmente (sin red) — se subirá al reconectar.");
    onChanged();
  }, [file, draft, onChanged]);

  const saveMeta = useCallback(
    async (patch: { typeId?: string; important?: boolean }) => {
      const nextTypeId = patch.typeId ?? typeId;
      const nextImportant = patch.important ?? important;
      const nextContent = applyFrontmatterPatch(draft, { type: nextTypeId, important: nextImportant });
      setDraft(nextContent);
      const ok = await saveMemoryFile({
        id: file.id,
        brain_id: file.brain_id,
        name: file.name,
        content: nextContent,
        source: file.source,
        server_config: file.server_config,
        sync: file.sync,
        meta: { ...file.meta, type: nextTypeId, important: nextImportant },
      });
      if (ok) {
        toast.success("Metadatos actualizados.");
        onChanged();
      } else {
        toast.error("No se pudo actualizar.");
      }
    },
    [draft, file, typeId, important, onChanged],
  );

  const doMerge = useCallback(async () => {
    const other = allFiles.find((f) => f.id === mergeTargetId);
    if (!other) return;
    const merged = `${draft.trim()}\n\n---\n\n## Fusionado desde «${other.name}»\n\n${other.content.trim()}\n`;
    setDraft(merged);
    const { synced } = await writeMemoryContentResilient(file, merged);
    if (removeOtherAfterMerge) {
      try {
        const { deleteMemoryFile } = await import("@/lib/cerebro/memory-files");
        await deleteMemoryFile(other.id);
      } catch {
        /* fusión ya aplicada aunque falle el borrado del origen */
      }
    }
    toast.success(synced ? `Fusionado con «${other.name}».` : "Fusionado localmente (sin red).");
    setMergeTargetId("");
    onChanged();
  }, [allFiles, mergeTargetId, draft, file, removeOtherAfterMerge, onChanged]);

  const doBranch = useCallback(async () => {
    const branch = await createMemoryBranch(file, draft, branchLabel);
    if (branch) {
      toast.success(`Rama creada: «${branch.name}».`);
      setBranchLabel("");
      onChanged();
    } else {
      toast.error("No se pudo crear la rama.");
    }
  }, [file, draft, branchLabel, onChanged]);

  const otherFiles = allFiles.filter((f) => f.id !== file.id);
  const Icon = currentType.icon;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5">
          <Icon className="h-4 w-4" style={{ color: currentType.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white/95">{file.name}</div>
          <div className="flex items-center gap-1 text-[10px]" style={{ color: currentType.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: currentType.color }} />
            {currentType.label}
          </div>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white/90">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Contenido (.md)</label>
            <Button size="sm" variant={dirty ? "default" : "outline"} className="h-7 gap-1 px-2 text-xs" disabled={!dirty || saving} onClick={saveContent}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </Button>
          </div>
          <Textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            spellCheck={false}
            className="min-h-[200px] resize-y font-mono text-xs leading-relaxed"
            placeholder="# Escribe en markdown… usa [[Nombre]] para enlazar otra memoria."
          />
        </section>

        <section className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Tipo</label>
          <select
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              void saveMeta({ typeId: e.target.value });
            }}
            className="h-8 w-full rounded-md border border-white/10 bg-black/30 px-2 text-xs text-white/85"
          >
            {listMemoryTypes().map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <label className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs text-white/80">
              <Star className="h-3.5 w-3.5 text-amber-300" /> Importante (nunca se fusiona sola)
            </span>
            <Switch
              checked={important}
              onCheckedChange={(v) => {
                setImportant(v);
                void saveMeta({ important: v });
              }}
            />
          </label>
        </section>

        {otherFiles.length > 0 && (
          <section className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">
              <GitMerge className="h-3.5 w-3.5" /> Fusionar con otra memoria
            </label>
            <select
              value={mergeTargetId}
              onChange={(e) => setMergeTargetId(e.target.value)}
              className="h-8 w-full rounded-md border border-white/10 bg-black/30 px-2 text-xs text-white/85"
            >
              <option value="">Elige una memoria…</option>
              {otherFiles.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-[11px] text-white/55">
              <input type="checkbox" checked={removeOtherAfterMerge} onChange={(e) => setRemoveOtherAfterMerge(e.target.checked)} />
              Eliminar la otra memoria tras fusionar
            </label>
            <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs" disabled={!mergeTargetId} onClick={doMerge}>
              <GitMerge className="h-3.5 w-3.5" /> Fusionar aquí
            </Button>
          </section>
        )}

        <section className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            <GitBranch className="h-3.5 w-3.5" /> Crear rama (edición divergente)
          </label>
          <Input
            value={branchLabel}
            onChange={(e) => setBranchLabel(e.target.value)}
            placeholder="Etiqueta de la rama (opcional)"
            className="h-8 text-xs"
          />
          <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs" onClick={doBranch}>
            <GitBranch className="h-3.5 w-3.5" /> Crear rama con el contenido actual
          </Button>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sección de destinos + sync (solo con brainId real)                   */
/* ------------------------------------------------------------------ */

function DestinationsBar({ brainId }: { brainId: string }) {
  const [brain, setBrain] = useState<Brain | null>(null);
  const [syncing, setSyncing] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const reloadBrain = useCallback(() => {
    void getBrain(brainId).then(setBrain);
  }, [brainId]);

  useEffect(() => {
    reloadBrain();
  }, [reloadBrain]);

  const dest = getMemoryDestinations(brain);
  const memoryMode = getBrainMemoryMode(brain);

  const onToggleMemoryMode = async (writable: boolean) => {
    if (!brain) return;
    const updated = await setBrainMemoryMode(brain, writable ? "write" : "read");
    if (updated) setBrain(updated);
    toast.success(writable ? "Astraura puede escribir memorias en este cerebro." : "Cerebro en solo lectura para Astraura.");
  };

  const doSync = async () => {
    if (!brain) return;
    setSyncing(true);
    const res = await syncBrainMemoryNow(brain);
    setSyncing(false);
    toast[res.ok ? "success" : "error"](res.steps.map((s) => s.detail).join(" · ") || "Sin destinos que sincronizar.");
  };

  const doDownload = async () => {
    const res = await downloadBrainMemoryBackup(brainId, brain?.name);
    toast[res.ok ? "success" : "error"](res.message);
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const res = await importBrainMemory(brainId, text);
    toast[res.ok ? "success" : "error"](res.message);
    e.target.value = "";
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 p-1.5 text-[11px] text-white/60">
      <label className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 px-2 py-1" title="Modo de memoria de este cerebro para Astraura">
        <Switch checked={memoryMode === "write"} onCheckedChange={onToggleMemoryMode} />
        {memoryMode === "write" ? "Astraura: escribe" : "Astraura: solo lee"}
      </label>
      <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Local: siempre
      </Badge>
      <Badge variant="outline" className={cn("gap-1", dest.starseed.enabled ? "border-cyan-500/30 text-cyan-300" : "border-white/15 text-white/40")}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dest.starseed.enabled ? "#22d3ee" : "#475569" }} /> StarSeed
      </Badge>
      {dest.external.length > 0 && (
        <Badge variant="outline" className="gap-1 border-violet-500/30 text-violet-300">
          <Link2 className="h-3 w-3" /> {dest.external.length} externo(s)
        </Badge>
      )}
      <Button size="sm" variant="outline" className="ml-auto h-6 gap-1 px-2 text-[11px]" disabled={syncing} onClick={doSync}>
        {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Sincronizar
      </Button>
      <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={doDownload}>
        <Download className="h-3 w-3" /> Descargar
      </Button>
      <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={() => importInputRef.current?.click()}>
        <Upload className="h-3 w-3" /> Importar
      </Button>
      <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={onImportFile} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Componente principal                                                 */
/* ------------------------------------------------------------------ */

export default function MemoryGraph({ brainId, className = "" }: { brainId: string | null; className?: string }) {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [query, setQuery] = useState("");
  const [onlyExtracted, setOnlyExtracted] = useState(false);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);

  const filter = useMemo(() => (brainId ? `brain_id=eq.${brainId}` : undefined), [brainId]);
  const { rows: files, loading, reload } = useRealtimeRows<MemoryFile>(
    "brain_memory_files",
    () => listMemoryFiles(brainId),
    { filter, idKey: "id" },
  );

  const graph = useMemo(() => buildMemoryGraph(files), [files]);

  const presentTypes = useMemo(() => {
    const ids = new Set(graph.nodes.map((n) => n.typeLabel));
    return listMemoryTypes().filter((t) => ids.has(t.label));
  }, [graph]);

  const visibleNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return graph.nodes.filter((n) => {
      if (hiddenTypes.has(n.typeLabel)) return false;
      if (q && !n.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [graph, hiddenTypes, query]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => graph.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target) && (!onlyExtracted || e.kind === "extracted")),
    [graph, visibleIds, onlyExtracted],
  );

  const topDegree = useMemo(() => [...graph.nodes].sort((a, b) => b.degree - a.degree).slice(0, 5).filter((n) => n.degree > 0), [graph]);

  const toggleType = useCallback((label: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const selectedFile = selectedId ? graph.fileById.get(selectedId) ?? null : null;
  const closePanel = useCallback(() => setSelectedId(null), []);

  const isEmpty = !loading && files.length === 0;

  return (
    <div className={cn("flex h-full w-full flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar memorias…" className="h-9 pl-8 text-sm" />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
          <button
            onClick={() => setView("2d")}
            className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition", view === "2d" ? "bg-amber-500/20 text-amber-200" : "text-white/55 hover:text-white/80")}
          >
            <Workflow className="h-3.5 w-3.5" /> 2D
          </button>
          <button
            onClick={() => setView("3d")}
            className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition", view === "3d" ? "bg-amber-500/20 text-amber-200" : "text-white/55 hover:text-white/80")}
          >
            <NetworkIcon className="h-3.5 w-3.5" /> 3D
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-white/60">
          <Switch checked={onlyExtracted} onCheckedChange={setOnlyExtracted} /> Solo enlaces explícitos
        </label>
        {brainId && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setShowConflicts((v) => !v)}>
            <AlertTriangle className="h-3.5 w-3.5" /> Conflictos
          </Button>
        )}
      </div>

      {brainId && <DestinationsBar brainId={brainId} />}
      {brainId && showConflicts && <MemoryConflictsPanel brainId={brainId} />}

      <div className="flex flex-1 flex-col gap-2 md:flex-row">
        <div className="relative min-h-[50vh] flex-1">
          {loading ? (
            <div className="flex h-full min-h-[50vh] items-center justify-center rounded-2xl border border-white/10 bg-black/20">
              <div className="flex items-center gap-2 text-white/60">
                <Loader2 className="h-5 w-5 animate-spin" /> Cargando memorias…
              </div>
            </div>
          ) : isEmpty ? (
            <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-black/20 text-center">
              <NetworkIcon className="h-8 w-8 text-white/25" />
              <p className="text-sm text-white/55">Aún no hay memorias aquí. Créalas desde el pilar Memoria del cerebro.</p>
            </div>
          ) : view === "2d" ? (
            <Map2DView nodes={visibleNodes} edges={visibleEdges} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <MemoryGraph3D
              nodes={visibleNodes}
              edges={visibleEdges}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}

          {!isEmpty && !loading && (
            <div className="pointer-events-none absolute bottom-3 left-3 max-w-md rounded-xl border border-white/10 bg-black/45 p-2.5 text-[11px] text-white/70 backdrop-blur">
              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {presentTypes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleType(t.label)}
                    className={cn("pointer-events-auto flex items-center gap-1", hiddenTypes.has(t.label) && "opacity-35")}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                    {t.label}
                  </button>
                ))}
              </div>
              {topDegree.length > 0 && (
                <div className="pointer-events-auto mb-1 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-1">
                  <span className="text-white/40">Nodos clave:</span>
                  {topDegree.map((n) => (
                    <button key={n.id} onClick={() => setSelectedId(n.id)} className="rounded-full border border-white/15 px-1.5 text-white/70 hover:bg-white/10">
                      {n.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="text-white/45">
                {visibleNodes.length} memorias · {visibleEdges.length} conexiones
              </div>
            </div>
          )}
        </div>

        {selectedFile && (
          <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17]/95 shadow-2xl backdrop-blur-md md:w-[22rem]">
            <MemoryInspector file={selectedFile} allFiles={files} onClose={closePanel} onChanged={reload} />
          </div>
        )}
      </div>
    </div>
  );
}
