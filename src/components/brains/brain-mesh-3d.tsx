"use client";

/**
 * StarSeed OS — BrainMesh3D
 *
 * Grafo 3D interactivo de la "red" de interconexión del usuario:
 *
 *   • Cerebros (brains) como nodos centrales.
 *   • Servidores (brain_servers) enlazados a cerebros vía brain_server_links
 *     (etiqueta = rol; grosor de la arista por prioridad).
 *   • Almacenes de datos (storage_backends) — se resaltan los de scope
 *     brain/vault; aristas cerebro↔almacén (scope=brain) y baúl↔almacén
 *     (scope=vault).
 *   • Baúles (vaults) enlazados a cerebros cuando brain.includes.vaults los
 *     incluye (arista cerebro↔baúl).
 *   • 3 vistas de layout: Radial · Por tipo · Ramificado.
 *   • Hover → etiqueta, clic → enfoque/resalte de la rama del nodo.
 *   • Toggles para mostrar/ocultar cada tipo de nodo y de arista + leyenda.
 *   • Panel lateral "Astraura": pide a la IA organizar / explicar la red.
 *
 * Implementado con @react-three/fiber + @react-three/drei (declarativo),
 * espejando memory-mesh-3d.tsx. SSR-safe: lleva "use client" y debe cargarse
 * con next/dynamic { ssr:false }.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import {
  Boxes,
  Brain,
  Server,
  Database,
  Send,
  Loader2,
  Sparkles,
  Eye,
  EyeOff,
  RotateCcw,
  Network,
  GitBranch,
  Layers,
} from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import { chat } from "@/ai/client/chat";
import { loadConfigs, getActiveProviderId } from "@/ai/client/providerStore";
import type { ChatMessage } from "@/ai/providers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface BrainRow {
  id: string;
  owner: string;
  name: string | null;
  includes?: { vaults?: string[] | null } | Record<string, unknown> | null;
  servers?: unknown;
}

interface ServerRow {
  id: string;
  owner: string;
  name: string | null;
  kind?: string | null;
  endpoint?: string | null;
  status?: string | null;
}

interface ServerLinkRow {
  brain_id: string;
  server_id: string;
  role?: string | null;
  priority?: number | null;
  sync?: Record<string, unknown> | null;
}

interface BackendRow {
  id: string;
  owner: string;
  name: string | null;
  kind?: string | null;
  scope?: string | null;
  scope_ref?: string | null;
  enabled?: boolean | null;
}

interface VaultRow {
  id: string;
  owner: string;
  name: string | null;
}

type LayoutMode = "radial" | "tipo" | "ramificado";

type NodeKind = "brain" | "server" | "datastore" | "vault";

interface GNode {
  id: string;
  label: string;
  kind: NodeKind;
  refId: string; // id del registro original
  subtitle?: string;
  color: string;
  size: number;
  position: [number, number, number];
}

type EdgeKind = "brain-server" | "brain-datastore" | "vault-datastore" | "brain-vault";

interface GEdge {
  id: string;
  source: string;
  target: string;
  color: string;
  kind: EdgeKind;
  label?: string;
  width: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Paleta por tipo de nodo + aristas
// ────────────────────────────────────────────────────────────────────────────

const BRAIN_COLOR = "#fcd34d"; // ámbar
const SERVER_COLOR = "#60a5fa"; // azul
const DATASTORE_COLOR = "#34d399"; // verde
const VAULT_COLOR = "#c084fc"; // violeta

const EDGE_BRAIN_SERVER = "#60a5fa66";
const EDGE_BRAIN_DATASTORE = "#34d39966";
const EDGE_VAULT_DATASTORE = "#22d3ee66";
const EDGE_BRAIN_VAULT = "#c084fc66";
const HIGHLIGHT_EDGE = "#fde68a";

const MAX_NODES = 200;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
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

function priorityWidth(priority?: number | null): number {
  const p = typeof priority === "number" ? priority : 1;
  // prioridad 1 (alta) → más grueso. Limitar 1..3.
  const w = 3.2 - Math.min(Math.max(p, 1), 6) * 0.4;
  return Math.max(1, Math.min(3, w));
}

// ────────────────────────────────────────────────────────────────────────────
// Graph build
// ────────────────────────────────────────────────────────────────────────────

interface BuiltGraph {
  nodes: GNode[];
  edges: GEdge[];
  branchMap: Map<string, Set<string>>; // nodeId → ids de su rama (incl. él mismo)
}

interface ShowFlags {
  brain: boolean;
  server: boolean;
  datastore: boolean;
  vault: boolean;
  eBrainServer: boolean;
  eBrainDatastore: boolean;
  eVaultDatastore: boolean;
  eBrainVault: boolean;
}

function buildGraph(
  brains: BrainRow[],
  servers: ServerRow[],
  links: ServerLinkRow[],
  backends: BackendRow[],
  vaults: VaultRow[],
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

  const serverById = new Map(servers.map((s) => [s.id, s]));
  const vaultById = new Map(vaults.map((v) => [v.id, v]));

  // Índices de relaciones para layout "Ramificado".
  const vaultsByBrain = new Map<string, string[]>();
  for (const b of brains) {
    const vs = vaultIdsOf(b).filter((id) => vaultById.has(id));
    if (vs.length) vaultsByBrain.set(b.id, vs);
  }

  // ── Nodos cerebro (centros) ──
  const B = brains.length;
  const brainRadius = Math.max(150, B * 40);
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
        size: 9,
        position: pos,
      });
    });
  }

  // Posición efectiva de un cerebro (fallback al origen si está oculto).
  const posOfBrain = (id: string): [number, number, number] =>
    brainPos.get(id) ?? [0, 0, 0];

  // ── Servidores + aristas cerebro↔servidor ──
  // Cada link define una relación; un servidor puede colgar de varios cerebros.
  if (show.server) {
    const linksByBrain = new Map<string, ServerLinkRow[]>();
    for (const l of links) {
      if (!serverById.has(l.server_id)) continue;
      const arr = linksByBrain.get(l.brain_id) ?? [];
      arr.push(l);
      linksByBrain.set(l.brain_id, arr);
    }

    if (mode === "tipo") {
      // Layout "por tipo": todos los servidores en su propio anillo global.
      const ring0: [number, number, number] = [-brainRadius * 1.6, 60, 0];
      servers.forEach((s, si) => {
        const pos = ring(ring0[0], ring0[2], 70 + servers.length * 1.5, si, servers.length, ring0[1]);
        addNode({
          id: `s:${s.id}`,
          label: s.name?.trim() || "Servidor",
          kind: "server",
          refId: s.id,
          subtitle: s.kind ?? undefined,
          color: SERVER_COLOR,
          size: 4.6,
          position: pos,
        });
      });
    } else {
      linksByBrain.forEach((ls, brainId) => {
        const [bx, by, bz] = posOfBrain(brainId);
        ls.forEach((l, li) => {
          const s = serverById.get(l.server_id)!;
          const sid = `s:${s.id}`;
          if (!nodeIds.has(sid)) {
            let pos: [number, number, number];
            if (mode === "ramificado") {
              const spread = ls.length <= 1 ? 0 : li / (ls.length - 1) - 0.5;
              pos = [bx + spread * Math.max(70, ls.length * 14), by + 40 + (li % 2) * 16, bz - 50 - li * 6];
            } else {
              pos = ring(bx, bz, 44 + Math.min(ls.length, 8) * 3, li, ls.length, by + ((li % 3) * 10 - 10));
            }
            addNode({
              id: sid,
              label: s.name?.trim() || "Servidor",
              kind: "server",
              refId: s.id,
              subtitle: s.kind ?? undefined,
              color: SERVER_COLOR,
              size: 4.6,
              position: pos,
            });
          }
        });
      });
      // servidores sin link válido también se muestran (sueltos).
      servers.forEach((s, si) => {
        const sid = `s:${s.id}`;
        if (!nodeIds.has(sid) && !links.some((l) => l.server_id === s.id && brainPos.has(l.brain_id))) {
          const pos = ring(0, 0, brainRadius * 1.7, si, servers.length, -80);
          addNode({
            id: sid,
            label: s.name?.trim() || "Servidor",
            kind: "server",
            refId: s.id,
            subtitle: s.kind ?? undefined,
            color: SERVER_COLOR,
            size: 4.2,
            position: pos,
          });
        }
      });
    }

    // aristas cerebro↔servidor por cada link
    if (show.eBrainServer && show.brain) {
      const seen = new Set<string>();
      links.forEach((l) => {
        const bId = `b:${l.brain_id}`;
        const sId = `s:${l.server_id}`;
        if (!nodeIds.has(bId) || !nodeIds.has(sId)) return;
        const key = `${bId}=>${sId}`;
        if (seen.has(key)) return;
        seen.add(key);
        edges.push({
          id: `e:bs:${l.brain_id}:${l.server_id}`,
          source: bId,
          target: sId,
          color: EDGE_BRAIN_SERVER,
          kind: "brain-server",
          label: l.role?.trim() || undefined,
          width: priorityWidth(l.priority),
        });
        link(bId, sId);
      });
    }
  }

  // ── Baúles + aristas cerebro↔baúl ──
  // Solo se materializan los baúles referenciados por includes.vaults.
  const includedVaultIds = new Set<string>();
  for (const b of brains) for (const vid of vaultIdsOf(b)) if (vaultById.has(vid)) includedVaultIds.add(vid);

  if (show.vault) {
    if (mode === "tipo") {
      const list = [...includedVaultIds];
      list.forEach((vid, vi) => {
        const v = vaultById.get(vid)!;
        const pos = ring(brainRadius * 1.6, 0, 60 + list.length * 2, vi, list.length, -40);
        addNode({
          id: `v:${vid}`,
          label: v.name?.trim() || "Baúl",
          kind: "vault",
          refId: vid,
          color: VAULT_COLOR,
          size: 6,
          position: pos,
        });
      });
    } else {
      brains.forEach((br) => {
        const vs = (vaultsByBrain.get(br.id) ?? []).filter((id) => includedVaultIds.has(id));
        const [bx, by, bz] = posOfBrain(br.id);
        vs.forEach((vid, vi) => {
          const v = vaultById.get(vid)!;
          if (nodeIds.has(`v:${vid}`)) return;
          let pos: [number, number, number];
          if (mode === "ramificado") {
            const spread = vs.length <= 1 ? 0 : vi / (vs.length - 1) - 0.5;
            pos = [bx + spread * Math.max(60, vs.length * 12), by - 36 - (vi % 2) * 14, bz + 60 + vi * 6];
          } else {
            pos = ring(bx, bz, 70 + Math.min(vs.length, 8) * 3, vi, Math.max(vs.length, 1), by - 22 - vi * 4);
          }
          addNode({
            id: `v:${vid}`,
            label: v.name?.trim() || "Baúl",
            kind: "vault",
            refId: vid,
            color: VAULT_COLOR,
            size: 6,
            position: pos,
          });
        });
      });
    }

    // aristas cerebro↔baúl
    if (show.eBrainVault && show.brain) {
      brains.forEach((br) => {
        for (const vid of vaultIdsOf(br)) {
          const bId = `b:${br.id}`;
          const vId = `v:${vid}`;
          if (!nodeIds.has(bId) || !nodeIds.has(vId)) continue;
          edges.push({
            id: `e:bv:${br.id}:${vid}`,
            source: bId,
            target: vId,
            color: EDGE_BRAIN_VAULT,
            kind: "brain-vault",
            width: 1.4,
          });
          link(bId, vId);
        }
      });
    }
  }

  // ── Almacenes de datos (storage_backends) ──
  // Resaltamos los de scope brain/vault, que se enganchan a su nodo de scope.
  const scopedBackends = backends.filter((bk) => {
    if (bk.scope === "brain") return brainPos.has(bk.scope_ref ?? "");
    if (bk.scope === "vault") return nodeIds.has(`v:${bk.scope_ref ?? ""}`);
    return false;
  });
  const looseBackends = backends.filter((bk) => !scopedBackends.includes(bk));

  if (show.datastore) {
    if (mode === "tipo") {
      backends.forEach((bk, di) => {
        const pos = ring(0, brainRadius * 1.6, 60 + backends.length * 2, di, backends.length, 50);
        addNode({
          id: `d:${bk.id}`,
          label: bk.name?.trim() || "Almacén",
          kind: "datastore",
          refId: bk.id,
          subtitle: bk.kind ?? bk.scope ?? undefined,
          color: DATASTORE_COLOR,
          size: bk.scope === "brain" || bk.scope === "vault" ? 4.4 : 3.6,
          position: pos,
        });
      });
    } else {
      // anclados a su scope (brain/vault); el resto, en un anillo exterior.
      scopedBackends.forEach((bk) => {
        const anchor =
          bk.scope === "brain"
            ? posOfBrain(bk.scope_ref!)
            : (nodes.find((n) => n.id === `v:${bk.scope_ref}`)?.position ?? ([0, 0, 0] as [number, number, number]));
        const siblings = scopedBackends.filter(
          (o) => o.scope === bk.scope && o.scope_ref === bk.scope_ref,
        );
        const idx = siblings.indexOf(bk);
        let pos: [number, number, number];
        if (mode === "ramificado") {
          const spread = siblings.length <= 1 ? 0 : idx / (siblings.length - 1) - 0.5;
          pos = [anchor[0] + spread * 40, anchor[1] + 26 + (idx % 2) * 12, anchor[2] + 28 + idx * 5];
        } else {
          pos = ring(anchor[0], anchor[2], 26 + siblings.length * 3, idx, Math.max(siblings.length, 1), anchor[1] + 18 + idx * 4);
        }
        addNode({
          id: `d:${bk.id}`,
          label: bk.name?.trim() || "Almacén",
          kind: "datastore",
          refId: bk.id,
          subtitle: bk.kind ?? bk.scope ?? undefined,
          color: DATASTORE_COLOR,
          size: 4.4,
          position: pos,
        });
      });
      looseBackends.forEach((bk, di) => {
        const pos = ring(0, 0, brainRadius * 1.9, di, Math.max(looseBackends.length, 1), 70 + (di % 3) * 10);
        addNode({
          id: `d:${bk.id}`,
          label: bk.name?.trim() || "Almacén",
          kind: "datastore",
          refId: bk.id,
          subtitle: bk.kind ?? bk.scope ?? undefined,
          color: DATASTORE_COLOR,
          size: 3.4,
          position: pos,
        });
      });
    }

    // aristas cerebro↔almacén (scope=brain)
    if (show.eBrainDatastore && show.brain) {
      backends.forEach((bk) => {
        if (bk.scope !== "brain" || !bk.scope_ref) return;
        const bId = `b:${bk.scope_ref}`;
        const dId = `d:${bk.id}`;
        if (!nodeIds.has(bId) || !nodeIds.has(dId)) return;
        edges.push({
          id: `e:bd:${bk.scope_ref}:${bk.id}`,
          source: bId,
          target: dId,
          color: EDGE_BRAIN_DATASTORE,
          kind: "brain-datastore",
          width: 1.4,
        });
        link(bId, dId);
      });
    }
    // aristas baúl↔almacén (scope=vault)
    if (show.eVaultDatastore && show.vault) {
      backends.forEach((bk) => {
        if (bk.scope !== "vault" || !bk.scope_ref) return;
        const vId = `v:${bk.scope_ref}`;
        const dId = `d:${bk.id}`;
        if (!nodeIds.has(vId) || !nodeIds.has(dId)) return;
        edges.push({
          id: `e:vd:${bk.scope_ref}:${bk.id}`,
          source: vId,
          target: dId,
          color: EDGE_VAULT_DATASTORE,
          kind: "vault-datastore",
          width: 1.4,
        });
        link(vId, dId);
      });
    }
  }

  return { nodes, edges, branchMap };
}

// ────────────────────────────────────────────────────────────────────────────
// 3D primitives
// ────────────────────────────────────────────────────────────────────────────

function NodeMesh({
  node,
  dimmed,
  highlighted,
  hovered,
  onHover,
  onUnhover,
  onClick,
}: {
  node: GNode;
  dimmed: boolean;
  highlighted: boolean;
  hovered: boolean;
  onHover: (id: string) => void;
  onUnhover: () => void;
  onClick: (node: GNode) => void;
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
        <Html center distanceFactor={node.kind === "brain" ? 360 : 240} style={{ pointerEvents: "none" }}>
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
            {node.kind === "brain"
              ? "🧠 "
              : node.kind === "server"
                ? "🖥 "
                : node.kind === "datastore"
                  ? "🗃 "
                  : "🗄 "}
            {node.label}
            {node.subtitle ? (
              <span style={{ opacity: 0.6, fontWeight: 400 }}> · {node.subtitle}</span>
            ) : null}
          </div>
        </Html>
      )}
    </mesh>
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
  hoveredId,
  setHoveredId,
  onNodeClick,
}: {
  graph: BuiltGraph;
  focusedNode: string | null;
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
      <ambientLight intensity={0.6} />
      <pointLight position={[200, 300, 200]} intensity={1.1} color="#ffe6b0" />
      <pointLight position={[-250, -150, -200]} intensity={0.5} color="#6fd1c9" />

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
// Astraura panel (chat → IA). Mismo patrón que MemoryMesh3D.
// ────────────────────────────────────────────────────────────────────────────

interface ChatTurn {
  role: "user" | "ai";
  content: string;
  pending?: boolean;
}

const QUICK_PROMPTS = [
  "Explícame mi red de cerebros y servidores",
  "¿Cómo organizo mejor mis almacenes de datos?",
  "Resume las conexiones de mi red",
  "¿Qué servidor conviene priorizar en cada cerebro?",
];

function AstrauraPanel({
  summary,
  onFocusByName,
}: {
  summary: string;
  onFocusByName: (name: string) => void;
}) {
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
              "Configura tu IA en AI Studio (Ajustes → IA & Modelos) y vuelve. Mientras tanto puedo mostrarte tus cerebros, servidores y almacenes en el mapa.",
          },
        ]);
        return;
      }

      const systemPrompt =
        "Eres Astraura, la IA compañera de StarSeed OS. Ayudas a la persona a ENTENDER, ORGANIZAR y " +
        "EXPLICAR su red de interconexión: cerebros, servidores, almacenes de datos y baúles, y cómo " +
        "se enlazan entre sí (roles y prioridades de servidores, scope de los almacenes, baúles incluidos). " +
        "Responde en español, concreto y accionable, con listas cortas cuando ayude. Si recomiendas " +
        "enfocar un nodo concreto, nómbralo entre comillas.\n\nEstado actual de la red:\n" +
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

  const lastAi = turns.filter((m) => m.role === "ai" && !m.pending).at(-1)?.content ?? "";
  const quotedNames = useMemo(() => {
    const out: string[] = [];
    const re = /[«"“]([^"»”]{2,40})[»"”]/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(lastAi))) out.push(mm[1].trim());
    return [...new Set(out)];
  }, [lastAi]);

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
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {turns.length === 0 && (
          <div className="text-xs leading-relaxed text-white/55">
            Pídeme que <strong className="text-white/80">organice</strong> o{" "}
            <strong className="text-white/80">explique</strong> tu red de cerebros, servidores y datos.
            {hasProvider === false && (
              <div className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/10 p-2 text-amber-200">
                Configura tu IA en AI Studio para activar las respuestas.
              </div>
            )}
          </div>
        )}
        {turns.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-full rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
              m.role === "user"
                ? "ml-auto bg-amber-500/15 text-amber-50"
                : "mr-auto bg-white/5 text-white/85",
            )}
          >
            {m.content || (m.pending ? "…" : "")}
          </div>
        ))}
        {quotedNames.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {quotedNames.map((nm) => (
              <button
                key={nm}
                onClick={() => onFocusByName(nm)}
                className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200 transition hover:bg-amber-400/20"
              >
                Enfocar “{nm}”
              </button>
            ))}
          </div>
        )}
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
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => send(input)}
              disabled={!input.trim()}
              title="Enviar"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Componente principal
// ────────────────────────────────────────────────────────────────────────────

export default function BrainMesh3D({ className = "" }: { className?: string }) {
  const [brains, setBrains] = useState<BrainRow[]>([]);
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [serverLinks, setServerLinks] = useState<ServerLinkRow[]>([]);
  const [backends, setBackends] = useState<BackendRow[]>([]);
  const [vaults, setVaults] = useState<VaultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<LayoutMode>("radial");
  const [show, setShow] = useState<ShowFlags>({
    brain: true,
    server: true,
    datastore: true,
    vault: true,
    eBrainServer: true,
    eBrainDatastore: true,
    eVaultDatastore: true,
    eBrainVault: true,
  });

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedNode, setFocusedNode] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createClient();
        const { data: au } = await sb.auth.getUser();
        const uid = au?.user?.id ?? null;
        if (!uid) {
          if (alive) {
            setLoading(false);
            setBrains([]);
            setServers([]);
            setServerLinks([]);
            setBackends([]);
            setVaults([]);
          }
          return;
        }
        const [brainRes, serverRes, backendRes, vaultRes] = await Promise.all([
          sb.from("brains").select("id,owner,name,includes,servers").eq("owner", uid).limit(200),
          sb.from("brain_servers").select("id,owner,name,kind,endpoint,status").eq("owner", uid).limit(300),
          sb
            .from("storage_backends")
            .select("id,owner,name,kind,scope,scope_ref,enabled")
            .eq("owner", uid)
            .limit(400),
          sb.from("vaults").select("id,owner,name").eq("owner", uid).limit(300),
        ]);
        if (!alive) return;

        const brainRows = (brainRes.data as BrainRow[]) ?? [];
        const brainIds = brainRows.map((b) => b.id);
        // brain_server_links no tiene owner: filtramos por brain_id del usuario.
        let linkRows: ServerLinkRow[] = [];
        if (brainIds.length) {
          const linkRes = await sb
            .from("brain_server_links")
            .select("brain_id,server_id,role,priority,sync")
            .in("brain_id", brainIds)
            .limit(600);
          if (alive) linkRows = (linkRes.data as ServerLinkRow[]) ?? [];
        }

        const firstErr =
          brainRes.error?.message ||
          serverRes.error?.message ||
          backendRes.error?.message ||
          vaultRes.error?.message ||
          null;

        setBrains(brainRows);
        setServers((serverRes.data as ServerRow[]) ?? []);
        setServerLinks(linkRows);
        setBackends((backendRes.data as BackendRow[]) ?? []);
        setVaults((vaultRes.data as VaultRow[]) ?? []);
        if (firstErr) setLoadError(firstErr);
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

  const graph = useMemo(
    () => buildGraph(brains, servers, serverLinks, backends, vaults, mode, show),
    [brains, servers, serverLinks, backends, vaults, mode, show],
  );

  const summary = useMemo(() => {
    const includedVaultIds = new Set<string>();
    for (const b of brains) for (const vid of vaultIdsOf(b)) includedVaultIds.add(vid);
    const scopeBrain = backends.filter((b) => b.scope === "brain").length;
    const scopeVault = backends.filter((b) => b.scope === "vault").length;
    const vaultName = new Map(vaults.map((v) => [v.id, v.name?.trim() || "Baúl"]));
    const serverName = new Map(servers.map((s) => [s.id, s.name?.trim() || "Servidor"]));

    const brainLines = brains.map((b) => {
      const myLinks = serverLinks.filter((l) => l.brain_id === b.id);
      const srvTxt = myLinks.length
        ? myLinks
            .map(
              (l) =>
                `${serverName.get(l.server_id) ?? "Servidor"}${l.role ? ` (${l.role})` : ""}${
                  l.priority != null ? ` p${l.priority}` : ""
                }`,
            )
            .join(", ")
        : "sin servidores";
      const vs = vaultIdsOf(b)
        .map((id) => vaultName.get(id))
        .filter(Boolean);
      const dsBrain = backends.filter((d) => d.scope === "brain" && d.scope_ref === b.id).length;
      return (
        `- "${b.name?.trim() || "Cerebro"}": servidores → ${srvTxt}` +
        (vs.length ? `; baúles → ${vs.join(", ")}` : "") +
        (dsBrain ? `; almacenes propios: ${dsBrain}` : "")
      );
    });

    return [
      `Cerebros: ${brains.length}. Servidores: ${servers.length}. Enlaces cerebro↔servidor: ${serverLinks.length}.`,
      `Almacenes de datos: ${backends.length} (scope cerebro: ${scopeBrain}, scope baúl: ${scopeVault}). Baúles: ${vaults.length} (incluidos en cerebros: ${includedVaultIds.size}).`,
      brainLines.length ? `Detalle por cerebro:\n${brainLines.join("\n")}` : "Aún no hay cerebros.",
    ].join("\n");
  }, [brains, servers, serverLinks, backends, vaults]);

  const onNodeClick = useCallback((node: GNode) => {
    setFocusedNode((prev) => (prev === node.id ? null : node.id));
  }, []);

  const focusByName = useCallback(
    (name: string) => {
      const target = graph.nodes.find((n) => n.label.toLowerCase() === name.toLowerCase());
      if (target) setFocusedNode(target.id);
    },
    [graph],
  );

  const toggle = useCallback((key: keyof ShowFlags) => {
    setShow((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const isEmpty =
    !loading &&
    brains.length === 0 &&
    servers.length === 0 &&
    backends.length === 0 &&
    vaults.length === 0;

  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-2xl bg-[#0a0e16]", className)}>
      {!isEmpty && (
        <Canvas
          camera={{ position: [0, 120, 400], fov: 55, near: 1, far: 6000 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
        >
          <color attach="background" args={["#0a0e16"]} />
          <fogExp2 attach="fog" args={["#0a0e16", 0.0015]} />
          <OrbitControls enablePan enableZoom enableRotate minDistance={40} maxDistance={1800} makeDefault />
          <SceneContent
            graph={graph}
            focusedNode={focusedNode}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
            onNodeClick={onNodeClick}
          />
        </Canvas>
      )}

      {!isEmpty && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 p-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-black/50 p-1 backdrop-blur">
            <ViewBtn active={mode === "radial"} onClick={() => setMode("radial")} icon={<Network className="h-3.5 w-3.5" />} label="Radial" />
            <ViewBtn active={mode === "tipo"} onClick={() => setMode("tipo")} icon={<Layers className="h-3.5 w-3.5" />} label="Por tipo" />
            <ViewBtn active={mode === "ramificado"} onClick={() => setMode("ramificado")} icon={<GitBranch className="h-3.5 w-3.5" />} label="Ramificado" />
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-black/50 p-1 backdrop-blur">
            <TypeToggle on={show.brain} onClick={() => toggle("brain")} color={BRAIN_COLOR} icon={<Brain className="h-3.5 w-3.5" />} label="Cerebros" />
            <TypeToggle on={show.server} onClick={() => toggle("server")} color={SERVER_COLOR} icon={<Server className="h-3.5 w-3.5" />} label="Servidores" />
            <TypeToggle on={show.datastore} onClick={() => toggle("datastore")} color={DATASTORE_COLOR} icon={<Database className="h-3.5 w-3.5" />} label="Almacenes" />
            <TypeToggle on={show.vault} onClick={() => toggle("vault")} color={VAULT_COLOR} icon={<Boxes className="h-3.5 w-3.5" />} label="Baúles" />
          </div>

          {focusedNode && (
            <button
              onClick={() => setFocusedNode(null)}
              className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white/70 backdrop-blur transition hover:bg-black/70"
              title="Quitar enfoque"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Ver todo
            </button>
          )}
        </div>
      )}

      {/* Toggles de aristas */}
      {!isEmpty && (
        <div className="pointer-events-none absolute left-3 top-16 flex flex-col gap-1">
          <div className="pointer-events-auto flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/45 p-1.5 backdrop-blur">
            <EdgeToggle on={show.eBrainServer} onClick={() => toggle("eBrainServer")} color={SERVER_COLOR} label="Cere↔Serv" />
            <EdgeToggle on={show.eBrainDatastore} onClick={() => toggle("eBrainDatastore")} color={DATASTORE_COLOR} label="Cere↔Alm" />
            <EdgeToggle on={show.eVaultDatastore} onClick={() => toggle("eVaultDatastore")} color="#22d3ee" label="Baúl↔Alm" />
            <EdgeToggle on={show.eBrainVault} onClick={() => toggle("eBrainVault")} color={VAULT_COLOR} label="Cere↔Baúl" />
          </div>
        </div>
      )}

      {!isEmpty && (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-sm rounded-xl border border-white/10 bg-black/45 p-2.5 text-[11px] text-white/70 backdrop-blur">
          <div className="mb-1.5 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: BRAIN_COLOR }} /> Cerebro
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: SERVER_COLOR }} /> Servidor
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: DATASTORE_COLOR }} /> Almacén
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: VAULT_COLOR }} /> Baúl
            </span>
          </div>
          <div className="text-white/45">
            {graph.nodes.length} nodos · {graph.edges.length} aristas
            {graph.nodes.length >= MAX_NODES && " · (limitado a 200)"}
          </div>
        </div>
      )}

      {!isEmpty && (
        <div className="absolute bottom-3 right-3 top-16 z-20 hidden w-80 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/70 backdrop-blur-md md:flex">
          <AstrauraPanel summary={summary} onFocusByName={focusByName} />
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando tu red de cerebros…
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <Network className="mx-auto h-10 w-10 text-amber-300/80" />
          </div>
          <div className="max-w-sm">
            <h3 className="text-lg font-semibold text-white/90">Tu red aún está vacía</h3>
            <p className="mt-1 text-sm text-white/55">
              Crea cerebros, servidores, almacenes de datos y baúles para verlos aquí como un grafo 3D
              interconectado. Astraura puede ayudarte a organizar y explicar la red.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button asChild size="sm" variant="outline">
                <a href="/cerebros">
                  <Brain className="h-4 w-4" /> Cerebros
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href="/baules">
                  <Boxes className="h-4 w-4" /> Baúles
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}

      {loadError && !loading && !isEmpty && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg border border-red-400/30 bg-red-950/70 px-3 py-1.5 text-[11px] text-red-200 backdrop-blur">
          No se pudieron cargar todos los datos: {loadError}
        </div>
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

function EdgeToggle({
  on,
  onClick,
  color,
  label,
}: {
  on: boolean;
  onClick: () => void;
  color: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] transition",
        on ? "text-white/80" : "text-white/30",
      )}
      title={`Mostrar/ocultar aristas ${label}`}
    >
      {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
      <span className="h-1.5 w-4 rounded-full" style={{ background: on ? color : "#475569" }} />
      {label}
    </button>
  );
}
