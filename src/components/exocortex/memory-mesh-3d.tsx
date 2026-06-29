"use client";

/**
 * StarSeed OS — MemoryMesh3D
 *
 * Grafo 3D interactivo de la "malla" de memorias del usuario.
 *
 *   • Baúles (vaults) como nodos grandes = centros de clúster.
 *   • Memorias (memories) como nodos pequeños ramificando desde su baúl
 *     (vault_id → baúl; sin baúl → clúster "Sin baúl").
 *   • Conexiones del baúl (syncthing/vps/drive/vpn) como nodos satélite.
 *   • Aristas baúl↔memoria y baúl↔conexión.
 *   • 3 vistas de layout: Radial · Por tipo · Ramificado.
 *   • Hover → etiqueta, clic → enfoque/resalte de ramas.
 *   • Panel lateral "Astraura": pide a la IA organizar / entender / sugerir.
 *
 * Implementado con @react-three/fiber + @react-three/drei (declarativo).
 * SSR-safe: lleva "use client" y debe cargarse con next/dynamic { ssr:false }.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import {
  Boxes,
  Brain,
  Send,
  Loader2,
  Sparkles,
  Eye,
  EyeOff,
  Filter,
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
import { parseWikilinks } from "@/lib/okf";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type ConnKey = "syncthing" | "vps" | "drive" | "vpn";

interface VaultRow {
  id: string;
  owner: string;
  name: string | null;
  scope?: string | null;
  connections?: Partial<Record<ConnKey, boolean>> | null;
  preferences?: Record<string, unknown> | null;
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

type LayoutMode = "radial" | "tipo" | "ramificado";

type NodeKind = "vault" | "memory" | "connection";

interface GNode {
  id: string;
  label: string;
  kind: NodeKind;
  memKind?: string;
  vaultId: string | null;
  color: string;
  size: number;
  position: [number, number, number];
}

interface GEdge {
  id: string;
  source: string;
  target: string;
  color: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Paleta por tipo de memoria (kinds) + baúl + conexiones
// ────────────────────────────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  soul: "#f472b6",
  memory: "#60a5fa",
  dream: "#c084fc",
  skills: "#34d399",
  "3d": "#22d3ee",
  apis: "#fbbf24",
  mcp: "#fb923c",
  tokens: "#a3e635",
  plugins: "#f87171",
  connections: "#818cf8",
};
const DEFAULT_MEM_COLOR = "#94a3b8";
const VAULT_COLOR = "#fcd34d";
const NO_VAULT_COLOR = "#64748b";
const EDGE_VAULT_MEM = "#fbbf2455";
const EDGE_VAULT_CONN = "#818cf855";
// Aristas memoria↔memoria por wikilinks [[Nombre]] (cian suave).
const EDGE_WIKILINK = "#67e8f9aa";
const HIGHLIGHT_EDGE = "#fde68a";

const CONN_META: Record<ConnKey, { label: string; color: string }> = {
  syncthing: { label: "Syncthing", color: "#22d3ee" },
  vps: { label: "VPS", color: "#a78bfa" },
  drive: { label: "Drive", color: "#34d399" },
  vpn: { label: "VPN", color: "#f59e0b" },
};

const ALL_KINDS = Object.keys(KIND_COLORS);
const MAX_NODES = 200;

function kindColor(kind?: string): string {
  if (!kind) return DEFAULT_MEM_COLOR;
  return KIND_COLORS[kind] ?? DEFAULT_MEM_COLOR;
}

// ────────────────────────────────────────────────────────────────────────────
// Layout
// ────────────────────────────────────────────────────────────────────────────

const NO_VAULT_ID = "__novault__";

interface Cluster {
  vault: VaultRow | null;
  id: string;
  name: string;
  memories: MemoryRow[];
  connections: ConnKey[];
}

function buildClusters(vaults: VaultRow[], memories: MemoryRow[]): Cluster[] {
  const byVault = new Map<string, MemoryRow[]>();
  const noVault: MemoryRow[] = [];
  for (const m of memories) {
    if (m.vault_id) {
      const arr = byVault.get(m.vault_id) ?? [];
      arr.push(m);
      byVault.set(m.vault_id, arr);
    } else {
      noVault.push(m);
    }
  }

  const clusters: Cluster[] = vaults.map((v) => {
    const conns = (Object.keys(v.connections ?? {}) as ConnKey[]).filter(
      (k) => (CONN_META as Record<string, unknown>)[k] && v.connections?.[k],
    );
    return {
      vault: v,
      id: v.id,
      name: v.name?.trim() || "Baúl",
      memories: byVault.get(v.id) ?? [],
      connections: conns,
    };
  });

  if (noVault.length) {
    clusters.push({
      vault: null,
      id: NO_VAULT_ID,
      name: "Sin baúl",
      memories: noVault,
      connections: [],
    });
  }
  return clusters;
}

function ring(cx: number, cz: number, radius: number, i: number, n: number, yJitter = 0): [number, number, number] {
  const a = n <= 1 ? 0 : (i / n) * Math.PI * 2;
  return [cx + Math.cos(a) * radius, yJitter, cz + Math.sin(a) * radius];
}

interface BuiltGraph {
  nodes: GNode[];
  edges: GEdge[];
  branchMap: Map<string, Set<string>>;
}

function buildGraph(
  clusters: Cluster[],
  mode: LayoutMode,
  activeKinds: Set<string>,
  showConnections: boolean,
  showWikiLinks: boolean,
): BuiltGraph {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const branchMap = new Map<string, Set<string>>();

  const C = clusters.length;
  const clusterRadius = Math.max(140, C * 34);

  let nodeBudget = MAX_NODES;

  clusters.forEach((cl, ci) => {
    if (nodeBudget <= 0) return;
    const [vx, , vz] = ring(0, 0, C <= 1 ? 0 : clusterRadius, ci, C, 0);

    const vaultNodeId = `v:${cl.id}`;
    const vaultColor = cl.vault ? VAULT_COLOR : NO_VAULT_COLOR;
    nodes.push({
      id: vaultNodeId,
      label: cl.name,
      kind: "vault",
      vaultId: cl.id,
      color: vaultColor,
      size: cl.vault ? 9 : 7,
      position: [vx, 0, vz],
    });
    nodeBudget--;
    const branch = new Set<string>();
    branchMap.set(cl.id, branch);

    const mems = cl.memories.filter((m) => {
      const ks = (m.kinds ?? []).filter(Boolean);
      if (activeKinds.size === 0) return true;
      if (ks.length === 0) return activeKinds.has("__none__");
      return ks.some((k) => activeKinds.has(k));
    });

    if (mode === "tipo") {
      const byKind = new Map<string, MemoryRow[]>();
      for (const m of mems) {
        const k = (m.kinds ?? []).find(Boolean) ?? "otros";
        const arr = byKind.get(k) ?? [];
        arr.push(m);
        byKind.set(k, arr);
      }
      const kinds = [...byKind.keys()];
      kinds.forEach((k, ki) => {
        const groupAngle = kinds.length <= 1 ? 0 : (ki / kinds.length) * Math.PI * 2;
        const gx = vx + Math.cos(groupAngle) * 46;
        const gz = vz + Math.sin(groupAngle) * 46;
        const list = byKind.get(k)!;
        list.forEach((m, mi) => {
          if (nodeBudget <= 0) return;
          const id = `m:${m.id}`;
          const pos = ring(gx, gz, 16 + Math.min(list.length, 8) * 2, mi, list.length, (mi % 3) * 6 - 6);
          nodes.push({
            id,
            label: m.name?.trim() || "Memoria",
            kind: "memory",
            memKind: k === "otros" ? undefined : k,
            vaultId: cl.id,
            color: kindColor(k === "otros" ? undefined : k),
            size: 3.4,
            position: pos,
          });
          edges.push({ id: `e:${vaultNodeId}-${id}`, source: vaultNodeId, target: id, color: EDGE_VAULT_MEM });
          branch.add(id);
          nodeBudget--;
        });
      });
    } else if (mode === "ramificado") {
      mems.forEach((m, mi) => {
        if (nodeBudget <= 0) return;
        const id = `m:${m.id}`;
        const spread = mems.length <= 1 ? 0 : (mi / (mems.length - 1) - 0.5);
        const pos: [number, number, number] = [
          vx + spread * Math.max(60, mems.length * 10),
          34 + (mi % 2) * 14,
          vz + spread * 18,
        ];
        const k = (m.kinds ?? []).find(Boolean);
        nodes.push({
          id,
          label: m.name?.trim() || "Memoria",
          kind: "memory",
          memKind: k,
          vaultId: cl.id,
          color: kindColor(k),
          size: 3.4,
          position: pos,
        });
        edges.push({ id: `e:${vaultNodeId}-${id}`, source: vaultNodeId, target: id, color: EDGE_VAULT_MEM });
        branch.add(id);
        nodeBudget--;
      });
    } else {
      const n = mems.length;
      mems.forEach((m, mi) => {
        if (nodeBudget <= 0) return;
        const id = `m:${m.id}`;
        const t = n <= 1 ? 0 : mi / (n - 1);
        const inclination = Math.acos(1 - 2 * (t * 0.86 + 0.07));
        const azimuth = Math.PI * (1 + Math.sqrt(5)) * mi;
        const r = 30 + Math.min(n, 12) * 1.4;
        const pos: [number, number, number] = [
          vx + r * Math.sin(inclination) * Math.cos(azimuth),
          r * Math.cos(inclination),
          vz + r * Math.sin(inclination) * Math.sin(azimuth),
        ];
        const k = (m.kinds ?? []).find(Boolean);
        nodes.push({
          id,
          label: m.name?.trim() || "Memoria",
          kind: "memory",
          memKind: k,
          vaultId: cl.id,
          color: kindColor(k),
          size: 3.4,
          position: pos,
        });
        edges.push({ id: `e:${vaultNodeId}-${id}`, source: vaultNodeId, target: id, color: EDGE_VAULT_MEM });
        branch.add(id);
        nodeBudget--;
      });
    }

    if (showConnections && cl.connections.length) {
      cl.connections.forEach((ck, ki) => {
        if (nodeBudget <= 0) return;
        const id = `c:${cl.id}:${ck}`;
        const meta = CONN_META[ck];
        const pos = ring(vx, vz, 24, ki, cl.connections.length, -30 - ki * 4);
        nodes.push({
          id,
          label: meta.label,
          kind: "connection",
          vaultId: cl.id,
          color: meta.color,
          size: 4,
          position: [pos[0], -28 - ki * 6, pos[2]],
        });
        edges.push({ id: `e:${vaultNodeId}-${id}`, source: vaultNodeId, target: id, color: EDGE_VAULT_CONN });
        branch.add(id);
        nodeBudget--;
      });
    }
  });

  // ── Aristas memoria↔memoria por wikilinks [[Nombre]] ──
  // Para cada memoria presente como nodo, por cada [[Nombre]] de su contenido,
  // se dibuja una arista hacia la memoria cuyo name coincide (case-insensitive).
  if (showWikiLinks) {
    const memNodeIds = new Set(nodes.filter((n) => n.kind === "memory").map((n) => n.id));
    const idByName = new Map<string, string>();
    for (const cl of clusters) {
      for (const mem of cl.memories) {
        const nm = (mem.name ?? "").trim().toLowerCase();
        const nodeId = `m:${mem.id}`;
        if (nm && memNodeIds.has(nodeId) && !idByName.has(nm)) idByName.set(nm, nodeId);
      }
    }
    const seenWiki = new Set<string>();
    for (const cl of clusters) {
      for (const mem of cl.memories) {
        const srcId = `m:${mem.id}`;
        if (!memNodeIds.has(srcId)) continue;
        const links = parseWikilinks(mem.content ?? "");
        for (const lnk of links) {
          const dstId = idByName.get(lnk.trim().toLowerCase());
          if (!dstId || dstId === srcId) continue;
          const key = `${srcId}=>${dstId}`;
          if (seenWiki.has(key)) continue;
          seenWiki.add(key);
          edges.push({ id: `w:${srcId}-${dstId}`, source: srcId, target: dstId, color: EDGE_WIKILINK });
        }
      }
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
        <Html
          center
          distanceFactor={node.kind === "vault" ? 360 : 240}
          style={{ pointerEvents: "none" }}
        >
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
            {node.kind === "vault" ? "🗄 " : node.kind === "connection" ? "🔗 " : ""}
            {node.label}
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

function SceneContent({
  graph,
  focusedVault,
  hoveredId,
  setHoveredId,
  onNodeClick,
}: {
  graph: BuiltGraph;
  focusedVault: string | null;
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
    if (!focusedVault) return null;
    const set = new Set<string>([`v:${focusedVault}`]);
    const b = graph.branchMap.get(focusedVault);
    if (b) b.forEach((id) => set.add(id));
    return set;
  }, [focusedVault, graph]);

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
          <EdgeLine key={e.id} from={a} to={b} color={e.color} dimmed={dimmed} highlighted={highlighted} />
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
// Astraura panel (chat → IA). Mismo patrón que MemoryBrain3D.
// ────────────────────────────────────────────────────────────────────────────

interface ChatTurn {
  role: "user" | "ai";
  content: string;
  pending?: boolean;
}

const QUICK_PROMPTS = [
  "Agrupa mis memorias en baúles temáticos",
  "¿Qué conexiones me convienen?",
  "Resume mi mapa de memorias",
  "Sugiere cómo organizar lo que no tiene baúl",
];

function AstrauraPanel({
  summary,
  onFocusVaultByName,
}: {
  summary: string;
  onFocusVaultByName: (name: string) => void;
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
              "Configura tu IA en Astraura AI (Ajustes → IA & Modelos) y vuelve. Mientras tanto puedo mostrarte tus baúles y memorias en el mapa.",
          },
        ]);
        return;
      }

      const systemPrompt =
        "Eres Astraura, la IA compañera del Exocórtex de StarSeed OS. Ayudas a la persona a " +
        "ENTENDER, ORGANIZAR y CONFIGURAR su malla de memorias y baúles. Puedes sugerir agrupaciones " +
        "temáticas, qué conexiones (Syncthing/VPS/Drive/VPN) le convienen y cómo estructurar lo que no " +
        "tiene baúl. Responde en español, concreto y accionable, con listas cortas cuando ayude. " +
        "Si recomiendas enfocar un baúl, nómbralo entre comillas.\n\nEstado actual de la malla:\n" +
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
            Pídeme que <strong className="text-white/80">organice</strong>,{" "}
            <strong className="text-white/80">entienda</strong> o{" "}
            <strong className="text-white/80">sugiera</strong> sobre tus memorias.
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
                onClick={() => onFocusVaultByName(nm)}
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

export function MemoryMesh3D({ className = "" }: { className?: string }) {
  const [vaults, setVaults] = useState<VaultRow[]>([]);
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<LayoutMode>("radial");
  const [showConnections, setShowConnections] = useState(true);
  const [showWikiLinks, setShowWikiLinks] = useState(true);
  const [activeKinds, setActiveKinds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedVault, setFocusedVault] = useState<string | null>(null);

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
            setVaults([]);
            setMemories([]);
          }
          return;
        }
        const [{ data: v, error: ve }, { data: m, error: me }] = await Promise.all([
          sb.from("vaults").select("id,owner,name,scope,connections,preferences").eq("owner", uid),
          sb
            .from("memories")
            .select("id,owner,name,kinds,format,scope,vault_id,content")
            .eq("owner", uid)
            .limit(500),
        ]);
        if (!alive) return;
        if (ve || me) setLoadError((ve?.message || me?.message) ?? null);
        setVaults((v as VaultRow[]) ?? []);
        setMemories((m as MemoryRow[]) ?? []);
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

  const clusters = useMemo(() => buildClusters(vaults, memories), [vaults, memories]);

  const presentKinds = useMemo(() => {
    const s = new Set<string>();
    for (const m of memories) for (const k of m.kinds ?? []) if (k) s.add(k);
    const ordered = ALL_KINDS.filter((k) => s.has(k));
    const extras = [...s].filter((k) => !ALL_KINDS.includes(k)).sort();
    return [...ordered, ...extras];
  }, [memories]);

  const graph = useMemo(
    () => buildGraph(clusters, mode, activeKinds, showConnections, showWikiLinks),
    [clusters, mode, activeKinds, showConnections, showWikiLinks],
  );

  const summary = useMemo(() => {
    const kindCount: Record<string, number> = {};
    for (const m of memories) for (const k of m.kinds ?? []) if (k) kindCount[k] = (kindCount[k] || 0) + 1;
    const noVault = memories.filter((m) => !m.vault_id).length;
    const vaultLines = clusters
      .filter((c) => c.vault)
      .map(
        (c) =>
          `- "${c.name}": ${c.memories.length} memorias` +
          (c.connections.length ? `, conexiones: ${c.connections.map((k) => CONN_META[k].label).join(", ")}` : ", sin conexiones"),
      );
    return [
      `Baúles: ${vaults.length}. Memorias: ${memories.length} (sin baúl: ${noVault}).`,
      `Tipos (kinds): ${Object.entries(kindCount)
        .map(([k, c]) => `${c} ${k}`)
        .join(", ") || "—"}.`,
      vaultLines.length ? `Detalle de baúles:\n${vaultLines.join("\n")}` : "Aún no hay baúles con nombre.",
    ].join("\n");
  }, [vaults, memories, clusters]);

  const toggleKind = useCallback((k: string) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const onNodeClick = useCallback((node: GNode) => {
    setFocusedVault((prev) => (prev === node.vaultId ? null : node.vaultId));
  }, []);

  const focusVaultByName = useCallback(
    (name: string) => {
      const target = clusters.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (target) setFocusedVault(target.id);
    },
    [clusters],
  );

  const isEmpty = !loading && vaults.length === 0 && memories.length === 0;

  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-2xl bg-[#0a0e16]", className)}>
      {!isEmpty && (
        <Canvas
          camera={{ position: [0, 120, 360], fov: 55, near: 1, far: 6000 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
        >
          <color attach="background" args={["#0a0e16"]} />
          <fogExp2 attach="fog" args={["#0a0e16", 0.0016]} />
          <OrbitControls
            enablePan
            enableZoom
            enableRotate
            minDistance={40}
            maxDistance={1600}
            makeDefault
          />
          <SceneContent
            graph={graph}
            focusedVault={focusedVault}
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

          <button
            onClick={() => setShowConnections((s) => !s)}
            className={cn(
              "pointer-events-auto flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs backdrop-blur transition",
              showConnections
                ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200"
                : "border-white/10 bg-black/50 text-white/60",
            )}
            title="Mostrar/ocultar conexiones"
          >
            {showConnections ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Conexiones
          </button>

          <button
            onClick={() => setShowWikiLinks((s) => !s)}
            className={cn(
              "pointer-events-auto flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs backdrop-blur transition",
              showWikiLinks
                ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
                : "border-white/10 bg-black/50 text-white/60",
            )}
            title="Mostrar/ocultar enlaces [[wiki]] entre memorias"
          >
            {showWikiLinks ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Mostrar enlaces wiki
          </button>

          {presentKinds.length > 0 && (
            <div className="pointer-events-auto relative">
              <button
                onClick={() => setShowFilters((s) => !s)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs backdrop-blur transition",
                  activeKinds.size > 0
                    ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                    : "border-white/10 bg-black/50 text-white/60",
                )}
                title="Filtrar por tipo"
              >
                <Filter className="h-3.5 w-3.5" />
                Tipo
                {activeKinds.size > 0 && <span className="ml-0.5 text-[10px]">({activeKinds.size})</span>}
              </button>
              {showFilters && (
                <div className="absolute left-0 top-full z-10 mt-1 w-44 rounded-xl border border-white/10 bg-black/80 p-2 backdrop-blur">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-white/40">Tipos</span>
                    {activeKinds.size > 0 && (
                      <button onClick={() => setActiveKinds(new Set())} className="text-[10px] text-amber-300 hover:underline">
                        limpiar
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {presentKinds.map((k) => {
                      const on = activeKinds.size === 0 || activeKinds.has(k);
                      return (
                        <button
                          key={k}
                          onClick={() => toggleKind(k)}
                          className={cn(
                            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition",
                            on ? "border-white/20 text-white/85" : "border-white/10 text-white/35",
                          )}
                          style={on ? { boxShadow: `inset 0 0 0 1px ${kindColor(k)}55` } : undefined}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: kindColor(k) }} />
                          {k}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {focusedVault && (
            <button
              onClick={() => setFocusedVault(null)}
              className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white/70 backdrop-blur transition hover:bg-black/70"
              title="Quitar enfoque"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Ver todo
            </button>
          )}
        </div>
      )}

      {!isEmpty && (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-xs rounded-xl border border-white/10 bg-black/45 p-2.5 text-[11px] text-white/70 backdrop-blur">
          <div className="mb-1.5 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: VAULT_COLOR }} /> Baúl
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: DEFAULT_MEM_COLOR }} /> Memoria
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: "#818cf8" }} /> Conexión
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: EDGE_WIKILINK }} /> Enlaces [[wiki]]
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
          <AstrauraPanel summary={summary} onFocusVaultByName={focusVaultByName} />
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando tu malla de memorias…
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <Boxes className="mx-auto h-10 w-10 text-amber-300/80" />
          </div>
          <div className="max-w-sm">
            <h3 className="text-lg font-semibold text-white/90">Tu malla aún está vacía</h3>
            <p className="mt-1 text-sm text-white/55">
              Crea baúles y memorias para verlos aquí como un grafo 3D interactivo. Astraura puede
              ayudarte a organizarlos por temas y sugerir conexiones.
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Button asChild size="sm" variant="outline">
                <a href="/baules">
                  <Boxes className="h-4 w-4" /> Crear baúles
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href="/memorias">
                  <Brain className="h-4 w-4" /> Crear memorias
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

export default MemoryMesh3D;
