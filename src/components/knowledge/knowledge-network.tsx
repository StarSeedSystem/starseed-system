"use client";

/**
 * StarSeed OS — Módulo 3: La Red de Conocimiento
 *
 * Componente principal con tres vistas sobre el mismo modelo:
 *   • Lista   — árbol jerárquico de categorías con temas anidados; cada tema
 *               muestra sus OTRAS rutas de categoría (vínculos de ubicación)
 *               como chips → clic enfoca esa categoría.
 *   • Mapa 2D — concept map en SVG: categorías como nodos grandes (layout
 *               radial por árbol), temas como nodos pequeños conectados a
 *               TODAS sus categorías (aristas cruzando ramas), pan/zoom, hover,
 *               clic para enfocar.
 *   • Red 3D  — escena @react-three/fiber espejando memory-mesh-3d.tsx:
 *               categorías un color, temas otro, aristas árbol + vínculos,
 *               OrbitControls, hover, clic-enfoque. Tope ~250 nodos.
 *
 * SSR-safe: lleva "use client"; el three/r3f vive solo aquí dentro y la página
 * lo importa con next/dynamic { ssr:false }. Astraura (IA) opcional.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import {
  Network,
  List,
  Workflow,
  Boxes,
  Plus,
  Search as SearchIcon,
  Link2,
  Trash2,
  ChevronRight,
  ChevronDown,
  Hash,
  FolderTree,
  Loader2,
  RotateCcw,
  X,
  Sparkles,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { chat } from "@/ai/client/chat";
import { loadConfigs, getActiveProviderId } from "@/ai/client/providerStore";
import type { ChatMessage } from "@/ai/providers/types";

import {
  type Category,
  type Topic,
  type TopicCategory,
  type CategoryNode,
  type TopicPath,
  type GraphNode,
  type KnowledgeGraph,
  loadKnowledge,
  buildTree,
  buildGraph,
  topicPaths,
  topicsForCategory,
  categoryPath,
  search as searchKnowledge,
  addCategory,
  addTopic,
  linkTopic,
  unlinkTopic,
  deleteCategory,
  deleteTopic,
  catNodeId,
  topicNodeId,
} from "@/lib/knowledge/knowledge";

// ────────────────────────────────────────────────────────────────────────────
// Paleta
// ────────────────────────────────────────────────────────────────────────────

const CATEGORY_COLOR = "#fcd34d"; // ámbar — categorías
const TOPIC_COLOR = "#67e8f9"; // cian — temas
const EDGE_TREE = "#fbbf2455"; // arista categoría↔padre
const EDGE_LINK = "#67e8f988"; // arista tema↔categoría (cross-branch)
const HIGHLIGHT_EDGE = "#fde68a";
const MAX_NODES = 250;

type ViewMode = "lista" | "mapa2d" | "red3d";

// ════════════════════════════════════════════════════════════════════════════
//  Layout radial 2D (categorías por árbol + temas alrededor de sus categorías)
// ════════════════════════════════════════════════════════════════════════════

interface XY {
  x: number;
  y: number;
}

interface Map2DLayout {
  catPos: Map<string, XY>;
  topicPos: Map<string, XY>;
  width: number;
  height: number;
}

/**
 * Coloca categorías por nivel en anillos concéntricos (raíz al centro) usando
 * un reparto angular por hojas, y temas en una órbita alrededor del centroide
 * de sus categorías vinculadas.
 */
function computeMap2D(
  roots: CategoryNode[],
  categories: Category[],
  topics: Topic[],
  links: TopicCategory[],
): Map2DLayout {
  const W = 1200;
  const H = 1200;
  const cx = W / 2;
  const cy = H / 2;
  const ringGap = 150;

  const catPos = new Map<string, XY>();

  // nº de hojas bajo cada nodo → reparto angular proporcional.
  const leafCount = new Map<string, number>();
  const countLeaves = (n: CategoryNode): number => {
    if (n.children.length === 0) {
      leafCount.set(n.id, 1);
      return 1;
    }
    let s = 0;
    for (const ch of n.children) s += countLeaves(ch);
    leafCount.set(n.id, s);
    return s;
  };
  let totalLeaves = 0;
  for (const r of roots) totalLeaves += countLeaves(r);
  totalLeaves = Math.max(totalLeaves, 1);

  // Recorre asignando un sector [a0,a1) a cada nodo; se ubica en el centro de su
  // sector, a un radio proporcional a su profundidad.
  const place = (node: CategoryNode, a0: number, a1: number) => {
    const mid = (a0 + a1) / 2;
    const radius = node.depth === 0 ? 0 : node.depth * ringGap;
    catPos.set(node.id, {
      x: cx + Math.cos(mid) * radius,
      y: cy + Math.sin(mid) * radius,
    });
    let cursor = a0;
    for (const ch of node.children) {
      const span = ((leafCount.get(ch.id) ?? 1) / totalLeaves) * (a1 - a0);
      place(ch, cursor, cursor + span);
      cursor += span;
    }
  };

  // Reparte el círculo completo entre las raíces.
  let cursor = -Math.PI / 2;
  for (const r of roots) {
    const span = ((leafCount.get(r.id) ?? 1) / totalLeaves) * Math.PI * 2;
    // Raíces múltiples: pequeño desplazamiento para no solaparlas en el centro.
    place(r, cursor, cursor + span);
    if (roots.length > 1) {
      const mid = cursor + span / 2;
      catPos.set(r.id, {
        x: cx + Math.cos(mid) * (ringGap * 0.55),
        y: cy + Math.sin(mid) * (ringGap * 0.55),
      });
    }
    cursor += span;
  }

  // Temas: alrededor del centroide de sus categorías, con jitter determinista.
  const topicPos = new Map<string, XY>();
  topics.forEach((t, i) => {
    const myCats = links
      .filter((l) => l.topic_id === t.id)
      .map((l) => catPos.get(l.category_id))
      .filter((p): p is XY => !!p);
    let bx = cx;
    let by = cy;
    if (myCats.length) {
      bx = myCats.reduce((s, p) => s + p.x, 0) / myCats.length;
      by = myCats.reduce((s, p) => s + p.y, 0) / myCats.length;
    }
    // Empuja el tema hacia afuera respecto al centro para reducir solapes.
    const ang = (i * 2.399963) % (Math.PI * 2); // ángulo áureo
    const off = 58 + (i % 4) * 14;
    topicPos.set(t.id, {
      x: bx + Math.cos(ang) * off,
      y: by + Math.sin(ang) * off,
    });
  });

  return { catPos, topicPos, width: W, height: H };
}

// ════════════════════════════════════════════════════════════════════════════
//  Vista LISTA — árbol jerárquico con temas + vínculos de ubicación
// ════════════════════════════════════════════════════════════════════════════

function TreeNode({
  node,
  categories,
  topics,
  links,
  expanded,
  toggle,
  focusedCat,
  onFocusCategory,
  onUnlink,
  onDeleteTopic,
  onDeleteCategory,
  onAddChild,
}: {
  node: CategoryNode;
  categories: Category[];
  topics: Topic[];
  links: TopicCategory[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  focusedCat: string | null;
  onFocusCategory: (id: string) => void;
  onUnlink: (topicId: string, categoryId: string) => void;
  onDeleteTopic: (topicId: string) => void;
  onDeleteCategory: (categoryId: string) => void;
  onAddChild: (parentId: string) => void;
}) {
  const isOpen = expanded.has(node.id);
  const childCats = node.children;
  const ownTopics = topicsForCategory(node.id, topics, links);
  const hasKids = childCats.length > 0 || ownTopics.length > 0;
  const isFocused = focusedCat === node.id;

  return (
    <div className="select-none">
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-md px-1.5 py-1 transition",
          isFocused ? "bg-amber-500/15 ring-1 ring-amber-400/40" : "hover:bg-white/5",
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
        <FolderTree className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
        <button
          onClick={() => onFocusCategory(node.id)}
          className="truncate text-sm font-medium text-amber-50 hover:underline"
          title={categoryPath(node.id, categories).join(" / ")}
        >
          {node.name}
        </button>
        {ownTopics.length > 0 && (
          <span className="ml-1 rounded-full bg-cyan-500/15 px-1.5 text-[10px] text-cyan-200">
            {ownTopics.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={() => onAddChild(node.id)}
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80"
            title="Añadir subcategoría"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDeleteCategory(node.id)}
            className="rounded p-1 text-white/40 hover:bg-red-500/20 hover:text-red-300"
            title="Eliminar categoría"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div>
          {ownTopics.map((t) => {
            // Vínculos de ubicación = las OTRAS rutas del tema (excluye esta cat).
            const otherPaths = topicPaths(t.id, links, categories).filter(
              (p) => p.categoryId !== node.id,
            );
            return (
              <div
                key={t.id}
                className="group/topic flex flex-col gap-1 rounded-md px-1.5 py-1 hover:bg-white/5"
                style={{ paddingLeft: (node.depth + 1) * 16 + 24 }}
              >
                <div className="flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5 shrink-0 text-cyan-300/80" />
                  <span className="truncate text-sm text-cyan-50" title={t.blurb ?? undefined}>
                    {t.name}
                  </span>
                  <div className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover/topic:opacity-100">
                    <button
                      onClick={() => onUnlink(t.id, node.id)}
                      className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80"
                      title="Quitar de esta categoría"
                    >
                      <Link2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onDeleteTopic(t.id)}
                      className="rounded p-1 text-white/40 hover:bg-red-500/20 hover:text-red-300"
                      title="Eliminar tema"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                {otherPaths.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pl-5">
                    <span className="text-[10px] text-white/35">también en:</span>
                    {otherPaths.map((p) => (
                      <button
                        key={p.categoryId}
                        onClick={() => onFocusCategory(p.categoryId)}
                        className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-200 transition hover:bg-cyan-400/20"
                        title={p.names.join(" / ")}
                      >
                        {p.names.join(" › ")}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {childCats.map((ch) => (
            <TreeNode
              key={ch.id}
              node={ch}
              categories={categories}
              topics={topics}
              links={links}
              expanded={expanded}
              toggle={toggle}
              focusedCat={focusedCat}
              onFocusCategory={onFocusCategory}
              onUnlink={onUnlink}
              onDeleteTopic={onDeleteTopic}
              onDeleteCategory={onDeleteCategory}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Vista MAPA 2D — SVG concept map con pan/zoom
// ════════════════════════════════════════════════════════════════════════════

function Map2DView({
  graph,
  layout,
  focusedCat,
  onFocusCategory,
}: {
  graph: KnowledgeGraph;
  layout: Map2DLayout;
  focusedCat: string | null;
  onFocusCategory: (refId: string) => void;
}) {
  const [scale, setScale] = useState(0.62);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const pos = useMemo(() => {
    const m = new Map<string, XY>();
    for (const [id, p] of layout.catPos) m.set(catNodeId(id), p);
    for (const [id, p] of layout.topicPos) m.set(topicNodeId(id), p);
    return m;
  }, [layout]);

  // Resaltado: la categoría enfocada, sus temas y aristas conectadas.
  const focusSet = useMemo(() => {
    if (!focusedCat) return null;
    const set = new Set<string>([catNodeId(focusedCat)]);
    for (const e of graph.edges) {
      if (e.target === catNodeId(focusedCat)) set.add(e.source);
      if (e.source === catNodeId(focusedCat)) set.add(e.target);
    }
    return set;
  }, [focusedCat, graph]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setScale((s) => Math.min(3, Math.max(0.2, s * factor)));
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
        ref={svgRef}
        className="h-full w-full touch-none"
        style={{ cursor: dragRef.current ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <g transform={`translate(${tx},${ty}) scale(${scale})`}>
          {/* Aristas */}
          {graph.edges.map((e, i) => {
            const a = pos.get(e.source);
            const b = pos.get(e.target);
            if (!a || !b) return null;
            const hot = !!focusSet && (focusSet.has(e.source) && focusSet.has(e.target));
            const dim = !!focusSet && !hot;
            return (
              <line
                key={`e${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={hot ? HIGHLIGHT_EDGE : e.kind === "tree" ? EDGE_TREE : EDGE_LINK}
                strokeWidth={hot ? 2.4 : e.kind === "tree" ? 1.6 : 1}
                strokeDasharray={e.kind === "link" ? "4 4" : undefined}
                opacity={dim ? 0.08 : 1}
              />
            );
          })}
          {/* Nodos */}
          {graph.nodes.map((n) => {
            const p = pos.get(n.id);
            if (!p) return null;
            const isCat = n.kind === "category";
            const r = isCat ? Math.max(8, 16 - (n.depth ?? 0) * 2) : 5.5;
            const hot = !!focusSet && focusSet.has(n.id);
            const dim = !!focusSet && !hot;
            const isHover = hover === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                opacity={dim ? 0.25 : 1}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onFocusCategory(n.refId)}
              >
                <circle
                  r={isHover || hot ? r * 1.25 : r}
                  fill={isCat ? CATEGORY_COLOR : TOPIC_COLOR}
                  stroke={hot ? HIGHLIGHT_EDGE : "rgba(0,0,0,0.4)"}
                  strokeWidth={hot ? 2 : 1}
                />
                {(isHover || hot || (isCat && (n.depth ?? 0) <= 1)) && (
                  <text
                    x={0}
                    y={-r - 6}
                    textAnchor="middle"
                    fontSize={isCat ? 13 : 11}
                    fontWeight={isCat ? 700 : 500}
                    fill={isCat ? "#fde9b8" : "#bff5ff"}
                    style={{ paintOrder: "stroke", pointerEvents: "none" }}
                    stroke="rgba(8,12,20,0.85)"
                    strokeWidth={3}
                  >
                    {n.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Controles */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button
          onClick={() => setScale((s) => Math.min(3, s * 1.2))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur hover:bg-black/70"
          title="Acercar"
        >
          +
        </button>
        <button
          onClick={() => setScale((s) => Math.max(0.2, s * 0.83))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur hover:bg-black/70"
          title="Alejar"
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
        <div className="mb-1 flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLOR }} /> Categoría
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: TOPIC_COLOR }} /> Tema
          </span>
        </div>
        <div className="text-white/45">Arrastra para mover · rueda para zoom · clic para enfocar</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Vista RED 3D — espejo de memory-mesh-3d.tsx (r3f + drei + three)
// ════════════════════════════════════════════════════════════════════════════

interface Node3D extends GraphNode {
  position: [number, number, number];
  color: string;
  size: number;
}

/** Layout 3D: categorías por nivel en esferas, temas cerca del centroide. */
function layout3D(graph: KnowledgeGraph): {
  nodes: Node3D[];
  posById: Map<string, [number, number, number]>;
} {
  const cats = graph.nodes.filter((n) => n.kind === "category").slice(0, MAX_NODES);
  const remaining = Math.max(0, MAX_NODES - cats.length);
  const tops = graph.nodes.filter((n) => n.kind === "topic").slice(0, remaining);

  const posById = new Map<string, [number, number, number]>();
  const nodes: Node3D[] = [];

  // Categorías: distribución esférica (Fibonacci) con radio según profundidad.
  const byDepth = new Map<number, GraphNode[]>();
  for (const c of cats) {
    const d = c.depth ?? 0;
    const arr = byDepth.get(d) ?? [];
    arr.push(c);
    byDepth.set(d, arr);
  }
  for (const [d, arr] of byDepth) {
    const radius = d === 0 ? 0 : 70 + d * 95;
    const n = arr.length;
    arr.forEach((c, i) => {
      let pos: [number, number, number];
      if (radius === 0) {
        const a = n <= 1 ? 0 : (i / n) * Math.PI * 2;
        pos = [Math.cos(a) * 18 * (n > 1 ? 1 : 0), 0, Math.sin(a) * 18 * (n > 1 ? 1 : 0)];
      } else {
        const t = n <= 1 ? 0.5 : i / (n - 1);
        const inclination = Math.acos(1 - 2 * (t * 0.86 + 0.07));
        const azimuth = Math.PI * (1 + Math.sqrt(5)) * i;
        pos = [
          radius * Math.sin(inclination) * Math.cos(azimuth),
          radius * Math.cos(inclination),
          radius * Math.sin(inclination) * Math.sin(azimuth),
        ];
      }
      posById.set(c.id, pos);
      nodes.push({
        ...c,
        position: pos,
        color: CATEGORY_COLOR,
        size: Math.max(5, 9 - d),
      });
    });
  }

  // Temas: centroide de sus categorías + jitter; si no tiene cat, anillo exterior.
  const linkByTopic = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.kind === "link") {
      const arr = linkByTopic.get(e.source) ?? [];
      arr.push(e.target);
      linkByTopic.set(e.source, arr);
    }
  }
  tops.forEach((t, i) => {
    const catNodeIds = linkByTopic.get(t.id) ?? [];
    const pts = catNodeIds
      .map((cid) => posById.get(cid))
      .filter((p): p is [number, number, number] => !!p);
    let base: [number, number, number] = [0, 0, 0];
    if (pts.length) {
      base = [
        pts.reduce((s, p) => s + p[0], 0) / pts.length,
        pts.reduce((s, p) => s + p[1], 0) / pts.length,
        pts.reduce((s, p) => s + p[2], 0) / pts.length,
      ];
    } else {
      const a = (i * 2.399963) % (Math.PI * 2);
      base = [Math.cos(a) * 360, (i % 5) * 20 - 40, Math.sin(a) * 360];
    }
    const ja = (i * 2.399963) % (Math.PI * 2);
    const pos: [number, number, number] = [
      base[0] + Math.cos(ja) * 32,
      base[1] + ((i % 3) - 1) * 24,
      base[2] + Math.sin(ja) * 32,
    ];
    posById.set(t.id, pos);
    nodes.push({ ...t, position: pos, color: TOPIC_COLOR, size: 4 });
  });

  return { nodes, posById };
}

function NodeMesh3D({
  node,
  dimmed,
  highlighted,
  hovered,
  onHover,
  onUnhover,
  onClick,
}: {
  node: Node3D;
  dimmed: boolean;
  highlighted: boolean;
  hovered: boolean;
  onHover: (id: string) => void;
  onUnhover: () => void;
  onClick: (node: Node3D) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const baseColor = useMemo(() => new THREE.Color(node.color), [node.color]);

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const target = hovered || highlighted ? 1.18 : 1;
    const s = THREE.MathUtils.damp(m.scale.x, target, 8, dt);
    m.scale.setScalar(s);
  });

  const emissiveIntensity = highlighted ? 0.9 : hovered ? 0.7 : 0.35;
  const opacity = dimmed ? 0.18 : 1;

  return (
    <mesh
      ref={ref}
      position={node.position}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(node.id);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onUnhover();
        document.body.style.cursor = "auto";
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick(node);
      }}
    >
      <sphereGeometry args={[node.size, 24, 24]} />
      <meshStandardMaterial
        color={baseColor}
        emissive={baseColor}
        emissiveIntensity={emissiveIntensity}
        roughness={0.35}
        metalness={0.25}
        transparent
        opacity={opacity}
      />
      {(hovered || highlighted) && (
        <Html center distanceFactor={node.kind === "category" ? 340 : 240} style={{ pointerEvents: "none" }}>
          <div
            style={{
              transform: "translateY(-150%)",
              whiteSpace: "nowrap",
              padding: "2px 8px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: "#f8fafc",
              background: "rgba(8,12,20,0.82)",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
            }}
          >
            {node.kind === "category" ? "📁 " : "# "}
            {node.name}
          </div>
        </Html>
      )}
    </mesh>
  );
}

function EdgeLine3D({
  from,
  to,
  color,
  dimmed,
  highlighted,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  dimmed: boolean;
  highlighted: boolean;
}) {
  return (
    <Line
      points={[from, to]}
      color={highlighted ? HIGHLIGHT_EDGE : color}
      lineWidth={highlighted ? 2.4 : 1}
      transparent
      opacity={dimmed ? 0.05 : highlighted ? 0.95 : 0.45}
    />
  );
}

function Scene3D({
  nodes,
  edges,
  posById,
  focusedNodeId,
  hoveredId,
  setHoveredId,
  onNodeClick,
}: {
  nodes: Node3D[];
  edges: KnowledgeGraph["edges"];
  posById: Map<string, [number, number, number]>;
  focusedNodeId: string | null;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  onNodeClick: (node: Node3D) => void;
}) {
  // Vecindario del nodo enfocado (él + adyacentes directos).
  const focusSet = useMemo(() => {
    if (!focusedNodeId) return null;
    const set = new Set<string>([focusedNodeId]);
    for (const e of edges) {
      if (e.source === focusedNodeId) set.add(e.target);
      if (e.target === focusedNodeId) set.add(e.source);
    }
    return set;
  }, [focusedNodeId, edges]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[200, 300, 200]} intensity={1.1} color="#ffe6b0" />
      <pointLight position={[-250, -150, -200]} intensity={0.5} color="#6fd1c9" />

      {edges.map((e, i) => {
        const a = posById.get(e.source);
        const b = posById.get(e.target);
        if (!a || !b) return null;
        const highlighted = !!focusSet && focusSet.has(e.source) && focusSet.has(e.target);
        const dimmed = !!focusSet && !highlighted;
        return (
          <EdgeLine3D
            key={`e${i}`}
            from={a}
            to={b}
            color={e.kind === "tree" ? EDGE_TREE : EDGE_LINK}
            dimmed={dimmed}
            highlighted={highlighted}
          />
        );
      })}

      {nodes.map((n) => {
        const highlighted = !!focusSet && focusSet.has(n.id);
        const dimmed = !!focusSet && !highlighted;
        return (
          <NodeMesh3D
            key={n.id}
            node={n}
            dimmed={dimmed}
            highlighted={highlighted}
            hovered={hoveredId === n.id}
            onHover={setHoveredId}
            onUnhover={() => setHoveredId(null)}
            onClick={onNodeClick}
          />
        );
      })}
    </>
  );
}

function Red3DView({
  graph,
  focusedCat,
  onFocusCategory,
}: {
  graph: KnowledgeGraph;
  focusedCat: string | null;
  onFocusCategory: (refId: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { nodes, posById } = useMemo(() => layout3D(graph), [graph]);
  const focusedNodeId = focusedCat ? catNodeId(focusedCat) : null;

  const onNodeClick = useCallback(
    (node: Node3D) => {
      // Solo las categorías participan del "enfoque" compartido entre vistas.
      if (node.kind === "category") onFocusCategory(node.refId);
    },
    [onFocusCategory],
  );

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[#0a0e16]">
      <Canvas camera={{ position: [0, 120, 420], fov: 55, near: 1, far: 6000 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={["#0a0e16"]} />
        <fogExp2 attach="fog" args={["#0a0e16", 0.0016]} />
        <OrbitControls enablePan enableZoom enableRotate minDistance={40} maxDistance={1800} makeDefault />
        <Scene3D
          nodes={nodes}
          edges={graph.edges}
          posById={posById}
          focusedNodeId={focusedNodeId}
          hoveredId={hoveredId}
          setHoveredId={setHoveredId}
          onNodeClick={onNodeClick}
        />
      </Canvas>

      <div className="pointer-events-none absolute bottom-3 left-3 max-w-xs rounded-xl border border-white/10 bg-black/45 p-2.5 text-[11px] text-white/70 backdrop-blur">
        <div className="mb-1.5 flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLOR }} /> Categoría
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: TOPIC_COLOR }} /> Tema
          </span>
        </div>
        <div className="text-white/45">
          {nodes.length} nodos · {graph.edges.length} aristas
          {graph.nodes.length > MAX_NODES && ` · (limitado a ${MAX_NODES})`}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Astraura — IA opcional ("explícame este tema/red")
// ════════════════════════════════════════════════════════════════════════════

interface ChatTurn {
  role: "user" | "ai";
  content: string;
  pending?: boolean;
}

const QUICK_PROMPTS = [
  "Explícame esta red de conocimiento",
  "¿Qué temas conectan ramas distintas?",
  "Sugiere categorías que me faltan",
  "Resume cómo está organizado",
];

function AstrauraPanel({ summary, onClose }: { summary: string; onClose: () => void }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const configs = loadConfigs();
      setHasProvider(configs.some((c) => c.enabled));
    } catch {
      setHasProvider(false);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;
      setInput("");

      const configs = loadConfigs();
      const activeId = getActiveProviderId();
      const activeConfig =
        configs.find((c) => c.enabled && c.id === activeId) ?? configs.find((c) => c.enabled);

      setTurns((prev) => [...prev, { role: "user", content: text }]);

      if (!activeConfig) {
        setHasProvider(false);
        setTurns((prev) => [
          ...prev,
          {
            role: "ai",
            content:
              "Configura tu IA en Astraura AI (Ajustes → IA & Modelos) para activar las explicaciones. Mientras tanto puedes explorar la red en las vistas Lista, Mapa 2D y Red 3D.",
          },
        ]);
        return;
      }

      const systemPrompt =
        "Eres Astraura, la IA compañera de StarSeed OS. Ayudas a la persona a ENTENDER su Red de " +
        "Conocimiento: categorías jerárquicas (árbol ramificado) y temas vinculados a una o más " +
        "categorías de distintas ramas (los vínculos forman la red). Explica temas, señala qué temas " +
        "actúan de puente entre ramas, y sugiere categorías o vínculos que podrían faltar. Responde en " +
        "español, concreto y accionable, con listas cortas cuando ayude.\n\nEstado actual de la red:\n" +
        summary;

      const history: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...turns
          .filter((m) => !m.pending)
          .map<ChatMessage>((m) => ({
            role: m.role === "ai" ? "assistant" : "user",
            content: m.content,
          })),
        { role: "user", content: text },
      ];

      setTurns((prev) => [...prev, { role: "ai", content: "", pending: true }]);
      setStreaming(true);
      abortRef.current = new AbortController();

      try {
        await chat({
          messages: history,
          temperature: 0.7,
          signal: abortRef.current.signal,
          onChunk: (delta: string) => {
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "ai" && last.pending) {
                next[next.length - 1] = { ...last, content: last.content + delta };
              }
              return next;
            });
          },
        });
        setTurns((prev) => prev.map((m) => (m.pending ? { ...m, pending: false } : m)));
      } catch (err) {
        const msg = (err as Error).message || "Error desconocido";
        setTurns((prev) => {
          const next = prev.filter((m) => !m.pending);
          next.push({ role: "ai", content: `No pude completar la consulta: ${msg}` });
          return next;
        });
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, summary, turns],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Sparkles className="h-4 w-4 text-amber-300" />
        <span className="text-sm font-semibold text-amber-50">Astraura</span>
        {hasProvider === false && (
          <Badge variant="outline" className="ml-auto text-[10px]">
            sin IA
          </Badge>
        )}
        {streaming && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-amber-300" />}
        <button
          onClick={onClose}
          className={cn("rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80", streaming || hasProvider === false ? "" : "ml-auto")}
          title="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {turns.length === 0 && (
          <div className="text-xs leading-relaxed text-white/55">
            Pídeme que <strong className="text-white/80">explique</strong> un tema o toda la{" "}
            <strong className="text-white/80">red</strong>, o que sugiera cómo organizarla mejor.
            {hasProvider === false && (
              <div className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/10 p-2 text-amber-200">
                Configura tu IA en Astraura AI para activar las respuestas.
              </div>
            )}
          </div>
        )}
        {turns.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-full whitespace-pre-wrap rounded-lg px-3 py-2 text-xs leading-relaxed",
              m.role === "user" ? "ml-auto bg-amber-500/15 text-amber-50" : "mr-auto bg-white/5 text-white/85",
            )}
          >
            {m.content || (m.pending ? "…" : "")}
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 px-3 py-2">
        <div className="mb-2 flex flex-wrap gap-1">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              disabled={streaming}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70 transition hover:bg-white/10 disabled:opacity-40"
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Pide a Astraura…"
            className="h-9 flex-1 text-sm"
          />
          {streaming ? (
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              onClick={() => {
                abortRef.current?.abort();
                setStreaming(false);
              }}
              title="Detener"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
            </Button>
          ) : (
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={() => send(input)} disabled={!input.trim()} title="Enviar">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Modales de creación / vínculo
// ════════════════════════════════════════════════════════════════════════════

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#11151f] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Componente principal
// ════════════════════════════════════════════════════════════════════════════

export default function KnowledgeNetwork() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [links, setLinks] = useState<TopicCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>("lista");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusedCat, setFocusedCat] = useState<string | null>(null);
  const [showAstraura, setShowAstraura] = useState(false);

  // Modales
  const [catModal, setCatModal] = useState<{ open: boolean; parentId: string | null }>({
    open: false,
    parentId: null,
  });
  const [catName, setCatName] = useState("");
  const [topicModal, setTopicModal] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [topicBlurb, setTopicBlurb] = useState("");
  const [linkModal, setLinkModal] = useState<{ open: boolean; topicId: string | null }>({
    open: false,
    topicId: null,
  });

  const reload = useCallback(async () => {
    try {
      const data = await loadKnowledge();
      setCategories(data.categories);
      setTopics(data.topics);
      setLinks(data.links);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await loadKnowledge();
        if (!alive) return;
        setCategories(data.categories);
        setTopics(data.topics);
        setLinks(data.links);
      } catch (err) {
        if (alive) setLoadError((err as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const tree = useMemo(() => buildTree(categories), [categories]);
  const graph = useMemo(() => buildGraph(categories, topics, links), [categories, topics, links]);
  const layout2D = useMemo(
    () => computeMap2D(tree, categories, topics, links),
    [tree, categories, topics, links],
  );

  const results = useMemo(
    () => (query.trim() ? searchKnowledge(query, categories, topics) : null),
    [query, categories, topics],
  );

  const summary = useMemo(() => {
    const roots = tree.map((r) => r.name);
    const bridgeTopics = topics
      .map((t) => ({ t, n: links.filter((l) => l.topic_id === t.id).length }))
      .filter((x) => x.n > 1)
      .map((x) => `"${x.t.name}" (${x.n} categorías)`);
    const lines = topics.slice(0, 30).map((t) => {
      const paths = topicPaths(t.id, links, categories).map((p) => p.names.join(" › "));
      return `- "${t.name}" → ${paths.length ? paths.join(" | ") : "sin categoría"}`;
    });
    return [
      `Categorías: ${categories.length} (raíces: ${roots.join(", ") || "—"}). Temas: ${topics.length}. Vínculos: ${links.length}.`,
      bridgeTopics.length ? `Temas puente (en varias ramas): ${bridgeTopics.join(", ")}.` : "Aún no hay temas que conecten varias ramas.",
      lines.length ? `Temas y sus ubicaciones:\n${lines.join("\n")}` : "Aún no hay temas.",
    ].join("\n");
  }, [categories, topics, links, tree]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Enfocar una categoría: resalta en todas las vistas y, en Lista, la expande
  // junto con sus ancestros.
  const onFocusCategory = useCallback(
    (refId: string) => {
      setFocusedCat(refId);
      setExpanded((prev) => {
        const next = new Set(prev);
        const byId = new Map(categories.map((c) => [c.id, c]));
        let cur = byId.get(refId);
        const guard = new Set<string>();
        while (cur && !guard.has(cur.id)) {
          next.add(cur.id);
          guard.add(cur.id);
          cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
        }
        return next;
      });
    },
    [categories],
  );

  // ── Acciones CRUD ──
  const submitCategory = useCallback(async () => {
    const name = catName.trim();
    if (!name) return;
    try {
      await addCategory({ name, parentId: catModal.parentId });
      setCatName("");
      setCatModal({ open: false, parentId: null });
      await reload();
      toast.success(`Categoría "${name}" creada`);
    } catch (err) {
      toast.error(`No se pudo crear: ${(err as Error).message}`);
    }
  }, [catName, catModal.parentId, reload]);

  const submitTopic = useCallback(async () => {
    const name = topicName.trim();
    if (!name) return;
    try {
      const created = await addTopic({ name, blurb: topicBlurb });
      setTopicName("");
      setTopicBlurb("");
      setTopicModal(false);
      await reload();
      toast.success(`Tema "${name}" creado`);
      // Encadena directo al vínculo para que el tema no quede huérfano.
      setLinkModal({ open: true, topicId: created.id });
    } catch (err) {
      toast.error(`No se pudo crear: ${(err as Error).message}`);
    }
  }, [topicName, topicBlurb, reload]);

  const doLink = useCallback(
    async (topicId: string, categoryId: string) => {
      try {
        await linkTopic(topicId, categoryId);
        await reload();
        toast.success("Vínculo creado");
      } catch (err) {
        toast.error(`No se pudo vincular: ${(err as Error).message}`);
      }
    },
    [reload],
  );

  const doUnlink = useCallback(
    async (topicId: string, categoryId: string) => {
      try {
        await unlinkTopic(topicId, categoryId);
        await reload();
      } catch (err) {
        toast.error(`No se pudo quitar el vínculo: ${(err as Error).message}`);
      }
    },
    [reload],
  );

  const doDeleteTopic = useCallback(
    async (topicId: string) => {
      try {
        await deleteTopic(topicId);
        await reload();
        toast.success("Tema eliminado");
      } catch (err) {
        toast.error(`No se pudo eliminar: ${(err as Error).message}`);
      }
    },
    [reload],
  );

  const doDeleteCategory = useCallback(
    async (categoryId: string) => {
      try {
        await deleteCategory(categoryId);
        if (focusedCat === categoryId) setFocusedCat(null);
        await reload();
        toast.success("Categoría eliminada");
      } catch (err) {
        toast.error(`No se pudo eliminar (¿tiene subcategorías o vínculos?): ${(err as Error).message}`);
      }
    },
    [reload, focusedCat],
  );

  const isEmpty = !loading && categories.length === 0 && topics.length === 0;
  const focusedCatName = focusedCat ? categoryPath(focusedCat, categories).join(" › ") : null;
  const linkModalTopic = linkModal.topicId ? topics.find((t) => t.id === linkModal.topicId) ?? null : null;
  const linkedCatIds = useMemo(
    () => new Set(links.filter((l) => l.topic_id === linkModal.topicId).map((l) => l.category_id)),
    [links, linkModal.topicId],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* ── Header: búsqueda + switcher + acciones ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-2 backdrop-blur">
        <div className="relative min-w-[180px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar categorías y temas…"
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
          <ViewBtn active={view === "red3d"} onClick={() => setView("red3d")} icon={<Network className="h-3.5 w-3.5" />} label="Red 3D" />
        </div>

        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setCatModal({ open: true, parentId: null })} title="Nueva categoría raíz">
            <FolderTree className="h-4 w-4" /> Categoría
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTopicModal(true)} title="Nuevo tema">
            <Hash className="h-4 w-4" /> Tema
          </Button>
          <Button
            size="sm"
            variant={showAstraura ? "default" : "outline"}
            onClick={() => setShowAstraura((s) => !s)}
            title="Astraura — explícame la red"
          >
            <Sparkles className="h-4 w-4" /> Astraura
          </Button>
        </div>
      </div>

      {/* ── Banner de enfoque ── */}
      {focusedCatName && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
          <span className="text-amber-300/70">Enfocando:</span>
          <span className="font-medium">{focusedCatName}</span>
          <button onClick={() => setFocusedCat(null)} className="ml-auto flex items-center gap-1 text-amber-200/80 hover:text-amber-100" title="Quitar enfoque">
            <RotateCcw className="h-3.5 w-3.5" /> Ver todo
          </button>
        </div>
      )}

      {/* ── Resultados de búsqueda ── */}
      {results && (results.categories.length > 0 || results.topics.length > 0) && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
          <div className="mb-2 text-xs uppercase tracking-wide text-white/40">Resultados</div>
          <div className="flex flex-wrap gap-1.5">
            {results.categories.map((c) => (
              <button
                key={`rc-${c.id}`}
                onClick={() => {
                  onFocusCategory(c.id);
                  if (view === "lista") setQuery("");
                }}
                className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-100 hover:bg-amber-400/20"
                title={categoryPath(c.id, categories).join(" / ")}
              >
                <FolderTree className="h-3 w-3" /> {categoryPath(c.id, categories).join(" › ")}
              </button>
            ))}
            {results.topics.map((t) => {
              const paths = topicPaths(t.id, links, categories);
              return (
                <div key={`rt-${t.id}`} className="flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-100">
                  <Hash className="h-3 w-3" /> {t.name}
                  {paths[0] && (
                    <button
                      onClick={() => onFocusCategory(paths[0].categoryId)}
                      className="ml-1 text-cyan-300/70 hover:text-cyan-100"
                      title={`Ir a ${paths[0].names.join(" / ")}`}
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Cuerpo: vista activa + panel Astraura ── */}
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="flex min-h-[60vh] items-center justify-center rounded-2xl border border-white/10 bg-black/20">
              <div className="flex items-center gap-2 text-white/60">
                <Loader2 className="h-5 w-5 animate-spin" /> Cargando la red de conocimiento…
              </div>
            </div>
          ) : isEmpty ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-6 text-center">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Boxes className="mx-auto h-10 w-10 text-amber-300/80" />
              </div>
              <div className="max-w-sm">
                <h3 className="text-lg font-semibold text-white/90">Tu red aún está vacía</h3>
                <p className="mt-1 text-sm text-white/55">
                  Crea categorías (árbol jerárquico) y temas que vincules a una o más categorías para
                  tejer la red. Luego explórala en Lista, Mapa 2D o Red 3D.
                </p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setCatModal({ open: true, parentId: null })}>
                    <FolderTree className="h-4 w-4" /> Nueva categoría
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setTopicModal(true)}>
                    <Hash className="h-4 w-4" /> Nuevo tema
                  </Button>
                </div>
              </div>
            </div>
          ) : view === "lista" ? (
            <div className="min-h-[60vh] rounded-2xl border border-white/10 bg-black/20 p-3">
              {tree.length === 0 ? (
                <div className="p-6 text-center text-sm text-white/50">
                  No hay categorías todavía. Crea una con “Categoría”.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {tree.map((root) => (
                    <TreeNode
                      key={root.id}
                      node={root}
                      categories={categories}
                      topics={topics}
                      links={links}
                      expanded={expanded}
                      toggle={toggle}
                      focusedCat={focusedCat}
                      onFocusCategory={onFocusCategory}
                      onUnlink={doUnlink}
                      onDeleteTopic={doDeleteTopic}
                      onDeleteCategory={doDeleteCategory}
                      onAddChild={(parentId) => setCatModal({ open: true, parentId })}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : view === "mapa2d" ? (
            <div className="min-h-[60vh] h-[72vh]">
              <Map2DView graph={graph} layout={layout2D} focusedCat={focusedCat} onFocusCategory={onFocusCategory} />
            </div>
          ) : (
            <div className="min-h-[60vh] h-[72vh]">
              <Red3DView graph={graph} focusedCat={focusedCat} onFocusCategory={onFocusCategory} />
            </div>
          )}
        </div>

        {showAstraura && (
          <div className="hidden w-80 shrink-0 self-stretch overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md md:flex">
            <AstrauraPanel summary={summary} onClose={() => setShowAstraura(false)} />
          </div>
        )}
      </div>

      {loadError && !loading && (
        <div className="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-1.5 text-[11px] text-red-200">
          No se pudieron cargar todos los datos: {loadError}
        </div>
      )}

      {/* ════ Modales ════ */}
      {catModal.open && (
        <Overlay onClose={() => setCatModal({ open: false, parentId: null })}>
          <div className="mb-3 flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-amber-300" />
            <h3 className="text-sm font-semibold text-amber-50">
              {catModal.parentId
                ? `Nueva subcategoría en "${categories.find((c) => c.id === catModal.parentId)?.name ?? ""}"`
                : "Nueva categoría raíz"}
            </h3>
          </div>
          <Input
            autoFocus
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCategory()}
            placeholder="Nombre de la categoría"
            className="mb-3"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCatModal({ open: false, parentId: null })}>
              Cancelar
            </Button>
            <Button size="sm" onClick={submitCategory} disabled={!catName.trim()}>
              <Plus className="h-4 w-4" /> Crear
            </Button>
          </div>
        </Overlay>
      )}

      {topicModal && (
        <Overlay onClose={() => setTopicModal(false)}>
          <div className="mb-3 flex items-center gap-2">
            <Hash className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-semibold text-cyan-50">Nuevo tema</h3>
          </div>
          <Input
            autoFocus
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            placeholder="Nombre del tema (p.ej. Inteligencia Artificial)"
            className="mb-2"
          />
          <Input
            value={topicBlurb}
            onChange={(e) => setTopicBlurb(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitTopic()}
            placeholder="Descripción breve (opcional)"
            className="mb-3"
          />
          <p className="mb-3 text-[11px] text-white/45">
            Tras crearlo podrás vincularlo a una o más categorías de distintas ramas.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setTopicModal(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={submitTopic} disabled={!topicName.trim()}>
              <Plus className="h-4 w-4" /> Crear y vincular
            </Button>
          </div>
        </Overlay>
      )}

      {linkModal.open && linkModalTopic && (
        <Overlay onClose={() => setLinkModal({ open: false, topicId: null })}>
          <div className="mb-3 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-semibold text-cyan-50">
              Vínculos de "{linkModalTopic.name}"
            </h3>
          </div>
          <p className="mb-2 text-[11px] text-white/45">
            Marca las categorías donde vive este tema. Puede estar en varias ramas a la vez.
          </p>
          <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">
            {categories.length === 0 ? (
              <div className="p-3 text-center text-xs text-white/45">Crea categorías primero.</div>
            ) : (
              categories
                .slice()
                .sort((a, b) =>
                  categoryPath(a.id, categories)
                    .join(" / ")
                    .localeCompare(categoryPath(b.id, categories).join(" / ")),
                )
                .map((c) => {
                  const on = linkedCatIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        on
                          ? doUnlink(linkModalTopic.id, c.id)
                          : doLink(linkModalTopic.id, c.id)
                      }
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition",
                        on ? "bg-cyan-500/15 text-cyan-100" : "text-white/70 hover:bg-white/5",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          on ? "border-cyan-400 bg-cyan-400/30" : "border-white/20",
                        )}
                      >
                        {on && <span className="h-2 w-2 rounded-sm bg-cyan-300" />}
                      </span>
                      <span className="truncate">{categoryPath(c.id, categories).join(" › ")}</span>
                    </button>
                  );
                })
            )}
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={() => setLinkModal({ open: false, topicId: null })}>
              Listo
            </Button>
          </div>
        </Overlay>
      )}
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
