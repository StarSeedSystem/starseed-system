"use client";

/**
 * StarSeed OS — BrainMindMap3D
 * ============================================================================
 * Mapa mental 3D, creativo e intuitivo, de la materia gris del usuario:
 *
 *   • Cerebros (brains)              → núcleos dorados (nodos primarios).
 *   • Archivos de memoria            → RAMAS que cuelgan de cada cerebro
 *     (brain_memory_files)             (soul.md, memory.md, dream.md, skills.md,
 *                                       apis.md…), con color + icono por tipo.
 *   • Memorias (memories)            → nodos satélite enlazados al cerebro a
 *                                       través de su baúl (vault_id ∈
 *                                       brain.includes.vaults). Las memorias sin
 *                                       cerebro flotan en una nebulosa aparte.
 *   • Aristas                        → muestran ramificaciones e interconexiones;
 *                                       resaltado de la rama al enfocar un nodo.
 *
 * SELECCIÓN DIRECTA: al hacer clic en un nodo se abre un panel lateral para
 * inspeccionarlo y ajustarlo SIN salir del mapa:
 *   - Archivo: se abre su contenido .md (editable + autosave), se cambia su
 *     FUENTE/servidor (source), su server_config (endpoint, folder, claves por
 *     referencia…) y su sincronización (sync). Se guarda en Supabase (RLS por
 *     owner) y el realtime refresca el mapa en vivo.
 *   - Cerebro / Memoria: ficha con sus parámetros reales (sólo lectura).
 *
 * Reutiliza el MISMO stack 3D que red-3d / memorias-3d:
 *   @react-three/fiber + @react-three/drei (OrbitControls, Html, Line) + three.
 * Reutiliza la capa de datos/escrituras de la MEMORIA del cerebro:
 *   @/lib/cerebro/memory-files  (no toca los paneles internos del cerebro).
 *
 * SSR-safe: "use client" + debe cargarse con next/dynamic { ssr:false }.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import {
  Brain,
  FileText,
  Sparkles,
  Moon,
  Wand2,
  Plug,
  Boxes,
  Save,
  Loader2,
  RotateCcw,
  Network,
  GitBranch,
  Layers,
  X,
  RefreshCw,
  Server,
  Eye,
  EyeOff,
  Link2,
} from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import {
  MEMORY_SOURCES,
  memorySourceById,
  updateMemoryContent,
  setMemorySource,
  type MemoryFile,
  type MemorySource,
} from "@/lib/cerebro/memory-files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────────────────
// Tipos de las filas que leemos (sólo lectura del grafo)
// ────────────────────────────────────────────────────────────────────────────

interface BrainRow {
  id: string;
  owner: string;
  name: string | null;
  includes?: { vaults?: string[] | null } | Record<string, unknown> | null;
  servers?: unknown;
}

interface MemoryRow {
  id: string;
  owner: string;
  name: string | null;
  kinds?: string[] | null;
  format?: string | null;
  scope?: string | null;
  vault_id?: string | null;
  content?: string | null;
}

type LayoutMode = "ramificado" | "radial" | "tipo";

type NodeKind = "brain" | "file" | "memory";

interface GNode {
  id: string;
  label: string;
  kind: NodeKind;
  refId: string; // id del registro original
  subtitle?: string;
  color: string;
  size: number;
  position: [number, number, number];
  /** Tipo de archivo normalizado (soul/memory/dream/skills/apis/otros). */
  fileKey?: string;
}

type EdgeKind = "brain-file" | "brain-memory";

interface GEdge {
  id: string;
  source: string;
  target: string;
  color: string;
  kind: EdgeKind;
  width: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Paleta + iconografía por tipo de archivo de memoria
// ────────────────────────────────────────────────────────────────────────────

const BRAIN_COLOR = "#fcd34d"; // ámbar — el cerebro
const MEMORY_COLOR = "#22d3ee"; // cian — las memorias

// Color por archivo .md conocido (rama del cerebro).
const FILE_COLORS: Record<string, string> = {
  soul: "#c084fc", // violeta — alma
  memory: "#38bdf8", // azul cielo — memoria
  dream: "#818cf8", // índigo — sueños
  skills: "#fbbf24", // ámbar — habilidades
  apis: "#34d399", // verde — apis/conexiones
  otros: "#94a3b8", // gris — otros
};

const FILE_ICON_EMOJI: Record<string, string> = {
  soul: "✨",
  memory: "📖",
  dream: "🌙",
  skills: "🪄",
  apis: "🔌",
  otros: "📄",
};

const EDGE_BRAIN_FILE = "#c084fc55";
const EDGE_BRAIN_MEMORY = "#22d3ee55";
const HIGHLIGHT_EDGE = "#fde68a";

const MAX_NODES = 240;

function fileKeyOf(name: string): string {
  const base = (name || "").toLowerCase().replace(/\.md$/i, "").trim();
  if (base in FILE_COLORS) return base;
  return "otros";
}

function fileColor(name: string): string {
  return FILE_COLORS[fileKeyOf(name)] ?? FILE_COLORS.otros;
}

function fileEmoji(name: string): string {
  return FILE_ICON_EMOJI[fileKeyOf(name)] ?? FILE_ICON_EMOJI.otros;
}

function FileLucide({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const k = fileKeyOf(name);
  if (k === "soul") return <Sparkles className={className} style={style} />;
  if (k === "dream") return <Moon className={className} style={style} />;
  if (k === "skills") return <Wand2 className={className} style={style} />;
  if (k === "apis") return <Plug className={className} style={style} />;
  return <FileText className={className} style={style} />;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers de geometría
// ────────────────────────────────────────────────────────────────────────────

function vaultIdsOf(brain: BrainRow): string[] {
  const inc = brain.includes as { vaults?: unknown } | null | undefined;
  const v = inc?.vaults;
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

function ring(
  cx: number,
  cz: number,
  radius: number,
  i: number,
  n: number,
  y = 0,
): [number, number, number] {
  const a = n <= 1 ? 0 : (i / n) * Math.PI * 2;
  return [cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius];
}

// ────────────────────────────────────────────────────────────────────────────
// Construcción del grafo
// ────────────────────────────────────────────────────────────────────────────

interface BuiltGraph {
  nodes: GNode[];
  edges: GEdge[];
  branchMap: Map<string, Set<string>>; // nodeId → ids de su rama (incl. él)
}

interface ShowFlags {
  brain: boolean;
  file: boolean;
  memory: boolean;
}

function buildGraph(
  brains: BrainRow[],
  files: MemoryFile[],
  memories: MemoryRow[],
  mode: LayoutMode,
  show: ShowFlags,
): BuiltGraph {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const branchMap = new Map<string, Set<string>>();
  const nodeIds = new Set<string>();
  let budget = MAX_NODES;

  const addNode = (n: GNode): boolean => {
    if (budget <= 0 || nodeIds.has(n.id)) return nodeIds.has(n.id);
    nodes.push(n);
    nodeIds.add(n.id);
    branchMap.set(n.id, new Set<string>([n.id]));
    budget--;
    return true;
  };
  const link = (a: string, b: string) => {
    branchMap.get(a)?.add(b);
    branchMap.get(b)?.add(a);
  };

  // ── Núcleos: cerebros ──
  const B = brains.length;
  const brainRadius = Math.max(140, B * 46);
  const brainPos = new Map<string, [number, number, number]>();

  if (show.brain) {
    brains.forEach((br, bi) => {
      const pos = ring(0, 0, B <= 1 ? 0 : brainRadius, bi, B, 0);
      brainPos.set(br.id, pos);
      addNode({
        id: `b:${br.id}`,
        label: br.name?.trim() || "Cerebro",
        kind: "brain",
        refId: br.id,
        color: BRAIN_COLOR,
        size: 10,
        position: pos,
      });
    });
  }

  const posOfBrain = (id: string): [number, number, number] =>
    brainPos.get(id) ?? [0, 0, 0];

  // ── Ramas: archivos de memoria por cerebro ──
  // brain_id null → archivos "de cuenta": se agrupan en un núcleo virtual.
  const filesByBrain = new Map<string | null, MemoryFile[]>();
  for (const f of files) {
    const key = f.brain_id ?? null;
    const arr = filesByBrain.get(key) ?? [];
    arr.push(f);
    filesByBrain.set(key, arr);
  }

  // Núcleo virtual para archivos sin cerebro (cuenta).
  const accountFiles = filesByBrain.get(null) ?? [];
  let accountCenter: [number, number, number] | null = null;
  if (show.file && accountFiles.length) {
    accountCenter = [0, -40, brainRadius * 1.9 + 60];
    addNode({
      id: "b:__account__",
      label: "Cuenta (sin cerebro)",
      kind: "brain",
      refId: "__account__",
      subtitle: "archivos de cuenta",
      color: "#64748b",
      size: 7,
      position: accountCenter,
    });
  }

  if (show.file) {
    if (mode === "tipo") {
      // Layout por tipo: todas las ramas del mismo tipo en su propio anillo.
      const byKey = new Map<string, MemoryFile[]>();
      for (const f of files) {
        const k = fileKeyOf(f.name);
        const arr = byKey.get(k) ?? [];
        arr.push(f);
        byKey.set(k, arr);
      }
      const keys = [...byKey.keys()];
      keys.forEach((k, ki) => {
        const groupAngle = keys.length <= 1 ? 0 : (ki / keys.length) * Math.PI * 2;
        const gx = Math.cos(groupAngle) * (brainRadius * 1.7);
        const gz = Math.sin(groupAngle) * (brainRadius * 1.7);
        const list = byKey.get(k)!;
        list.forEach((f, fi) => {
          const pos = ring(gx, gz, 40 + list.length * 3.2, fi, list.length, 30 + (fi % 4) * 12);
          addFileNode(f, pos);
        });
      });
    } else {
      // Radial / Ramificado: cada archivo cuelga de su cerebro.
      filesByBrain.forEach((list, brainId) => {
        const center =
          brainId === null
            ? (accountCenter ?? [0, -40, brainRadius * 1.9])
            : posOfBrain(brainId);
        const [bx, by, bz] = center;
        list.forEach((f, fi) => {
          let pos: [number, number, number];
          if (mode === "ramificado") {
            // Ramas en abanico hacia arriba, como un árbol de pensamiento.
            const spread = list.length <= 1 ? 0 : fi / (list.length - 1) - 0.5;
            pos = [
              bx + spread * Math.max(58, list.length * 13),
              by + 46 + (fi % 3) * 16,
              bz - 44 - (fi % 2) * 14,
            ];
          } else {
            pos = ring(
              bx,
              bz,
              48 + Math.min(list.length, 10) * 3,
              fi,
              list.length,
              by + 18 + ((fi % 3) * 12 - 12),
            );
          }
          addFileNode(f, pos);
        });
      });
    }

    // aristas cerebro↔archivo
    files.forEach((f) => {
      const parent = f.brain_id ? `b:${f.brain_id}` : "b:__account__";
      const fId = `f:${f.id}`;
      if (!nodeIds.has(parent) || !nodeIds.has(fId)) return;
      edges.push({
        id: `e:bf:${f.id}`,
        source: parent,
        target: fId,
        color: EDGE_BRAIN_FILE,
        kind: "brain-file",
        width: 1.5,
      });
      link(parent, fId);
    });
  }

  function addFileNode(f: MemoryFile, pos: [number, number, number]) {
    const k = fileKeyOf(f.name);
    addNode({
      id: `f:${f.id}`,
      label: f.name,
      kind: "file",
      refId: f.id,
      subtitle: memorySourceById(String(f.source))?.label ?? String(f.source),
      color: fileColor(f.name),
      size: k === "otros" ? 4.4 : 5.4,
      position: pos,
      fileKey: k,
    });
  }

  // ── Satélites: memorias enlazadas al cerebro por su baúl ──
  // memory.vault_id ∈ brain.includes.vaults  →  pertenece a ese cerebro.
  const brainByVault = new Map<string, string>();
  for (const br of brains) for (const vid of vaultIdsOf(br)) brainByVault.set(vid, br.id);

  if (show.memory) {
    const memByBrain = new Map<string, MemoryRow[]>();
    const looseMems: MemoryRow[] = [];
    for (const m of memories) {
      const bId = m.vault_id ? brainByVault.get(m.vault_id) : undefined;
      if (bId && brainPos.has(bId)) {
        const arr = memByBrain.get(bId) ?? [];
        arr.push(m);
        memByBrain.set(bId, arr);
      } else {
        looseMems.push(m);
      }
    }

    if (mode === "tipo") {
      // Todas las memorias en un anillo exterior propio.
      memories.forEach((m, mi) => {
        const pos = ring(0, 0, brainRadius * 2.3, mi, memories.length, -70 + (mi % 3) * 14);
        addMemoryNode(m, pos);
      });
    } else {
      memByBrain.forEach((list, brainId) => {
        const [bx, by, bz] = posOfBrain(brainId);
        list.forEach((m, mi) => {
          let pos: [number, number, number];
          if (mode === "ramificado") {
            const spread = list.length <= 1 ? 0 : mi / (list.length - 1) - 0.5;
            pos = [
              bx + spread * Math.max(70, list.length * 12),
              by - 40 - (mi % 3) * 14,
              bz + 56 + (mi % 2) * 16,
            ];
          } else {
            pos = ring(
              bx,
              bz,
              84 + Math.min(list.length, 12) * 2.6,
              mi,
              Math.max(list.length, 1),
              by - 26 - (mi % 3) * 10,
            );
          }
          addMemoryNode(m, pos);
        });
      });
      // memorias sin cerebro → nebulosa exterior.
      looseMems.forEach((m, mi) => {
        const pos = ring(
          0,
          0,
          brainRadius * 2.4,
          mi,
          Math.max(looseMems.length, 1),
          -90 + (mi % 4) * 12,
        );
        addMemoryNode(m, pos);
      });
    }

    // aristas cerebro↔memoria (sólo cuando hay relación por baúl)
    memories.forEach((m) => {
      const bId = m.vault_id ? brainByVault.get(m.vault_id) : undefined;
      if (!bId) return;
      const parent = `b:${bId}`;
      const mId = `m:${m.id}`;
      if (!nodeIds.has(parent) || !nodeIds.has(mId)) return;
      edges.push({
        id: `e:bm:${m.id}`,
        source: parent,
        target: mId,
        color: EDGE_BRAIN_MEMORY,
        kind: "brain-memory",
        width: 1.3,
      });
      link(parent, mId);
    });
  }

  function addMemoryNode(m: MemoryRow, pos: [number, number, number]) {
    const k = (m.kinds ?? []).find(Boolean);
    addNode({
      id: `m:${m.id}`,
      label: m.name?.trim() || "Memoria",
      kind: "memory",
      refId: m.id,
      subtitle: k ?? m.format ?? undefined,
      color: MEMORY_COLOR,
      size: 4.2,
      position: pos,
    });
  }

  return { nodes, edges, branchMap };
}

// ────────────────────────────────────────────────────────────────────────────
// Primitivas 3D
// ────────────────────────────────────────────────────────────────────────────

function NodeMesh({
  node,
  dimmed,
  highlighted,
  selected,
  hovered,
  onHover,
  onUnhover,
  onClick,
}: {
  node: GNode;
  dimmed: boolean;
  highlighted: boolean;
  selected: boolean;
  hovered: boolean;
  onHover: (id: string) => void;
  onUnhover: () => void;
  onClick: (node: GNode) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const baseColor = useMemo(() => new THREE.Color(node.color), [node.color]);

  useFrame((state, dt) => {
    const m = ref.current;
    if (m) {
      const target = selected ? 1.32 : hovered || highlighted ? 1.18 : 1;
      const s = THREE.MathUtils.damp(m.scale.x, target, 8, dt);
      m.scale.setScalar(s);
    }
    // Halo del nodo seleccionado: gira suavemente.
    if (ringRef.current && selected) {
      ringRef.current.rotation.z += dt * 0.8;
      ringRef.current.rotation.x = Math.PI / 2.4;
    }
  });

  const emissiveIntensity = selected ? 1.1 : highlighted ? 0.9 : hovered ? 0.7 : 0.34;
  const opacity = dimmed ? 0.16 : 1;
  const segs = node.kind === "brain" ? 30 : 22;

  return (
    <group position={node.position}>
      <mesh
        ref={ref}
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
        <sphereGeometry args={[node.size, segs, segs]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={emissiveIntensity}
          roughness={0.32}
          metalness={0.28}
          transparent
          opacity={opacity}
        />
      </mesh>

      {selected && (
        <mesh ref={ringRef}>
          <torusGeometry args={[node.size * 1.8, node.size * 0.09, 8, 48]} />
          <meshBasicMaterial color={HIGHLIGHT_EDGE} transparent opacity={0.85} />
        </mesh>
      )}

      {(hovered || highlighted || selected) && (
        <Html
          center
          distanceFactor={node.kind === "brain" ? 360 : 240}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              transform: "translateY(-160%)",
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
            {node.kind === "brain"
              ? "🧠 "
              : node.kind === "file"
                ? `${fileEmoji(node.label)} `
                : "🌟 "}
            {node.label}
            {node.subtitle ? (
              <span style={{ opacity: 0.6, fontWeight: 400 }}> · {node.subtitle}</span>
            ) : null}
          </div>
        </Html>
      )}
    </group>
  );
}

function EdgeLine({
  from,
  to,
  color,
  width,
  dimmed,
  highlighted,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  width: number;
  dimmed: boolean;
  highlighted: boolean;
}) {
  return (
    <Line
      points={[from, to]}
      color={highlighted ? HIGHLIGHT_EDGE : color}
      lineWidth={highlighted ? width + 1.4 : width}
      transparent
      opacity={dimmed ? 0.05 : highlighted ? 0.95 : 0.5}
    />
  );
}

function SceneContent({
  graph,
  focusedNode,
  selectedId,
  hoveredId,
  setHoveredId,
  onNodeClick,
}: {
  graph: BuiltGraph;
  focusedNode: string | null;
  selectedId: string | null;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  onNodeClick: (node: GNode) => void;
}) {
  const posById = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const n of graph.nodes) map.set(n.id, n.position);
    return map;
  }, [graph]);

  const branchSet = useMemo(() => {
    if (!focusedNode) return null;
    const set = new Set<string>([focusedNode]);
    const b = graph.branchMap.get(focusedNode);
    if (b) b.forEach((id) => set.add(id));
    return set;
  }, [focusedNode, graph]);

  return (
    <>
      <ambientLight intensity={0.62} />
      <pointLight position={[220, 320, 220]} intensity={1.15} color="#ffe6b0" />
      <pointLight position={[-260, -160, -220]} intensity={0.55} color="#7fd6ff" />
      <pointLight position={[0, 80, -260]} intensity={0.4} color="#c084fc" />

      {graph.edges.map((e) => {
        const a = posById.get(e.source);
        const b = posById.get(e.target);
        if (!a || !b) return null;
        const highlighted = !!branchSet && (branchSet.has(e.source) || branchSet.has(e.target));
        const dimmed = !!branchSet && !highlighted;
        return (
          <EdgeLine
            key={e.id}
            from={a}
            to={b}
            color={e.color}
            width={e.width}
            dimmed={dimmed}
            highlighted={highlighted}
          />
        );
      })}

      {graph.nodes.map((n) => {
        const highlighted = !!branchSet && branchSet.has(n.id);
        const dimmed = !!branchSet && !highlighted;
        return (
          <NodeMesh
            key={n.id}
            node={n}
            dimmed={dimmed}
            highlighted={highlighted}
            selected={selectedId === n.id}
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

// ────────────────────────────────────────────────────────────────────────────
// Panel de inspección/ajuste del nodo seleccionado
// ────────────────────────────────────────────────────────────────────────────

function FileInspector({
  file,
  onClose,
  onSaved,
}: {
  file: MemoryFile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(file.content);
  const [dirty, setDirty] = useState(false);
  const [savingContent, setSavingContent] = useState(false);

  const [source, setSource] = useState<MemorySource>(
    (file.source as MemorySource) || "starseed",
  );
  const [sync, setSync] = useState<boolean>(!!file.sync);
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const c: Record<string, string> = {};
    for (const [k, v] of Object.entries(file.server_config || {})) c[k] = String(v ?? "");
    return c;
  });
  const [savingSource, setSavingSource] = useState(false);

  // Al cambiar de archivo seleccionado, resincroniza el formulario.
  useEffect(() => {
    setDraft(file.content);
    setDirty(false);
    setSource((file.source as MemorySource) || "starseed");
    setSync(!!file.sync);
    const c: Record<string, string> = {};
    for (const [k, v] of Object.entries(file.server_config || {})) c[k] = String(v ?? "");
    setConfig(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  const def = memorySourceById(source);

  const saveContent = useCallback(async () => {
    setSavingContent(true);
    const ok = await updateMemoryContent(file.id, draft);
    setSavingContent(false);
    if (ok) {
      setDirty(false);
      onSaved();
    }
  }, [file.id, draft, onSaved]);

  const saveSource = useCallback(async () => {
    setSavingSource(true);
    const ok = await setMemorySource(file.id, source, config, sync);
    setSavingSource(false);
    if (ok) onSaved();
  }, [file.id, source, config, sync, onSaved]);

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={<FileLucide name={file.name} className="h-4 w-4" style={{ color: fileColor(file.name) }} />}
        title={file.name}
        badge="Archivo de memoria"
        badgeColor={fileColor(file.name)}
        onClose={onClose}
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {/* Editor del contenido .md */}
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
              Contenido (.md)
            </label>
            <Button
              size="sm"
              variant={dirty ? "default" : "outline"}
              className="h-7 gap-1 px-2 text-xs"
              disabled={!dirty || savingContent}
              onClick={saveContent}
              title="Guardar contenido"
            >
              {savingContent ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
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
            className="min-h-[180px] resize-y font-mono text-xs leading-relaxed"
            placeholder="# Escribe en markdown…"
          />
        </section>

        {/* Fuente / servidor */}
        <section>
          <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            <Server className="h-3.5 w-3.5" /> Fuente / servidor
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {MEMORY_SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSource(s.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-2 text-left text-xs transition",
                  source === s.id
                    ? "border-violet-500/50 bg-violet-500/10"
                    : "border-white/10 hover:bg-white/5",
                )}
              >
                <div className="flex items-center gap-1.5 font-medium text-white/90">
                  <span>{s.icon}</span> {s.label}
                  {s.oss && (
                    <span className="ml-auto rounded bg-emerald-500/15 px-1 text-[9px] text-emerald-300">
                      open
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
          {def?.blurb && <p className="mt-1.5 text-[11px] leading-snug text-white/45">{def.blurb}</p>}
        </section>

        {/* Config del servidor (campos por fuente) */}
        {def && def.fields.length > 0 && (
          <section className="space-y-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
              Configuración de conexión
            </label>
            {def.fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-[11px] text-white/55">{f.label}</label>
                <Input
                  value={config[f.key] ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="h-8 text-xs"
                />
              </div>
            ))}
          </section>
        )}

        {/* Sincronización */}
        <section className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-cyan-300" />
            <div>
              <div className="text-xs font-medium text-white/90">Sincronización</div>
              <div className="text-[11px] text-white/45">
                {sync ? "Activa — se replica a la fuente" : "Inactiva — sólo local en StarSeed"}
              </div>
            </div>
          </div>
          <Switch checked={sync} onCheckedChange={setSync} />
        </section>

        {/* Características de conexión (resumen) */}
        <section className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-white/55">
          <div className="mb-1 font-semibold text-white/70">Características de conexión</div>
          <ul className="space-y-0.5">
            <li>
              Tipo de archivo: <span className="text-white/80">{fileKeyOf(file.name)}</span>
            </li>
            <li>
              Pertenece a: <span className="text-white/80">{file.brain_id ? "cerebro" : "cuenta"}</span>
            </li>
            <li>
              Fuente activa: <span className="text-white/80">{def?.label ?? source}</span>
            </li>
            <li>
              Última actualización:{" "}
              <span className="text-white/80">
                {file.updated_at ? new Date(file.updated_at).toLocaleString() : "—"}
              </span>
            </li>
          </ul>
        </section>
      </div>

      <div className="border-t border-white/10 px-3 py-2">
        <Button
          className="w-full gap-2"
          size="sm"
          onClick={saveSource}
          disabled={savingSource}
          title="Guardar fuente, configuración y sincronización"
        >
          {savingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Guardar fuente y conexión
        </Button>
      </div>
    </div>
  );
}

function BrainInspector({
  node,
  brains,
  files,
  memories,
  onClose,
  onFocus,
}: {
  node: GNode;
  brains: BrainRow[];
  files: MemoryFile[];
  memories: MemoryRow[];
  onClose: () => void;
  onFocus: () => void;
}) {
  const isAccount = node.refId === "__account__";
  const brain = brains.find((b) => b.id === node.refId);
  const myFiles = files.filter((f) =>
    isAccount ? f.brain_id == null : f.brain_id === node.refId,
  );
  const vaults = brain ? vaultIdsOf(brain) : [];
  const myMems = isAccount
    ? []
    : memories.filter((m) => m.vault_id && vaults.includes(m.vault_id));
  const serverCount = Array.isArray((brain?.servers as unknown[]) ?? null)
    ? (brain!.servers as unknown[]).length
    : 0;

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={<Brain className="h-4 w-4 text-amber-300" />}
        title={node.label}
        badge={isAccount ? "Cuenta" : "Cerebro"}
        badgeColor={BRAIN_COLOR}
        onClose={onClose}
      />
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Archivos" value={myFiles.length} color="#c084fc" />
          <Stat label="Memorias" value={myMems.length} color={MEMORY_COLOR} />
          <Stat label="Baúles" value={vaults.length} color="#34d399" />
        </div>

        <section>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            Ramas (archivos)
          </div>
          {myFiles.length === 0 ? (
            <p className="text-xs text-white/45">Sin archivos aún.</p>
          ) : (
            <ul className="space-y-1">
              {myFiles.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs"
                >
                  <span style={{ color: fileColor(f.name) }}>{fileEmoji(f.name)}</span>
                  <span className="text-white/85">{f.name}</span>
                  <span className="ml-auto text-[10px] text-white/40">
                    {memorySourceById(String(f.source))?.label ?? String(f.source)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!isAccount && (
          <section className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-white/55">
            <div className="mb-1 font-semibold text-white/70">Parámetros</div>
            <ul className="space-y-0.5">
              <li>
                ID: <span className="font-mono text-white/70">{node.refId.slice(0, 8)}…</span>
              </li>
              <li>
                Servidores enlazados: <span className="text-white/80">{serverCount}</span>
              </li>
              <li>
                Baúles incluidos: <span className="text-white/80">{vaults.length}</span>
              </li>
            </ul>
            <p className="mt-1.5 text-white/40">
              Configura servidores y permisos del cerebro en{" "}
              <a className="text-cyan-300 underline" href="/cerebro">
                /cerebro
              </a>
              .
            </p>
          </section>
        )}
      </div>
      <div className="border-t border-white/10 px-3 py-2">
        <Button variant="outline" size="sm" className="w-full gap-2" onClick={onFocus}>
          <GitBranch className="h-4 w-4" /> Enfocar esta rama
        </Button>
      </div>
    </div>
  );
}

function MemoryInspector({
  node,
  memory,
  onClose,
  onFocus,
}: {
  node: GNode;
  memory: MemoryRow | null;
  onClose: () => void;
  onFocus: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={<span className="text-base leading-none">🌟</span>}
        title={node.label}
        badge="Memoria"
        badgeColor={MEMORY_COLOR}
        onClose={onClose}
      />
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        <div className="flex flex-wrap gap-1">
          {(memory?.kinds ?? []).filter(Boolean).map((k) => (
            <Badge key={k} variant="outline" className="text-[10px]">
              {k}
            </Badge>
          ))}
          {memory?.format && (
            <Badge variant="outline" className="text-[10px]">
              {memory.format}
            </Badge>
          )}
          {memory?.scope && (
            <Badge variant="outline" className="text-[10px]">
              {memory.scope}
            </Badge>
          )}
        </div>
        <section>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            Contenido
          </div>
          <div className="max-h-[260px] overflow-y-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-white/75">
            {memory?.content?.trim() || "—"}
          </div>
        </section>
        <section className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-white/55">
          <div className="mb-1 font-semibold text-white/70">Características de conexión</div>
          <ul className="space-y-0.5">
            <li>
              Baúl:{" "}
              <span className="font-mono text-white/70">
                {memory?.vault_id ? `${memory.vault_id.slice(0, 8)}…` : "sin baúl"}
              </span>
            </li>
            <li>
              Enlazada a un cerebro:{" "}
              <span className="text-white/80">{memory?.vault_id ? "sí (vía baúl)" : "no"}</span>
            </li>
          </ul>
        </section>
      </div>
      <div className="border-t border-white/10 px-3 py-2">
        <Button variant="outline" size="sm" className="w-full gap-2" onClick={onFocus}>
          <GitBranch className="h-4 w-4" /> Enfocar conexión
        </Button>
      </div>
    </div>
  );
}

function PanelHeader({
  icon,
  title,
  badge,
  badgeColor,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  badge: string;
  badgeColor: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white/95">{title}</div>
        <div className="flex items-center gap-1 text-[10px]" style={{ color: badgeColor }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: badgeColor }} />
          {badge}
        </div>
      </div>
      <button
        onClick={onClose}
        className="shrink-0 rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white/90"
        title="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center">
      <div className="text-lg font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] text-white/45">{label}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Componente principal
// ────────────────────────────────────────────────────────────────────────────

export default function BrainMindMap3D({ className = "" }: { className?: string }) {
  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        if (alive) setUid(data?.user?.id ?? null);
      } catch {
        /* sin sesión */
      } finally {
        if (alive) setAuthReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const ownerFilter = useMemo(
    () => (uid ? `owner=eq.${uid}` : undefined),
    [uid],
  );

  // Cerebros (realtime).
  const { rows: brains, loading: lb } = useRealtimeRows<BrainRow>(
    "brains",
    async () => {
      if (!uid) return [];
      const sb = createClient();
      const { data } = await sb
        .from("brains")
        .select("id,owner,name,includes,servers")
        .eq("owner", uid)
        .limit(200);
      return (data as BrainRow[]) ?? [];
    },
    { filter: ownerFilter, idKey: "id" },
  );

  // Archivos de memoria de TODOS los cerebros del usuario (realtime).
  const { rows: files, loading: lf, reload: reloadFiles } = useRealtimeRows<MemoryFile>(
    "brain_memory_files",
    async () => {
      if (!uid) return [];
      const sb = createClient();
      const { data } = await sb
        .from("brain_memory_files")
        .select("*")
        .eq("owner", uid)
        .order("name", { ascending: true })
        .limit(600);
      return ((data as Record<string, unknown>[]) ?? []).map((row) => ({
        id: String(row.id ?? ""),
        owner: (row.owner as string) ?? undefined,
        brain_id: (row.brain_id as string) ?? null,
        name: (row.name as string) || "nota.md",
        content: (row.content as string) ?? "",
        source: (row.source as string) || "starseed",
        server_config: (row.server_config as Record<string, unknown>) || {},
        meta: (row.meta as Record<string, unknown>) || {},
        sync: !!row.sync,
        updated_at: (row.updated_at as string) ?? undefined,
        created_at: (row.created_at as string) ?? undefined,
      })) as MemoryFile[];
    },
    { filter: ownerFilter, idKey: "id" },
  );

  // Memorias (realtime).
  const { rows: memories, loading: lm } = useRealtimeRows<MemoryRow>(
    "memories",
    async () => {
      if (!uid) return [];
      const sb = createClient();
      const { data } = await sb
        .from("memories")
        .select("id,owner,name,kinds,format,scope,vault_id,content")
        .eq("owner", uid)
        .limit(400);
      return (data as MemoryRow[]) ?? [];
    },
    { filter: ownerFilter, idKey: "id" },
  );

  const loading = !authReady || lb || lf || lm;

  const [mode, setMode] = useState<LayoutMode>("ramificado");
  const [show, setShow] = useState<ShowFlags>({ brain: true, file: true, memory: true });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const graph = useMemo(
    () => buildGraph(brains, files, memories, mode, show),
    [brains, files, memories, mode, show],
  );

  // Nodo seleccionado (objeto vivo del grafo + registro original).
  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph, selectedId],
  );
  const selectedFile = useMemo(
    () =>
      selectedNode?.kind === "file"
        ? files.find((f) => f.id === selectedNode.refId) ?? null
        : null,
    [selectedNode, files],
  );
  const selectedMemory = useMemo(
    () =>
      selectedNode?.kind === "memory"
        ? memories.find((m) => m.id === selectedNode.refId) ?? null
        : null,
    [selectedNode, memories],
  );

  const onNodeClick = useCallback((node: GNode) => {
    setSelectedId(node.id);
    setFocusedNode(node.id);
  }, []);

  const closePanel = useCallback(() => {
    setSelectedId(null);
    setFocusedNode(null);
  }, []);

  const toggle = useCallback((key: keyof ShowFlags) => {
    setShow((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const isEmpty = !loading && brains.length === 0 && files.length === 0 && memories.length === 0;

  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-2xl bg-[#080b12]", className)}>
      {!isEmpty && (
        <Canvas
          camera={{ position: [0, 130, 420], fov: 55, near: 1, far: 6000 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
        >
          <color attach="background" args={["#080b12"]} />
          <fogExp2 attach="fog" args={["#080b12", 0.0014]} />
          <OrbitControls
            enablePan
            enableZoom
            enableRotate
            autoRotate={!selectedId && !hoveredId}
            autoRotateSpeed={0.35}
            minDistance={45}
            maxDistance={2000}
            makeDefault
          />
          <SceneContent
            graph={graph}
            focusedNode={focusedNode}
            selectedId={selectedId}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
            onNodeClick={onNodeClick}
          />
        </Canvas>
      )}

      {/* Controles superiores */}
      {!isEmpty && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 p-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-black/50 p-1 backdrop-blur">
            <ViewBtn
              active={mode === "ramificado"}
              onClick={() => setMode("ramificado")}
              icon={<GitBranch className="h-3.5 w-3.5" />}
              label="Ramificado"
            />
            <ViewBtn
              active={mode === "radial"}
              onClick={() => setMode("radial")}
              icon={<Network className="h-3.5 w-3.5" />}
              label="Radial"
            />
            <ViewBtn
              active={mode === "tipo"}
              onClick={() => setMode("tipo")}
              icon={<Layers className="h-3.5 w-3.5" />}
              label="Por tipo"
            />
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-black/50 p-1 backdrop-blur">
            <TypeToggle
              on={show.brain}
              onClick={() => toggle("brain")}
              color={BRAIN_COLOR}
              icon={<Brain className="h-3.5 w-3.5" />}
              label="Cerebros"
            />
            <TypeToggle
              on={show.file}
              onClick={() => toggle("file")}
              color="#c084fc"
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Archivos"
            />
            <TypeToggle
              on={show.memory}
              onClick={() => toggle("memory")}
              color={MEMORY_COLOR}
              icon={<Boxes className="h-3.5 w-3.5" />}
              label="Memorias"
            />
          </div>

          {focusedNode && (
            <button
              onClick={closePanel}
              className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white/70 backdrop-blur transition hover:bg-black/70"
              title="Quitar enfoque"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Ver todo
            </button>
          )}
        </div>
      )}

      {/* Leyenda de tipos de archivo */}
      {!isEmpty && (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-md rounded-xl border border-white/10 bg-black/45 p-2.5 text-[11px] text-white/70 backdrop-blur">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <LegendDot color={BRAIN_COLOR} label="Cerebro" big />
            <LegendDot color={FILE_COLORS.soul} label="soul" />
            <LegendDot color={FILE_COLORS.memory} label="memory" />
            <LegendDot color={FILE_COLORS.dream} label="dream" />
            <LegendDot color={FILE_COLORS.skills} label="skills" />
            <LegendDot color={FILE_COLORS.apis} label="apis" />
            <LegendDot color={MEMORY_COLOR} label="memoria" />
          </div>
          <div className="text-white/45">
            {graph.nodes.length} nodos · {graph.edges.length} conexiones
            {graph.nodes.length >= MAX_NODES && " · (limitado a 240)"} · clic en un nodo para ajustarlo
          </div>
        </div>
      )}

      {/* Panel lateral de inspección / ajuste */}
      {!isEmpty && selectedNode && (
        <div className="absolute bottom-3 right-3 top-3 z-20 flex w-[22rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17]/95 shadow-2xl backdrop-blur-md">
          {selectedNode.kind === "file" && selectedFile ? (
            <FileInspector file={selectedFile} onClose={closePanel} onSaved={reloadFiles} />
          ) : selectedNode.kind === "brain" ? (
            <BrainInspector
              node={selectedNode}
              brains={brains}
              files={files}
              memories={memories}
              onClose={closePanel}
              onFocus={() => setFocusedNode(selectedNode.id)}
            />
          ) : selectedNode.kind === "memory" ? (
            <MemoryInspector
              node={selectedNode}
              memory={selectedMemory}
              onClose={closePanel}
              onFocus={() => setFocusedNode(selectedNode.id)}
            />
          ) : null}
        </div>
      )}

      {/* Carga */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" /> Tejiendo tu mapa mental…
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="relative">
            <div className="absolute -inset-4 animate-pulse rounded-full bg-amber-400/10 blur-xl" />
            <div className="relative rounded-2xl border border-white/10 bg-white/5 p-4">
              <Brain className="mx-auto h-10 w-10 text-amber-300/80" />
            </div>
          </div>
          <div className="max-w-sm">
            <h3 className="text-lg font-semibold text-white/90">Aún no hay cerebros ni memorias</h3>
            <p className="mt-1 text-sm text-white/55">
              Crea tu primer cerebro y sus archivos (soul.md, memory.md, dream.md, skills.md,
              apis.md) para verlos aquí como un mapa mental 3D con sus ramificaciones e
              interconexiones.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button asChild size="sm">
                <a href="/cerebro">
                  <Brain className="h-4 w-4" /> Crear el primero en /cerebro
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href="/cerebros">
                  <Boxes className="h-4 w-4" /> Cerebros
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Controles UI auxiliares
// ────────────────────────────────────────────────────────────────────────────

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

function TypeToggle({
  on,
  onClick,
  color,
  icon,
  label,
}: {
  on: boolean;
  onClick: () => void;
  color: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition",
        on ? "text-white/85" : "text-white/35",
      )}
      style={on ? { boxShadow: `inset 0 0 0 1px ${color}55` } : undefined}
      title={`Mostrar/ocultar ${label}`}
    >
      <span className="flex items-center">{on ? icon : <EyeOff className="h-3.5 w-3.5" />}</span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full" style={{ background: on ? color : "#475569" }} />
        {label}
      </span>
    </button>
  );
}

function LegendDot({ color, label, big }: { color: string; label: string; big?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="rounded-full"
        style={{ background: color, width: big ? 10 : 8, height: big ? 10 : 8 }}
      />
      {label}
    </span>
  );
}
