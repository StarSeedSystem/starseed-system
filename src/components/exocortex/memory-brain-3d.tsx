"use client";

/**
 * StarSeed OS — MemoryBrain3D
 *
 * Visor 3D de memoria del Exocórtex. Réplica fiel del
 * starseed-memory-3d.html con extensiones:
 *   • Opciones configurables (sliders / switches)
 *   • Datos del OS mezclados (páginas, grupos, partidos, E.F., artículos, cursos)
 *   • Panel de chat Exocórtex embebido (usa chat() + providerStore)
 *   • SSR-safe: todo THREE en useEffect, dynamic import
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Brain,
  X,
  Search,
  Sliders,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  RotateCw,
  Layers,
  Focus,
  Database,
} from "lucide-react";

// ── OS data imports ──────────────────────────────────────────────────────────
import { samplePages, sampleGroups } from "@/data/sample-entities";
import { listPartidos, listFederativeEntities } from "@/data/sample-governance";
import { articles, courses } from "@/lib/data";
import { getActiveVaultGraph } from "@/lib/memory-vault";
import { MemoryVaultPanel } from "@/components/exocortex/memory-vault-panel";

// ── AI imports ───────────────────────────────────────────────────────────────
import { chat } from "@/ai/client/chat";
import {
  loadConfigs,
  getActiveProviderId,
} from "@/ai/client/providerStore";
import type { ChatMessage } from "@/ai/providers/types";

// ── Memory graph JSON ─────────────────────────────────────────────────────────
import rawGraph from "@/data/starseed-memory-graph.json";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface MemNode {
  id: string;
  label: string;
  type: string;
  kind?: string;
  context: string[];
  group?: number;
  status?: string;
  summary?: string;
  links?: { label: string; url: string }[];
  // internal layout
  _p?: { x: number; y: number; z: number };
  _v?: { x: number; y: number; z: number };
  // extra: OS data deep link
  _osLink?: string;
  _osLayer?: "memoria" | "red-os";
}

interface MemEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
}

interface GraphData {
  meta: {
    nodeTypes: Record<string, string>;
    edgeTypes: Record<string, string>;
    contexts: string[];
  };
  nodes: MemNode[];
  edges: MemEdge[];
}

type LayerMode = "memoria" | "red-os" | "todo";

interface Settings {
  nodeSize: number;       // multiplier 0.5 – 3
  repulsion: number;      // kRep factor  5000 – 20000
  edgeOpacity: number;    // 0 – 1
  spinSpeed: number;      // 0 – 0.01
  showLabels: boolean;
  autoSpin: boolean;
  showStars: boolean;
  showFog: boolean;
  layoutMode: "esferico" | "organico";
}

// ────────────────────────────────────────────────────────────────────────────
// Build combined graph (memory JSON + OS data)
// ────────────────────────────────────────────────────────────────────────────

const OS_NODE_COLOR = "#60a5fa"; // blue-400
const OS_EDGE_COLOR = "#818cf8"; // indigo-400

function buildGraph(layer: LayerMode): GraphData {
  // Start with the raw JSON graph
  const base = rawGraph as unknown as GraphData;

  const nodeTypes = { ...base.meta.nodeTypes };
  const edgeTypes = { ...base.meta.edgeTypes };
  const contexts = [...base.meta.contexts];

  // Clone nodes / edges with _osLayer tag
  const nodes: MemNode[] = base.nodes.map((n) => ({
    ...n,
    context: Array.isArray(n.context) ? n.context : [],
    _osLayer: "memoria" as const,
  }));
  const edges: MemEdge[] = base.edges.map((e) => ({ ...e }));

  if (layer !== "memoria") {
    // Add OS node types
    nodeTypes["os-pagina"] = OS_NODE_COLOR;
    nodeTypes["os-grupo"] = "#34d399";
    nodeTypes["os-partido"] = "#fb923c";
    nodeTypes["os-ef"] = "#f59e0b";
    nodeTypes["os-articulo"] = "#c084fc";
    nodeTypes["os-curso"] = "#38bdf8";
    edgeTypes["os-link"] = OS_EDGE_COLOR;

    const existingIds = new Set(nodes.map((n) => n.id));

    // Pages
    samplePages.slice(0, 8).forEach((p) => {
      const id = `os-page-${p.id}`;
      if (existingIds.has(id)) return;
      existingIds.add(id);
      nodes.push({
        id,
        label: p.title.slice(0, 30),
        type: "os-pagina",
        kind: p.kind,
        context: [p.system === "politico" ? "comunidad" : p.system === "educativo" ? "investigacion" : "identidad"],
        summary: p.description,
        _osLayer: "red-os",
        _osLink: `/pagina/${p.id}`,
        links: [],
      });
      // Connect to area-os
      edges.push({ source: id, target: "area-os", type: "os-link", weight: 1 });
    });

    // Groups
    sampleGroups.slice(0, 6).forEach((g) => {
      const id = `os-group-${g.id}`;
      if (existingIds.has(id)) return;
      existingIds.add(id);
      nodes.push({
        id,
        label: g.name.slice(0, 28),
        type: "os-grupo",
        kind: "comunidad",
        context: ["comunidad"],
        summary: g.description,
        _osLayer: "red-os",
        _osLink: `/grupo/${g.id}`,
        links: [],
      });
      edges.push({ source: id, target: "area-sociedad", type: "os-link", weight: 1 });
    });

    // Partidos
    try {
      listPartidos().slice(0, 4).forEach((p) => {
        const id = `os-partido-${p.slug}`;
        if (existingIds.has(id)) return;
        existingIds.add(id);
        nodes.push({
          id,
          label: p.name.slice(0, 28),
          type: "os-partido",
          kind: "politico",
          context: ["comunidad"],
          summary: p.ideology,
          _osLayer: "red-os",
          _osLink: `/partido/${p.slug}`,
          links: [],
        });
        edges.push({ source: id, target: "area-sociedad", type: "os-link", weight: 1 });
      });
    } catch {}

    // Federative entities
    try {
      listFederativeEntities().slice(0, 4).forEach((ef) => {
        const id = `os-ef-${ef.slug}`;
        if (existingIds.has(id)) return;
        existingIds.add(id);
        nodes.push({
          id,
          label: ef.name.slice(0, 28),
          type: "os-ef",
          kind: "ef",
          context: ["comunidad"],
          summary: ef.blurb || ef.territory?.name || "",
          _osLayer: "red-os",
          _osLink: `/entidad/${ef.slug}`,
          links: [],
        });
        edges.push({ source: id, target: "area-sociedad", type: "os-link", weight: 1 });
      });
    } catch {}

    // Articles
    articles.slice(0, 5).forEach((a: any) => {
      const id = `os-article-${a.id}`;
      if (existingIds.has(id)) return;
      existingIds.add(id);
      nodes.push({
        id,
        label: a.title.slice(0, 28),
        type: "os-articulo",
        kind: "doc",
        context: ["investigacion"],
        summary: a.excerpt || "",
        _osLayer: "red-os",
        _osLink: a.href || `/article/${a.id}`,
        links: [],
      });
      edges.push({ source: id, target: "area-os", type: "os-link", weight: 1 });
    });

    // Courses
    courses.slice(0, 4).forEach((c: any) => {
      const id = `os-course-${c.id}`;
      if (existingIds.has(id)) return;
      existingIds.add(id);
      nodes.push({
        id,
        label: c.title.slice(0, 28),
        type: "os-curso",
        kind: "educacion",
        context: ["investigacion"],
        summary: c.description || "",
        _osLayer: "red-os",
        _osLink: c.href || `/course/${c.id}`,
        links: [],
      });
      edges.push({ source: id, target: "area-os", type: "os-link", weight: 1 });
    });
  }

  // Memorias .md seleccionadas por el usuario (vault) — capa "memoria".
  try {
    const vault = getActiveVaultGraph();
    vault.nodes.forEach((vn: any) => {
      if (!nodes.some((n) => n.id === vn.id)) nodes.push({ ...vn, _osLayer: "memoria" });
    });
    vault.edges.forEach((ve: any) => {
      edges.push({ source: ve.source, target: ve.target, type: ve.type || "memoria-link", weight: ve.weight ?? 1 });
    });
  } catch {
    /* SSR / sin localStorage: ignorar */
  }

  // Filter by layer
  const filteredNodes =
    layer === "todo"
      ? nodes
      : nodes.filter((n) => n._osLayer === layer);

  const visibleIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target)
  );

  return {
    meta: { nodeTypes, edgeTypes, contexts },
    nodes: filteredNodes,
    edges: filteredEdges,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Layout helpers (force-directed 3D, pre-computed)
// ────────────────────────────────────────────────────────────────────────────

function runLayout(
  nodes: MemNode[],
  edges: MemEdge[],
  kRep = 9000,
  layoutMode: "esferico" | "organico" = "organico"
) {
  const N = nodes.length;
  if (N === 0) return;

  nodes.forEach((n, i) => {
    const a = i * 2.399963;
    const r = 120 + (n.group || 0) * 18;
    if (layoutMode === "esferico") {
      const phi2 = Math.acos(2 * (i / N) - 1);
      const theta = 2 * Math.PI * i * 0.618;
      n._p = {
        x: r * 1.2 * Math.sin(phi2) * Math.cos(theta),
        y: r * 1.2 * Math.cos(phi2),
        z: r * 1.2 * Math.sin(phi2) * Math.sin(theta),
      };
    } else {
      n._p = {
        x: Math.cos(a) * r * (0.6 + Math.random() * 0.6),
        y: (Math.random() - 0.5) * r * 1.4,
        z: Math.sin(a) * r * (0.6 + Math.random() * 0.6),
      };
    }
    n._v = { x: 0, y: 0, z: 0 };
  });

  const idToIdx: Record<string, number> = {};
  nodes.forEach((n, i) => { idToIdx[n.id] = i; });
  const adj = edges
    .map((e) => [idToIdx[e.source] ?? -1, idToIdx[e.target] ?? -1, e.weight ?? 1] as [number, number, number])
    .filter(([a, b]) => a >= 0 && b >= 0);

  const kAttr = 0.014, rest = 70, damp = 0.86, center = 0.006;
  const iters = layoutMode === "esferico" ? 150 : 320;

  for (let it = 0; it < iters; it++) {
    // repulsion O(n²)
    for (let i = 0; i < N; i++) {
      const pa = nodes[i]._p!;
      const va = nodes[i]._v!;
      for (let j = i + 1; j < N; j++) {
        const pb = nodes[j]._p!;
        let dx = pa.x - pb.x, dy = pa.y - pb.y, dz = pa.z - pb.z;
        const d2 = dx * dx + dy * dy + dz * dz + 0.01;
        const d = Math.sqrt(d2);
        const f = kRep / d2;
        dx /= d; dy /= d; dz /= d;
        va.x += dx * f; va.y += dy * f; va.z += dz * f;
        const vb = nodes[j]._v!;
        vb.x -= dx * f; vb.y -= dy * f; vb.z -= dz * f;
      }
    }
    // attraction
    adj.forEach(([i, j, w]) => {
      const pa = nodes[i]._p!, pb = nodes[j]._p!;
      let dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      const f = kAttr * (d - rest) * (0.6 + w * 0.3);
      dx /= d; dy /= d; dz /= d;
      nodes[i]._v!.x += dx * f; nodes[i]._v!.y += dy * f; nodes[i]._v!.z += dz * f;
      nodes[j]._v!.x -= dx * f; nodes[j]._v!.y -= dy * f; nodes[j]._v!.z -= dz * f;
    });
    // integrate
    nodes.forEach((n) => {
      const p = n._p!, v = n._v!;
      v.x -= p.x * center; v.y -= p.y * center; v.z -= p.z * center;
      v.x *= damp; v.y *= damp; v.z *= damp;
      p.x += v.x; p.y += v.y; p.z += v.z;
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// hexA helper (hex + alpha → rgba)
// ────────────────────────────────────────────────────────────────────────────
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function MemoryBrain3D({
  className = "",
  compact = false,
  showChat = true,
}: {
  className?: string;
  compact?: boolean;
  showChat?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Graph / filter state
  const [layer, setLayer] = useState<LayerMode>("todo");
  const [searchQ, setSearchQ] = useState("");
  const [selectedNode, setSelectedNode] = useState<MemNode | null>(null);

  // Filter toggles
  const [activeNodeTypes, setActiveNodeTypes] = useState<Set<string>>(new Set());
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<string>>(new Set());
  const [activeContexts, setActiveContexts] = useState<Set<string>>(new Set());

  // Settings
  const [settings, setSettings] = useState<Settings>({
    nodeSize: 1,
    repulsion: 9000,
    edgeOpacity: 0.34,
    spinSpeed: 0.0016,
    showLabels: true,
    autoSpin: false,
    showStars: true,
    showFog: true,
    layoutMode: "organico",
  });

  // UI panels
  const [showFilters, setShowFilters] = useState(!compact);
  const [showSettings, setShowSettings] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Vault de memorias .md (selección de memorias desplegadas en el cerebro)
  const [showVault, setShowVault] = useState(false);
  const [vaultTick, setVaultTick] = useState(0);

  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "ai"; content: string; pending?: boolean }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Stats
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });

  // Refs for THREE objects — keeping them stable across re-renders
  const graphRef = useRef<GraphData | null>(null);
  const threeRef = useRef<{
    renderer: any;
    scene: any;
    camera: any;
    raycaster: any;
    nodeMeshes: any[];
    edgeLines: any[];
    labelSprites: any[];
    nodeById: Record<string, any>;
    stars: any;
    fogObj: any;
    THREE: any;
    animId: number;
    theta: number;
    phi: number;
    radius: number;
    target: any;
    dragging: boolean;
    moved: boolean;
    px: number;
    py: number;
    selectedMesh: any;
    hoveredMesh: any;
    degree: Record<string, number>;
  } | null>(null);

  // Current settings ref (to read latest inside animation loop without closures)
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const showLabelsRef = useRef(settings.showLabels);
  useEffect(() => { showLabelsRef.current = settings.showLabels; }, [settings.showLabels]);

  const activeNodeTypesRef = useRef(activeNodeTypes);
  useEffect(() => { activeNodeTypesRef.current = activeNodeTypes; }, [activeNodeTypes]);

  const activeEdgeTypesRef = useRef(activeEdgeTypes);
  useEffect(() => { activeEdgeTypesRef.current = activeEdgeTypes; }, [activeEdgeTypes]);

  const activeContextsRef = useRef(activeContexts);
  useEffect(() => { activeContextsRef.current = activeContexts; }, [activeContexts]);

  const selectedNodeRef = useRef<MemNode | null>(null);
  useEffect(() => { selectedNodeRef.current = selectedNode; }, [selectedNode]);

  // Mount gate
  useEffect(() => { setMounted(true); }, []);

  // ── Build & init Three.js ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let alive = true;

    async function init() {
      const THREE = await import("three");
      if (!alive) return;

      // Build graph data
      const g = buildGraph(layer);
      runLayout(g.nodes, g.edges, settings.repulsion, settings.layoutMode);
      graphRef.current = g;

      // Degree map
      const deg: Record<string, number> = {};
      g.nodes.forEach((n) => { deg[n.id] = 0; });
      g.edges.forEach((e) => {
        if (deg[e.source] != null) deg[e.source]++;
        if (deg[e.target] != null) deg[e.target]++;
      });

      // Defaults for filter sets
      setActiveNodeTypes(new Set(Object.keys(g.meta.nodeTypes)));
      setActiveEdgeTypes(new Set(Object.keys(g.meta.edgeTypes)));
      activeNodeTypesRef.current = new Set(Object.keys(g.meta.nodeTypes));
      activeEdgeTypesRef.current = new Set(Object.keys(g.meta.edgeTypes));

      setStats({ nodes: g.nodes.length, edges: g.edges.length });

      const w = container.clientWidth;
      const h = container.clientHeight;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      // Scene + fog
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0d130e);
      const fogObj = new THREE.FogExp2(0x0d130e, 0.0016);
      if (settings.showFog) scene.fog = fogObj;

      // Camera
      const camera = new THREE.PerspectiveCamera(55, w / h, 1, 6000);
      const theta = 0.7, phi = 1.1, radius = 420;
      camera.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(0, 0, 0);

      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const key = new THREE.PointLight(0xffe6b0, 1.1, 0);
      key.position.set(300, 400, 300);
      scene.add(key);
      const rim = new THREE.PointLight(0x6fd1c9, 0.5, 0);
      rim.position.set(-400, -200, -300);
      scene.add(rim);

      // Starfield
      const starsGeo = new THREE.BufferGeometry();
      const N = 900;
      const starPos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const r2 = 1800 + Math.random() * 1800;
        const t2 = Math.random() * 6.28;
        const p2 = Math.acos(2 * Math.random() - 1);
        starPos[i * 3] = r2 * Math.sin(p2) * Math.cos(t2);
        starPos[i * 3 + 1] = r2 * Math.cos(p2);
        starPos[i * 3 + 2] = r2 * Math.sin(p2) * Math.sin(t2);
      }
      starsGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
      const stars = new THREE.Points(
        starsGeo,
        new THREE.PointsMaterial({ color: 0xe9c46a, size: 2, transparent: true, opacity: 0.5 })
      );
      if (settings.showStars) scene.add(stars);

      // Raycaster
      const raycaster = new THREE.Raycaster();

      // Build meshes
      const nodeMeshes: any[] = [];
      const nodeById: Record<string, any> = {};
      const edgeLines: any[] = [];
      const labelSprites: any[] = [];

      const sphereGeo = new THREE.SphereGeometry(1, 20, 20);

      g.nodes.forEach((n) => {
        const col = new THREE.Color(g.meta.nodeTypes[n.type] || "#cccccc");
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          emissive: col.clone().multiplyScalar(0.35),
          roughness: 0.4,
          metalness: 0.3,
        });
        const mesh = new THREE.Mesh(sphereGeo, mat);
        const s = settings.nodeSize * (5.5 + Math.min(deg[n.id] || 0, 10) * 1.7 + (n.type === "root" ? 7 : 0));
        mesh.scale.setScalar(s);
        mesh.position.set(n._p!.x, n._p!.y, n._p!.z);
        mesh.userData = { node: n, baseColor: col.clone(), baseScale: s };
        scene.add(mesh);
        nodeMeshes.push(mesh);
        nodeById[n.id] = mesh;
      });

      // Edges
      g.edges.forEach((e) => {
        const a = nodeById[e.source];
        const b = nodeById[e.target];
        if (!a || !b) return;
        const col = new THREE.Color(g.meta.edgeTypes[e.type] || "#888888");
        const geo = new THREE.BufferGeometry().setFromPoints([
          a.position.clone(),
          b.position.clone(),
        ]);
        const mat = new THREE.LineBasicMaterial({
          color: col,
          transparent: true,
          opacity: settings.edgeOpacity,
        });
        const ln = new THREE.Line(geo, mat);
        ln.userData = { edge: e, a: e.source, b: e.target, baseOpacity: settings.edgeOpacity };
        scene.add(ln);
        edgeLines.push(ln);
      });

      // Label sprites (cap to 120)
      const labelNodes = [...g.nodes].sort((x, y) => (deg[y.id] || 0) - (deg[x.id] || 0)).slice(0, 120);
      labelNodes.forEach((n) => {
        const sp = makeLabel(THREE, n.label);
        sp.position.set(n._p!.x, n._p!.y, n._p!.z);
        sp.userData = { node: n };
        scene.add(sp);
        labelSprites.push(sp);
      });

      function makeLabel(THREE: any, text: string): any {
        const pad = 8, fs = 28;
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d")!;
        ctx.font = `600 ${fs}px -apple-system,Segoe UI,Roboto,sans-serif`;
        const textW = Math.ceil(ctx.measureText(text).width) + pad * 2;
        const textH = fs + pad * 2;
        c.width = textW; c.height = textH;
        ctx.font = `600 ${fs}px -apple-system,Segoe UI,Roboto,sans-serif`;
        ctx.fillStyle = "rgba(8,12,9,0.72)";
        roundRect(ctx, 0, 0, textW, textH, 8);
        ctx.fill();
        ctx.fillStyle = "#f4e8c9";
        ctx.textBaseline = "middle";
        ctx.fillText(text, pad, textH / 2);
        const tex = new THREE.CanvasTexture(c);
        tex.minFilter = THREE.LinearFilter;
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
        );
        sp.scale.set(textW * 0.16, textH * 0.16, 1);
        return sp;
      }

      function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }

      // Apply filter visibility
      function applyFilters(sel: MemNode | null) {
        const ants = activeNodeTypesRef.current;
        const aets = activeEdgeTypesRef.current;
        const actx = activeContextsRef.current;
        const sl = showLabelsRef.current;
        const deg2: Record<string, number> = {};
        g.nodes.forEach((n) => { deg2[n.id] = 0; });
        g.edges.forEach((e) => { if (deg2[e.source] != null) deg2[e.source]++; if (deg2[e.target] != null) deg2[e.target]++; });

        nodeMeshes.forEach((m) => {
          const n = m.userData.node as MemNode;
          const typeOk = ants.has(n.type);
          const ctxOk = actx.size === 0 || (n.context || []).some((c) => actx.has(c));
          m.visible = typeOk && ctxOk;
        });
        labelSprites.forEach((sp) => {
          const n = sp.userData.node as MemNode;
          const mesh = nodeById[n.id];
          sp.visible = sl && !!mesh?.visible && ((deg2[n.id] || 0) >= 3 || n.id === sel?.id);
        });
        edgeLines.forEach((ln) => {
          const a = nodeById[ln.userData.a];
          const b = nodeById[ln.userData.b];
          const edgeTypeOk = aets.has(ln.userData.edge.type);
          ln.visible = edgeTypeOk && !!a?.visible && !!b?.visible;
        });
      }

      // Highlight helpers
      function highlightNeighbors(n: MemNode) {
        const g2 = graphRef.current!;
        const nb = new Set<string>();
        nb.add(n.id);
        g2.edges.forEach((e) => {
          if (e.source === n.id) nb.add(e.target);
          if (e.target === n.id) nb.add(e.source);
        });
        nodeMeshes.forEach((m) => {
          const isMe = m.userData.node.id === n.id;
          const isNb = nb.has(m.userData.node.id);
          m.material.emissiveIntensity = isMe ? 1.2 : isNb ? 0.8 : 0.1;
          m.material.opacity = isNb || isMe ? 1 : 0.2;
          m.material.transparent = !isNb && !isMe;
          m.scale.setScalar(m.userData.baseScale * (isMe ? 1.5 : isNb ? 1.1 : 0.85));
        });
        edgeLines.forEach((ln) => {
          const touch = ln.userData.a === n.id || ln.userData.b === n.id;
          ln.material.opacity = touch ? 0.95 : 0.05;
          const edgeCol = new THREE.Color(g2.meta.edgeTypes[ln.userData.edge.type] || "#888");
          ln.material.color.set(touch ? 0xf6a21e : edgeCol);
        });
      }

      function clearHighlight() {
        const g2 = graphRef.current!;
        nodeMeshes.forEach((m) => {
          m.material.emissiveIntensity = 0.35;
          m.material.opacity = 1;
          m.material.transparent = false;
          m.scale.setScalar(m.userData.baseScale);
        });
        edgeLines.forEach((ln) => {
          ln.material.opacity = settingsRef.current.edgeOpacity;
          ln.material.color.set(new THREE.Color(g2.meta.edgeTypes[ln.userData.edge.type] || "#888"));
        });
      }

      // Store all three refs
      const T = {
        renderer, scene, camera, raycaster, THREE,
        nodeMeshes, edgeLines, labelSprites, nodeById, stars, fogObj,
        animId: 0,
        theta: 0.7, phi: 1.1, radius: 420,
        target: new THREE.Vector3(0, 0, 0),
        dragging: false, moved: false, px: 0, py: 0,
        selectedMesh: null as any,
        hoveredMesh: null as any,
        degree: deg,
      };
      threeRef.current = T;

      // ── Animation loop ──────────────────────────────────────────────────
      function loop() {
        if (!alive) return;
        T.animId = requestAnimationFrame(loop);
        const s = settingsRef.current;
        if (s.autoSpin) T.theta += s.spinSpeed;

        const r2 = T.radius;
        T.camera.position.set(
          T.target.x + r2 * Math.sin(T.phi) * Math.cos(T.theta),
          T.target.y + r2 * Math.cos(T.phi),
          T.target.z + r2 * Math.sin(T.phi) * Math.sin(T.theta)
        );
        T.camera.lookAt(T.target);

        // Scale labels by distance
        T.labelSprites.forEach((sp: any) => {
          if (sp.visible) {
            const dist = T.camera.position.distanceTo(sp.position);
            const sc = Math.max(0.7, dist / 600);
            if (sp.material.map?.image) {
              sp.scale.set(sp.material.map.image.width * 0.16 * sc, sp.material.map.image.height * 0.16 * sc, 1);
            }
          }
        });

        T.renderer.render(T.scene, T.camera);
      }
      loop();

      // Apply initial filters
      applyFilters(null);

      // ── Mouse / pointer events ──────────────────────────────────────────
      function getMouseNDC(e: PointerEvent) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
          y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
        };
      }

      function pick(e: PointerEvent) {
        const { x, y } = getMouseNDC(e);
        T.raycaster.setFromCamera({ x, y }, T.camera);
        return T.raycaster.intersectObjects(T.nodeMeshes.filter((m: any) => m.visible));
      }

      function onPointerDown(e: PointerEvent) {
        T.dragging = true; T.moved = false;
        T.px = e.clientX; T.py = e.clientY;
      }

      function onPointerMove(e: PointerEvent) {
        if (T.dragging) {
          const dx = e.clientX - T.px;
          const dy = e.clientY - T.py;
          T.px = e.clientX; T.py = e.clientY;
          if (Math.abs(dx) + Math.abs(dy) > 2) T.moved = true;
          T.theta -= dx * 0.005;
          T.phi -= dy * 0.005;
          T.phi = Math.max(0.15, Math.min(Math.PI - 0.15, T.phi));
        } else {
          // hover
          const hits = pick(e);
          if (hits.length) {
            T.hoveredMesh = hits[0].object;
            canvas.style.cursor = "pointer";
          } else {
            T.hoveredMesh = null;
            canvas.style.cursor = "default";
          }
        }
      }

      function onPointerUp(e: PointerEvent) {
        if (T.dragging && !T.moved) {
          const hits = pick(e);
          if (hits.length) {
            const mesh = hits[0].object;
            const n = mesh.userData.node as MemNode;
            T.selectedMesh = mesh;
            T.target.copy(mesh.position);
            T.radius = Math.max(120, 160);
            setSelectedNode(n);
            setShowDetails(true);
            highlightNeighbors(n);
            applyFilters(n);
          } else {
            T.selectedMesh = null;
            setSelectedNode(null);
            setShowDetails(false);
            clearHighlight();
            applyFilters(null);
          }
        }
        T.dragging = false;
      }

      function onWheel(e: WheelEvent) {
        e.preventDefault();
        T.radius *= 1 + Math.sign(e.deltaY) * 0.08;
        T.radius = Math.max(90, Math.min(2200, T.radius));
      }

      function onResize() {
        if (!container) return;
        const w2 = container.clientWidth;
        const h2 = container.clientHeight;
        T.renderer.setSize(w2, h2);
        T.camera.aspect = w2 / h2;
        T.camera.updateProjectionMatrix();
      }

      canvas.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("resize", onResize);

      // Expose applyFilters + clearHighlight + highlightNeighbors to other effects
      (T as any)._applyFilters = applyFilters;
      (T as any)._clearHighlight = clearHighlight;
      (T as any)._highlightNeighbors = highlightNeighbors;

      return () => {
        alive = false;
        cancelAnimationFrame(T.animId);
        canvas.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("wheel", onWheel);
        window.removeEventListener("resize", onResize);
        T.renderer.dispose();
        sphereGeo.dispose();
        T.nodeMeshes.forEach((m: any) => m.material.dispose());
        T.edgeLines.forEach((l: any) => { l.geometry.dispose(); l.material.dispose(); });
        T.labelSprites.forEach((sp: any) => { sp.material.map?.dispose(); sp.material.dispose(); });
      };
    }

    const cleanup = init();
    return () => { alive = false; cleanup.then((fn) => fn && fn()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, layer, vaultTick]);

  // ── Live-update settings on change ────────────────────────────────────────
  useEffect(() => {
    const T = threeRef.current;
    if (!T) return;
    const { THREE } = T;
    if (settings.showFog) T.scene.fog = T.fogObj;
    else T.scene.fog = null;
    if (settings.showStars) {
      if (!T.scene.children.includes(T.stars)) T.scene.add(T.stars);
    } else {
      T.scene.remove(T.stars);
    }
    // Edge opacity
    T.edgeLines.forEach((ln: any) => {
      ln.material.opacity = settings.edgeOpacity;
      ln.userData.baseOpacity = settings.edgeOpacity;
    });
    // Node sizes
    T.nodeMeshes.forEach((m: any) => {
      const newS = settings.nodeSize * m.userData.baseScale;
      m.scale.setScalar(newS);
      // update baseScale proportionally — but keep original degree factor
      // We scale the displayed mesh; baseScale stays original so selection pulses correctly
    });
    // Filters
    (T as any)._applyFilters?.(selectedNode);
  }, [settings, selectedNode]);

  // ── Filter change ─────────────────────────────────────────────────────────
  useEffect(() => {
    (threeRef.current as any)?._applyFilters?.(selectedNode);
  }, [activeNodeTypes, activeEdgeTypes, activeContexts, selectedNode]);

  // ── Relayout button ────────────────────────────────────────────────────────
  function handleRelayout() {
    const g = graphRef.current;
    const T = threeRef.current;
    if (!g || !T) return;
    runLayout(g.nodes, g.edges, settings.repulsion, settings.layoutMode);
    g.nodes.forEach((n) => {
      const m = T.nodeById[n.id];
      if (m) m.position.set(n._p!.x, n._p!.y, n._p!.z);
    });
    T.labelSprites.forEach((sp: any) => {
      const n = sp.userData.node as MemNode;
      sp.position.set(n._p!.x, n._p!.y, n._p!.z);
    });
    T.edgeLines.forEach((ln: any) => {
      const a = T.nodeById[ln.userData.a];
      const b = T.nodeById[ln.userData.b];
      if (a && b) ln.geometry.setFromPoints([a.position.clone(), b.position.clone()]);
    });
  }

  // ── Search ────────────────────────────────────────────────────────────────
  function handleSearch(q: string) {
    setSearchQ(q);
    if (!q.trim()) return;
    const g = graphRef.current;
    const T = threeRef.current;
    if (!g || !T) return;
    const hit = g.nodes.find(
      (n) =>
        n.label.toLowerCase().includes(q.toLowerCase()) ||
        n.id.toLowerCase().includes(q.toLowerCase())
    );
    if (hit) {
      const mesh = T.nodeById[hit.id];
      if (mesh) {
        T.target.copy(mesh.position);
        T.radius = 180;
        setSelectedNode(hit);
        setShowDetails(true);
        (T as any)._highlightNeighbors?.(hit);
        (T as any)._applyFilters?.(hit);
      }
    }
  }

  // ── Focus node (from chat or neighbors click) ──────────────────────────────
  function focusNodeById(id: string) {
    const g = graphRef.current;
    const T = threeRef.current;
    if (!g || !T) return;
    const node = g.nodes.find((n) => n.id === id);
    const mesh = T.nodeById[id];
    if (!node || !mesh) return;
    T.target.copy(mesh.position);
    T.radius = 180;
    setSelectedNode(node);
    setShowDetails(true);
    (T as any)._highlightNeighbors?.(node);
    (T as any)._applyFilters?.(node);
  }

  // ── Neighbors of selected node ─────────────────────────────────────────────
  const neighbors = useMemo(() => {
    if (!selectedNode || !graphRef.current) return [];
    const g = graphRef.current;
    const out: { id: string; label: string; rel: string }[] = [];
    g.edges.forEach((e) => {
      if (e.source === selectedNode.id) {
        const n = g.nodes.find((x) => x.id === e.target);
        if (n) out.push({ id: n.id, label: n.label, rel: e.type });
      }
      if (e.target === selectedNode.id) {
        const n = g.nodes.find((x) => x.id === e.source);
        if (n) out.push({ id: n.id, label: n.label, rel: e.type });
      }
    });
    return out;
  }, [selectedNode]);

  // ── AI chat ────────────────────────────────────────────────────────────────
  async function handleChatSend() {
    const text = chatInput.trim();
    if (!text || chatStreaming) return;
    setChatInput("");

    const configs = loadConfigs();
    const activeProviderId = getActiveProviderId();
    const activeConfig = configs.find((c) => c.enabled && c.id === activeProviderId) ?? configs.find((c) => c.enabled);

    setChatMessages((prev) => [...prev, { role: "user", content: text }]);

    if (!activeConfig) {
      setChatMessages((prev) => [
        ...prev,
        { role: "ai", content: "No hay proveedor de IA configurado. Ve a [/agent](/agent) → Ajustes y añade uno." },
      ]);
      return;
    }

    // Build system prompt with graph summary
    const g = graphRef.current;
    const nodeCountByType: Record<string, number> = {};
    if (g) {
      g.nodes.forEach((n) => { nodeCountByType[n.type] = (nodeCountByType[n.type] || 0) + 1; });
    }
    const graphSummary = g
      ? `Grafo de memoria StarSeed: ${g.nodes.length} nodos (${Object.entries(nodeCountByType).map(([t, c]) => `${c} ${t}`).join(", ")}), ${g.edges.length} conexiones. Capa activa: ${layer}. ${selectedNode ? `Nodo seleccionado: "${selectedNode.label}" (tipo: ${selectedNode.type}). Resumen: ${selectedNode.summary || "—"}` : "Ningún nodo seleccionado."}`
      : "";

    const systemPrompt = `Eres el Exocórtex de StarSeed OS, un asistente de memoria y navegación del grafo de conocimiento personal del ecosistema StarSeed. Tienes acceso al mapa mental 3D y puedes ayudar a explorar conexiones, entender conceptos y encontrar nodos relevantes.\n\nContexto actual del grafo:\n${graphSummary}\n\nResponde siempre en español, con concisión y precisión. Si el usuario menciona el nombre de un nodo del grafo, indícalo claramente para que pueda enfocarse.`;

    const history: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...chatMessages.filter((m) => !m.pending).map<ChatMessage>((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: text },
    ];

    setChatMessages((prev) => [...prev, { role: "ai", content: "", pending: true }]);
    setChatStreaming(true);
    abortRef.current = new AbortController();

    try {
      await chat({
        messages: history,
        temperature: 0.7,
        signal: abortRef.current.signal,
        onChunk: (delta: string) => {
          setChatMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "ai" && last.pending) {
              next[next.length - 1] = { ...last, content: last.content + delta };
            }
            return next;
          });
        },
      });
      setChatMessages((prev) => prev.map((m) => (m.pending ? { ...m, pending: false } : m)));
    } catch (err) {
      const msg = (err as Error).message;
      setChatMessages((prev) => {
        const next = prev.filter((m) => !m.pending);
        next.push({ role: "ai", content: `Error: ${msg}` });
        return next;
      });
    } finally {
      setChatStreaming(false);
      abortRef.current = null;
    }
  }

  // Scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Find node labels mentioned in last AI message
  const lastAiMsg = chatMessages.filter((m) => m.role === "ai" && !m.pending).at(-1)?.content ?? "";
  const mentionedNodes = useMemo(() => {
    if (!graphRef.current || !lastAiMsg) return [];
    return graphRef.current.nodes.filter((n) =>
      lastAiMsg.toLowerCase().includes(n.label.toLowerCase()) && n.label.length > 3
    ).slice(0, 4);
  }, [lastAiMsg]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!mounted) {
    return (
      <div className={`relative w-full flex items-center justify-center bg-[#0d130e] rounded-2xl ${className}`} style={{ minHeight: compact ? 300 : 600 }}>
        <div className="text-center space-y-2">
          <Brain className="w-10 h-10 text-amber-400/50 mx-auto animate-pulse" />
          <p className="text-sm text-amber-200/40">Inicializando visor 3D...</p>
        </div>
      </div>
    );
  }

  const g = graphRef.current;
  const nodeTypeEntries = g ? Object.entries(g.meta.nodeTypes) : [];
  const edgeTypeEntries = g ? Object.entries(g.meta.edgeTypes) : [];
  const contextList = g ? g.meta.contexts : [];

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0d130e] ${className}`}
      style={{ minHeight: compact ? 300 : 600 }}
      ref={containerRef}
    >
      {/* ── Canvas ────────────────────────────────────────────────────────── */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 py-2 z-10 pointer-events-none">
        <span
          className="font-bold text-sm pointer-events-auto"
          style={{ background: "linear-gradient(92deg,#f4e8c9,#E9C46A,#F6A21E)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        >
          ✦ Memoria 3D
        </span>
        <span className="text-[11px] text-amber-200/40 pointer-events-auto">
          {stats.nodes} nodos · {stats.edges} conexiones
        </span>

        {/* Layer toggle */}
        <div className="ml-2 flex gap-1 pointer-events-auto">
          {(["todo", "memoria", "red-os"] as LayerMode[]).map((l) => (
            <button
              key={l}
              onClick={() => setLayer(l)}
              className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors cursor-pointer ${
                layer === l
                  ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                  : "bg-black/30 border-white/10 text-white/40 hover:text-white/70"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="ml-auto flex items-center gap-1 pointer-events-auto bg-black/50 border border-amber-500/20 rounded-lg px-2 py-1">
          <Search className="w-3 h-3 text-amber-400/50" />
          <input
            value={searchQ}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar nodo…"
            className="bg-transparent text-[12px] text-amber-100 placeholder:text-amber-200/30 outline-none w-32"
          />
        </div>

        {/* Icon buttons */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="pointer-events-auto p-1.5 rounded-lg bg-black/40 border border-white/10 text-amber-400/70 hover:text-amber-300 transition cursor-pointer"
          title="Filtros"
        >
          <Layers className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="pointer-events-auto p-1.5 rounded-lg bg-black/40 border border-white/10 text-amber-400/70 hover:text-amber-300 transition cursor-pointer"
          title="Ajustes"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowVault(true)}
          className={`pointer-events-auto p-1.5 rounded-lg border transition cursor-pointer ${showVault ? "bg-purple-500/20 border-purple-500/50 text-purple-200" : "bg-black/40 border-white/10 text-purple-300/70 hover:text-purple-200"}`}
          title="Memorias (.md) — elige cuáles se despliegan en el cerebro"
        >
          <Database className="w-3.5 h-3.5" />
        </button>
        {showChat && (
          <button
            onClick={() => setChatOpen((v) => !v)}
            className={`pointer-events-auto p-1.5 rounded-lg border transition cursor-pointer ${chatOpen ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-black/40 border-white/10 text-amber-400/70 hover:text-amber-300"}`}
            title="Exocórtex AI"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Left panel: filters ───────────────────────────────────────────── */}
      {showFilters && (
        <div className="absolute top-10 left-2 z-10 w-56 max-h-[70%] overflow-y-auto rounded-xl border border-amber-500/20 bg-black/70 backdrop-blur-md p-3 text-[11px] space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-amber-400 uppercase tracking-widest text-[9px] font-bold">Filtros</span>
            <button onClick={() => setShowFilters(false)} className="text-white/30 hover:text-white/70 cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          </div>

          <p className="text-amber-400/60 uppercase tracking-wider text-[9px]">Tipos de nodo</p>
          {nodeTypeEntries.map(([k, c]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={activeNodeTypes.has(k)}
                onChange={() => {
                  setActiveNodeTypes((prev) => {
                    const next = new Set(prev);
                    next.has(k) ? next.delete(k) : next.add(k);
                    return next;
                  });
                }}
                className="accent-amber-400 cursor-pointer"
              />
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: c, boxShadow: `0 0 5px ${c}80` }}
              />
              <span className="text-white/70 group-hover:text-white/90 truncate">{k}</span>
            </label>
          ))}

          <p className="text-amber-400/60 uppercase tracking-wider text-[9px] mt-2">Conexiones</p>
          {edgeTypeEntries.map(([k, c]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={activeEdgeTypes.has(k)}
                onChange={() => {
                  setActiveEdgeTypes((prev) => {
                    const next = new Set(prev);
                    next.has(k) ? next.delete(k) : next.add(k);
                    return next;
                  });
                }}
                className="accent-amber-400 cursor-pointer"
              />
              <span
                className="w-4 h-0.5 flex-shrink-0"
                style={{ background: c }}
              />
              <span className="text-white/70 group-hover:text-white/90 truncate">{k}</span>
            </label>
          ))}

          <p className="text-amber-400/60 uppercase tracking-wider text-[9px] mt-2">Contextos</p>
          <div className="flex flex-wrap gap-1">
            {contextList.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setActiveContexts((prev) => {
                    const next = new Set(prev);
                    next.has(c) ? next.delete(c) : next.add(c);
                    return next;
                  });
                }}
                className={`px-2 py-0.5 rounded-full border text-[10px] cursor-pointer transition-colors ${
                  activeContexts.has(c)
                    ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                    : "bg-transparent border-white/10 text-white/40 hover:text-white/70"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <button
            onClick={handleRelayout}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] hover:bg-amber-500/20 transition cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" /> Reorganizar
          </button>
        </div>
      )}

      {/* ── Settings panel ────────────────────────────────────────────────── */}
      {showSettings && (
        <div className="absolute top-10 right-2 z-10 w-60 rounded-xl border border-amber-500/20 bg-black/70 backdrop-blur-md p-3 text-[11px] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-amber-400 uppercase tracking-widest text-[9px] font-bold">Ajustes del visor</span>
            <button onClick={() => setShowSettings(false)} className="text-white/30 hover:text-white/70 cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Sliders */}
          {([
            ["Tamaño de nodo", "nodeSize", 0.3, 3, 0.1],
            ["Repulsión layout", "repulsion", 2000, 20000, 500],
            ["Opacidad enlaces", "edgeOpacity", 0, 1, 0.05],
            ["Velocidad de giro", "spinSpeed", 0, 0.01, 0.0005],
          ] as [string, keyof Settings, number, number, number][]).map(([label, key, min, max, step]) => (
            <div key={key}>
              <div className="flex justify-between text-white/50 mb-0.5">
                <span>{label}</span>
                <span>{typeof settings[key] === "number" ? (settings[key] as number).toFixed(key === "repulsion" ? 0 : 2) : ""}</span>
              </div>
              <input
                type="range"
                min={min} max={max} step={step}
                value={settings[key] as number}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, [key]: parseFloat(e.target.value) }))
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          ))}

          {/* Toggles */}
          {([
            ["Etiquetas", "showLabels"],
            ["Giro automático", "autoSpin"],
            ["Estrellas", "showStars"],
            ["Niebla", "showFog"],
          ] as [string, keyof Settings][]).map(([label, key]) => (
            <label key={key} className="flex items-center justify-between cursor-pointer">
              <span className="text-white/60">{label}</span>
              <input
                type="checkbox"
                checked={settings[key] as boolean}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, [key]: e.target.checked }))
                }
                className="accent-amber-400 cursor-pointer"
              />
            </label>
          ))}

          {/* Layout mode */}
          <div>
            <span className="text-white/50 block mb-1">Modo de layout</span>
            <div className="flex gap-2">
              {(["organico", "esferico"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSettings((s) => ({ ...s, layoutMode: m }))}
                  className={`flex-1 py-1 rounded-lg border text-[10px] cursor-pointer transition-colors ${
                    settings.layoutMode === m
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "bg-transparent border-white/10 text-white/40 hover:text-white/70"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Details panel ─────────────────────────────────────────────────── */}
      {showDetails && selectedNode && !compact && (
        <div className="absolute top-10 right-2 z-10 w-72 max-h-[75%] overflow-y-auto rounded-xl border border-amber-500/20 bg-black/75 backdrop-blur-md p-4 text-[12px] space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {/* Badges */}
              <div className="flex flex-wrap gap-1 mb-2">
                {[selectedNode.type, selectedNode.kind, selectedNode.status, ...(selectedNode.context || [])].filter(Boolean).map((b, i) => {
                  const colors = [g?.meta.nodeTypes[selectedNode.type], "#9C6B3F", "#4DD0E1", "#7FD1AE"];
                  const c = colors[i] || "#9aa39a";
                  return (
                    <span
                      key={b}
                      className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: hexA(c, 0.18), color: c, border: `1px solid ${hexA(c, 0.5)}` }}
                    >
                      {b}
                    </span>
                  );
                })}
              </div>
              <h3 className="text-amber-100 font-semibold text-sm leading-tight">{selectedNode.label}</h3>
            </div>
            <button
              onClick={() => {
                setShowDetails(false);
                setSelectedNode(null);
                (threeRef.current as any)?._clearHighlight?.();
                (threeRef.current as any)?._applyFilters?.(null);
              }}
              className="text-white/30 hover:text-white/70 flex-shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {selectedNode.summary && (
            <p className="text-white/60 leading-relaxed">{selectedNode.summary}</p>
          )}

          {/* Links */}
          {(selectedNode.links?.length || 0) > 0 && (
            <div className="space-y-1">
              {selectedNode.links!.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer"
                >
                  ↗ {l.label}
                </a>
              ))}
            </div>
          )}

          {/* OS deep link */}
          {selectedNode._osLink && (
            <a
              href={selectedNode._osLink}
              className="block text-blue-400 hover:text-blue-300 underline underline-offset-2 cursor-pointer"
            >
              → Abrir en el OS
            </a>
          )}

          {/* Neighbors */}
          <div>
            <p className="text-amber-400/60 uppercase tracking-wider text-[9px] font-bold mb-1">Conexiones ({neighbors.length})</p>
            <div className="space-y-0.5 max-h-36 overflow-y-auto">
              {neighbors.map((nb) => (
                <button
                  key={nb.id}
                  onClick={() => focusNodeById(nb.id)}
                  className="w-full text-left flex items-center gap-1.5 text-white/50 hover:text-amber-200 transition cursor-pointer py-0.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400/40 flex-shrink-0" />
                  <span className="truncate">{nb.label}</span>
                  <span className="text-[9px] text-white/25 ml-auto flex-shrink-0">{nb.rel}</span>
                </button>
              ))}
              {neighbors.length === 0 && (
                <span className="text-white/25">—</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AI Chat panel ─────────────────────────────────────────────────── */}
      {showChat && chatOpen && (
        <div
          className={`absolute z-20 flex flex-col rounded-xl border border-amber-500/20 bg-black/80 backdrop-blur-md overflow-hidden ${
            compact
              ? "bottom-2 right-2 w-64 h-52"
              : "bottom-2 right-2 w-80 h-96"
          }`}
        >
          {/* Chat header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-amber-500/15 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-semibold text-amber-200">Exocórtex AI</span>
              {chatStreaming && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
            </div>
            <button onClick={() => setChatOpen(false)} className="text-white/30 hover:text-white/70 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-2 space-y-2">
            {chatMessages.length === 0 && (
              <p className="text-white/25 text-[11px] text-center mt-4">
                Pregúntame sobre el grafo de memoria...
              </p>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-amber-500/20 border border-amber-500/30 text-amber-100"
                      : "bg-white/5 border border-white/10 text-white/80"
                  } ${m.pending ? "opacity-70" : ""}`}
                >
                  {m.content || (m.pending ? "▋" : "")}
                </div>
              </div>
            ))}

            {/* Focus suggestions for mentioned nodes */}
            {mentionedNodes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {mentionedNodes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => focusNodeById(n.id)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[9px] cursor-pointer hover:bg-blue-500/25 transition"
                  >
                    <Focus className="w-2.5 h-2.5" />
                    {n.label.slice(0, 16)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex items-center gap-1.5 px-2 py-2 border-t border-amber-500/15 flex-shrink-0">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
              placeholder="Escribe aquí…"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:border-amber-500/40"
            />
            {chatStreaming ? (
              <button
                onClick={() => { abortRef.current?.abort(); setChatStreaming(false); }}
                className="p-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 cursor-pointer hover:bg-red-500/30 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleChatSend}
                disabled={!chatInput.trim()}
                className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 cursor-pointer hover:bg-amber-500/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Bottom hint ────────────────────────────────────────────────────── */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <span className="text-[10px] text-amber-200/25 bg-black/40 border border-amber-500/10 rounded-full px-3 py-1 whitespace-nowrap">
          Arrastra · rueda para zoom · clic para detalles
        </span>
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      {!compact && (
        <div className="absolute bottom-8 left-2 z-10 space-y-0.5 pointer-events-none">
          {nodeTypeEntries.slice(0, 8).map(([k, c]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: c }} />
              <span className="text-[9px] text-white/30">{k}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Vault de Memorias (.md) — elegir/editar/importar/exportar memorias ── */}
      <MemoryVaultPanel
        open={showVault}
        onClose={() => setShowVault(false)}
        onChange={() => setVaultTick((t) => t + 1)}
      />
    </div>
  );
}
