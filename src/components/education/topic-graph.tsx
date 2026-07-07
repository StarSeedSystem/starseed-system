"use client";

// src/components/education/topic-graph.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Mapa del Conocimiento educativo: árbol categoría → tema → subtema (catálogo
// builtin + extensiones personales, ver src/lib/education/curriculum.ts) en
// tres vistas — Lista, Mapa 2D y Red 3D — con panel de detalle (contenido
// vinculado + ruta de aprendizaje). Mismo espíritu que
// src/components/knowledge/knowledge-network.tsx pero acotado a Educación:
// árbol estricto (sin vínculos cruzados), color por categoría raíz, tamaño
// por actividad real (nº de publicaciones etiquetadas).
//
// SSR-safe: la Red 3D (r3f + three) se carga con next/dynamic({ssr:false});
// Lista y Mapa 2D son SVG/DOM puro y se renderizan también en el servidor.
// ─────────────────────────────────────────────────────────────────────────────

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    List,
    Workflow,
    Network as NetworkIcon,
    Search as SearchIcon,
    X,
    Plus,
    ChevronRight,
    ChevronDown,
    FolderTree,
    Hash,
    Trash2,
    RotateCcw,
    Loader2,
    Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import {
    type EduNode,
    type EduNodeKind,
    type EduTreeNode,
    type CurriculumData,
    loadCurriculum,
    addUserNode,
    removeUserNode,
    nodePath,
    rootIdOf,
    colorForRoot,
    subtreeActivity,
    searchNodes,
} from "@/lib/education/curriculum";
import { LearningPathPanel } from "@/components/education/learning-path";
import type { Graph3DNode, Graph3DEdge } from "@/components/education/topic-graph-3d";

const TopicGraph3D = dynamic(() => import("./topic-graph-3d"), {
    ssr: false,
    loading: () => (
        <div className="flex h-full min-h-[50vh] w-full items-center justify-center text-white/60">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparando la Red 3D…
        </div>
    ),
});

type ViewMode = "lista" | "mapa2d" | "red3d";

function kindForParent(parentId: string | null, byId: Map<string, EduNode>): EduNodeKind {
    if (!parentId) return "category";
    const p = byId.get(parentId);
    if (!p || p.kind === "category") return "topic";
    return "subtopic";
}

// ════════════════════════════════════════════════════════════════════════════
// Layouts (puro cálculo, sin dependencias de three.js — seguro en servidor)
// ════════════════════════════════════════════════════════════════════════════

interface XY {
    x: number;
    y: number;
}

function computeLayout2D(tree: EduTreeNode[]): { pos: Map<string, XY>; width: number; height: number } {
    const W = 1200;
    const H = 1200;
    const cx = W / 2;
    const cy = H / 2;
    const ringGap = 160;
    const pos = new Map<string, XY>();

    const leafCount = new Map<string, number>();
    const countLeaves = (nd: EduTreeNode): number => {
        if (nd.children.length === 0) {
            leafCount.set(nd.id, 1);
            return 1;
        }
        let s = 0;
        for (const ch of nd.children) s += countLeaves(ch);
        leafCount.set(nd.id, s);
        return s;
    };
    let total = 0;
    for (const r of tree) total += countLeaves(r);
    total = Math.max(total, 1);

    const place = (nd: EduTreeNode, a0: number, a1: number) => {
        const mid = (a0 + a1) / 2;
        const radius = nd.depth === 0 ? 0 : nd.depth * ringGap;
        pos.set(nd.id, { x: cx + Math.cos(mid) * radius, y: cy + Math.sin(mid) * radius });
        let cursor = a0;
        for (const ch of nd.children) {
            const span = ((leafCount.get(ch.id) ?? 1) / total) * (a1 - a0);
            place(ch, cursor, cursor + span);
            cursor += span;
        }
    };

    let cursor = -Math.PI / 2;
    for (const r of tree) {
        const span = ((leafCount.get(r.id) ?? 1) / total) * Math.PI * 2;
        place(r, cursor, cursor + span);
        cursor += span;
    }

    return { pos, width: W, height: H };
}

function computeLayout3D(tree: EduTreeNode[]): Map<string, [number, number, number]> {
    const posById = new Map<string, [number, number, number]>();

    const placeChildren = (node: EduTreeNode, center: [number, number, number], radius: number) => {
        const kids = node.children;
        const cnt = kids.length;
        kids.forEach((k, i) => {
            let off: [number, number, number];
            if (cnt === 1) {
                off = [radius, 0, 0];
            } else {
                const t = i / (cnt - 1);
                const inclination = Math.acos(1 - 2 * (t * 0.86 + 0.07));
                const azimuth = Math.PI * (1 + Math.sqrt(5)) * i;
                off = [
                    radius * Math.sin(inclination) * Math.cos(azimuth),
                    radius * Math.cos(inclination) * 0.6,
                    radius * Math.sin(inclination) * Math.sin(azimuth),
                ];
            }
            const pos: [number, number, number] = [center[0] + off[0], center[1] + off[1], center[2] + off[2]];
            posById.set(k.id, pos);
            placeChildren(k, pos, Math.max(radius * 0.42, 26));
        });
    };

    tree.forEach((root, i) => {
        const ang = i * 2.399963;
        const radius = 230;
        const pos: [number, number, number] = [Math.cos(ang) * radius, ((i % 3) - 1) * 24, Math.sin(ang) * radius];
        posById.set(root.id, pos);
        placeChildren(root, pos, 100);
    });

    return posById;
}

function sizeFor(kind: EduNodeKind, activity: number, mode: "2d" | "3d"): number {
    if (mode === "3d") {
        const base = kind === "category" ? 12 : kind === "topic" ? 7.5 : 4.5;
        return base + Math.min(12, activity) * 0.55;
    }
    const base = kind === "category" ? 16 : kind === "topic" ? 9 : 5.5;
    return base + Math.min(12, activity) * 0.9;
}

// ════════════════════════════════════════════════════════════════════════════
// Vista LISTA
// ════════════════════════════════════════════════════════════════════════════

function TreeRow({
    node,
    byId,
    expanded,
    toggle,
    selectedId,
    onSelect,
    activityById,
    onAddChild,
    onRemove,
}: {
    node: EduTreeNode;
    byId: Map<string, EduNode>;
    expanded: Set<string>;
    toggle: (id: string) => void;
    selectedId: string | null;
    onSelect: (id: string) => void;
    activityById: Map<string, number>;
    onAddChild: (parentId: string) => void;
    onRemove: (id: string) => void;
}) {
    const isOpen = expanded.has(node.id);
    const hasKids = node.children.length > 0;
    const isSelected = selectedId === node.id;
    const Icon = node.kind === "category" ? FolderTree : Hash;
    const color = colorForRoot(rootIdOf(node.id, byId));
    const activity = activityById.get(node.id) ?? 0;

    return (
        <div className="select-none">
            <div
                className={cn(
                    "group flex items-center gap-1.5 rounded-md px-1.5 py-1 transition",
                    isSelected ? "bg-white/10 ring-1 ring-white/20" : "hover:bg-white/5",
                )}
                style={{ paddingLeft: node.depth * 16 + 4 }}
            >
                <button
                    onClick={() => hasKids && toggle(node.id)}
                    className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/50",
                        hasKids ? "hover:text-white/90" : "opacity-0",
                    )}
                    aria-label={isOpen ? "Contraer" : "Expandir"}
                >
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                <button
                    onClick={() => onSelect(node.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium text-white/90 hover:underline"
                    title={node.blurb}
                >
                    {node.name}
                    {node.custom && <span className="ml-1.5 text-[10px] font-normal text-white/40">(tuyo)</span>}
                </button>
                {activity > 0 && (
                    <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-white/60">{activity}</span>
                )}
                <div className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button
                        onClick={() => onAddChild(node.id)}
                        className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80"
                        title="Añadir subtema"
                    >
                        <Plus className="h-3.5 w-3.5" />
                    </button>
                    {node.custom && (
                        <button
                            onClick={() => onRemove(node.id)}
                            className="rounded p-1 text-white/40 hover:bg-red-500/20 hover:text-red-300"
                            title="Eliminar (sólo tuyo)"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>
            {isOpen &&
                node.children.map((ch) => (
                    <TreeRow
                        key={ch.id}
                        node={ch}
                        byId={byId}
                        expanded={expanded}
                        toggle={toggle}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        activityById={activityById}
                        onAddChild={onAddChild}
                        onRemove={onRemove}
                    />
                ))}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// Vista MAPA 2D (SVG, pan/zoom)
// ════════════════════════════════════════════════════════════════════════════

function Map2DView({
    tree,
    byId,
    activityById,
    selectedId,
    onSelect,
}: {
    tree: EduTreeNode[];
    byId: Map<string, EduNode>;
    activityById: Map<string, number>;
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    const { pos } = useMemo(() => computeLayout2D(tree), [tree]);
    const flat = useMemo(() => {
        const out: EduTreeNode[] = [];
        const walk = (list: EduTreeNode[]) => {
            for (const it of list) {
                out.push(it);
                walk(it.children);
            }
        };
        walk(tree);
        return out;
    }, [tree]);

    const [scale, setScale] = useState(0.62);
    const [tx, setTx] = useState(0);
    const [ty, setTy] = useState(0);
    const [hover, setHover] = useState<string | null>(null);
    const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

    const focusSet = useMemo(() => {
        if (!selectedId) return null;
        const set = new Set<string>();
        for (const p of nodePath(selectedId, byId)) set.add(p.id);
        const node = byId.get(selectedId);
        if (node) {
            for (const it of flat) if (it.parentId === node.id) set.add(it.id);
        }
        return set;
    }, [selectedId, byId, flat]);

    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        setScale((s) => Math.min(3, Math.max(0.15, s * factor)));
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
    const reset = () => {
        setScale(0.62);
        setTx(0);
        setTy(0);
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
                    {flat.map((nd) => {
                        if (!nd.parentId) return null;
                        const a = pos.get(nd.parentId);
                        const b = pos.get(nd.id);
                        if (!a || !b) return null;
                        const hot = !!focusSet && focusSet.has(nd.parentId) && focusSet.has(nd.id);
                        const dim = !!focusSet && !hot;
                        return (
                            <line
                                key={`e-${nd.id}`}
                                x1={a.x}
                                y1={a.y}
                                x2={b.x}
                                y2={b.y}
                                stroke={hot ? "#fde68a" : "#ffffff22"}
                                strokeWidth={hot ? 2 : 1.2}
                                opacity={dim ? 0.08 : 1}
                            />
                        );
                    })}
                    {flat.map((nd) => {
                        const p = pos.get(nd.id);
                        if (!p) return null;
                        const activity = activityById.get(nd.id) ?? 0;
                        const r = sizeFor(nd.kind, activity, "2d") / 1.6;
                        const color = colorForRoot(rootIdOf(nd.id, byId));
                        const hot = !!focusSet && focusSet.has(nd.id);
                        const dim = !!focusSet && !hot;
                        const isHover = hover === nd.id;
                        const showLabel = isHover || hot || (nd.kind === "category") || (nd.kind === "topic" && scale > 0.5);
                        return (
                            <g
                                key={nd.id}
                                transform={`translate(${p.x},${p.y})`}
                                opacity={dim ? 0.22 : 1}
                                style={{ cursor: "pointer" }}
                                onMouseEnter={() => setHover(nd.id)}
                                onMouseLeave={() => setHover(null)}
                                onClick={() => onSelect(nd.id)}
                            >
                                <circle
                                    r={isHover || nd.id === selectedId ? r * 1.25 : r}
                                    fill={color}
                                    stroke={nd.id === selectedId ? "#fde68a" : "rgba(0,0,0,0.4)"}
                                    strokeWidth={nd.id === selectedId ? 2.4 : 1}
                                />
                                {showLabel && (
                                    <text
                                        x={0}
                                        y={-r - 6}
                                        textAnchor="middle"
                                        fontSize={nd.kind === "category" ? 13 : 11}
                                        fontWeight={nd.kind === "category" ? 700 : 500}
                                        fill="#f1f5f9"
                                        style={{ paintOrder: "stroke", pointerEvents: "none" }}
                                        stroke="rgba(8,12,20,0.85)"
                                        strokeWidth={3}
                                    >
                                        {nd.name}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </g>
            </svg>

            <div className="absolute right-3 top-3 flex flex-col gap-1.5">
                <button
                    onClick={() => setScale((s) => Math.min(3, s * 1.2))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur hover:bg-black/70"
                >
                    +
                </button>
                <button
                    onClick={() => setScale((s) => Math.max(0.15, s * 0.83))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur hover:bg-black/70"
                >
                    −
                </button>
                <button
                    onClick={reset}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur hover:bg-black/70"
                    title="Reiniciar vista"
                >
                    <RotateCcw className="h-3.5 w-3.5" />
                </button>
            </div>

            <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-white/10 bg-black/45 p-2.5 text-[11px] text-white/70 backdrop-blur">
                Arrastra para mover · rueda para zoom · clic para abrir un tema
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// Panel de detalle
// ════════════════════════════════════════════════════════════════════════════

function TopicDetailPanel({
    node,
    byId,
    activity,
    onAddChild,
    onRemove,
    onClose,
}: {
    node: EduNode;
    byId: Map<string, EduNode>;
    activity: number;
    onAddChild: (parentId: string) => void;
    onRemove: (id: string) => void;
    onClose: () => void;
}) {
    const path = nodePath(node.id, byId);
    const accent = colorForRoot(rootIdOf(node.id, byId));

    return (
        <div className="flex h-full w-full flex-col overflow-y-auto rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md md:w-80">
            <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-[11px] text-white/40">{path.map((p) => p.name).join(" › ")}</p>
                    <h3 className="mt-0.5 truncate text-base font-semibold" style={{ color: accent }}>
                        {node.name}
                    </h3>
                </div>
                <button onClick={onClose} className="shrink-0 rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80">
                    <X className="h-4 w-4" />
                </button>
            </div>

            {node.blurb && <p className="mb-3 text-xs text-muted-foreground">{node.blurb}</p>}

            <p className="mb-3 text-[11px] text-white/45">
                {activity > 0
                    ? `${activity} publicación${activity === 1 ? "" : "es"} vinculada${activity === 1 ? "" : "s"} en esta rama.`
                    : "Aún no hay publicaciones vinculadas. Etiqueta un curso o artículo con este nombre para conectarlo."}
            </p>

            <div className="mb-4 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => onAddChild(node.id)}>
                    <Plus className="h-3.5 w-3.5" /> Subtema
                </Button>
                {node.custom && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-xs text-red-300"
                        onClick={() => onRemove(node.id)}
                    >
                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </Button>
                )}
            </div>

            <div className="border-t border-white/10 pt-3">
                <LearningPathPanel topicId={node.id} topicName={node.name} accent={accent} />
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// Componente principal
// ════════════════════════════════════════════════════════════════════════════

export function TopicGraph() {
    const [data, setData] = useState<CurriculumData | null>(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<ViewMode>("lista");
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const [addModal, setAddModal] = useState<{ open: boolean; parentId: string | null }>({
        open: false,
        parentId: null,
    });
    const [newName, setNewName] = useState("");
    const [newBlurb, setNewBlurb] = useState("");

    const reload = useCallback(async () => {
        const d = await loadCurriculum();
        setData(d);
        setLoading(false);
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const tree = data?.tree ?? [];
    const flat = data?.flat ?? [];
    const byId = useMemo(() => data?.byId ?? new Map<string, EduNode>(), [data]);

    const activityById = useMemo(() => {
        const m = new Map<string, number>();
        const walk = (list: EduTreeNode[]) => {
            for (const it of list) {
                m.set(it.id, subtreeActivity(it));
                walk(it.children);
            }
        };
        walk(tree);
        return m;
    }, [tree]);

    const pos3D = useMemo(() => computeLayout3D(tree), [tree]);
    const edges: Graph3DEdge[] = useMemo(
        () => flat.filter((nd) => nd.parentId).map((nd) => ({ source: nd.parentId as string, target: nd.id })),
        [flat],
    );
    const graph3DNodes: Graph3DNode[] = useMemo(
        () =>
            flat.map((nd) => ({
                id: nd.id,
                name: nd.name,
                kind: nd.kind,
                position: pos3D.get(nd.id) ?? [0, 0, 0],
                color: colorForRoot(rootIdOf(nd.id, byId)),
                size: sizeFor(nd.kind, activityById.get(nd.id) ?? 0, "3d"),
            })),
        [flat, pos3D, byId, activityById],
    );

    const results = useMemo(() => (query.trim() ? searchNodes(query, data?.nodes ?? []) : null), [query, data]);

    const toggle = useCallback((id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const selectNode = useCallback(
        (id: string) => {
            setSelectedId(id);
            setExpanded((prev) => {
                const next = new Set(prev);
                for (const p of nodePath(id, byId)) next.add(p.id);
                return next;
            });
        },
        [byId],
    );

    const openAdd = useCallback((parentId: string | null) => {
        setNewName("");
        setNewBlurb("");
        setAddModal({ open: true, parentId });
    }, []);

    const submitAdd = useCallback(async () => {
        const created = await addUserNode({
            kind: kindForParent(addModal.parentId, byId),
            name: newName,
            blurb: newBlurb,
            parentId: addModal.parentId,
        });
        if (created) {
            toast.success(`"${created.name}" añadido a tu mapa de conocimiento`);
            setAddModal({ open: false, parentId: null });
            await reload();
            selectNode(created.id);
        } else {
            toast.error("Inicia sesión para añadir temas propios a tu mapa.");
        }
    }, [addModal.parentId, byId, newName, newBlurb, reload, selectNode]);

    const doRemove = useCallback(
        async (id: string) => {
            const ok = await removeUserNode(id);
            if (ok) {
                toast.success("Eliminado de tu mapa");
                if (selectedId === id) setSelectedId(null);
                await reload();
            } else {
                toast.error("No se pudo eliminar");
            }
        },
        [reload, selectedId],
    );

    const selectedNode = selectedId ? byId.get(selectedId) ?? null : null;

    return (
        <div className="flex flex-col gap-3">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-2 backdrop-blur">
                <div className="relative min-w-[180px] flex-1">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar categorías, temas y subtemas…"
                        className="h-9 pl-8 text-sm"
                    />
                    {query && (
                        <button
                            onClick={() => setQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/40 hover:text-white/80"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
                    <ViewBtn active={view === "lista"} onClick={() => setView("lista")} icon={<List className="h-3.5 w-3.5" />} label="Lista" />
                    <ViewBtn active={view === "mapa2d"} onClick={() => setView("mapa2d")} icon={<Workflow className="h-3.5 w-3.5" />} label="Mapa 2D" />
                    <ViewBtn active={view === "red3d"} onClick={() => setView("red3d")} icon={<NetworkIcon className="h-3.5 w-3.5" />} label="Red 3D" />
                </div>

                <Button size="sm" variant="outline" onClick={() => openAdd(null)} title="Añadir categoría propia">
                    <Plus className="h-4 w-4" /> Tema propio
                </Button>
            </div>

            {/* Resultados de búsqueda */}
            {results && results.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
                    <div className="mb-2 text-xs uppercase tracking-wide text-white/40">Resultados</div>
                    <div className="flex flex-wrap gap-1.5">
                        {results.slice(0, 24).map((r) => (
                            <button
                                key={r.id}
                                onClick={() => {
                                    selectNode(r.id);
                                    setQuery("");
                                }}
                                className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs text-white/80 hover:bg-white/10"
                                style={{ borderColor: `${colorForRoot(rootIdOf(r.id, byId))}55` }}
                            >
                                {nodePath(r.id, byId).map((p) => p.name).join(" › ")}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Cuerpo */}
            <div className="flex flex-col gap-3 md:flex-row">
                <div className="min-h-[60vh] min-w-0 flex-1">
                    {loading ? (
                        <div className="flex min-h-[60vh] items-center justify-center rounded-2xl border border-white/10 bg-black/20">
                            <div className="flex items-center gap-2 text-white/60">
                                <Loader2 className="h-5 w-5 animate-spin" /> Cargando el mapa del conocimiento…
                            </div>
                        </div>
                    ) : view === "lista" ? (
                        <div className="min-h-[60vh] rounded-2xl border border-white/10 bg-black/20 p-3">
                            <div className="space-y-0.5">
                                {tree.map((root) => (
                                    <TreeRow
                                        key={root.id}
                                        node={root}
                                        byId={byId}
                                        expanded={expanded}
                                        toggle={toggle}
                                        selectedId={selectedId}
                                        onSelect={selectNode}
                                        activityById={activityById}
                                        onAddChild={openAdd}
                                        onRemove={doRemove}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : view === "mapa2d" ? (
                        <div className="min-h-[60vh] h-[70vh]">
                            <Map2DView tree={tree} byId={byId} activityById={activityById} selectedId={selectedId} onSelect={selectNode} />
                        </div>
                    ) : (
                        <div className="min-h-[60vh] h-[70vh]">
                            <TopicGraph3D nodes={graph3DNodes} edges={edges} selectedId={selectedId} onSelect={selectNode} />
                        </div>
                    )}
                </div>

                {selectedNode && (
                    <TopicDetailPanel
                        node={selectedNode}
                        byId={byId}
                        activity={activityById.get(selectedNode.id) ?? 0}
                        onAddChild={openAdd}
                        onRemove={doRemove}
                        onClose={() => setSelectedId(null)}
                    />
                )}
            </div>

            <p className="flex items-center gap-1.5 text-[11px] text-white/40">
                <Sparkles className="h-3 w-3" />
                El catálogo base es común a toda la red. Tus temas propios (marcados “tuyo”) sólo los ves tú; los grupos de
                estudio sólo pueden vincular temas del catálogo base para que todos los miembros los vean.
            </p>

            {/* Modal: añadir tema/subtema propio */}
            <Dialog open={addModal.open} onOpenChange={(o) => setAddModal((s) => ({ ...s, open: o }))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {addModal.parentId
                                ? `Nuevo subtema en "${byId.get(addModal.parentId)?.name ?? ""}"`
                                : "Nueva categoría propia"}
                        </DialogTitle>
                        <DialogDescription>
                            Se añade a tu mapa de conocimiento personal — no lo ven otras personas.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Input
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Nombre"
                        />
                        <Input
                            value={newBlurb}
                            onChange={(e) => setNewBlurb(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && submitAdd()}
                            placeholder="Descripción breve (opcional)"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddModal({ open: false, parentId: null })}>
                            Cancelar
                        </Button>
                        <Button onClick={submitAdd} disabled={!newName.trim()}>
                            Crear
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function ViewBtn({
    active,
    onClick,
    icon,
    label,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition",
                active ? "bg-amber-500/20 text-amber-200" : "text-white/55 hover:text-white/80",
            )}
        >
            {icon}
            {label}
        </button>
    );
}

export default TopicGraph;
