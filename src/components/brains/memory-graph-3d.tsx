"use client";

// src/components/brains/memory-graph-3d.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Vista 3D del Grafo de Memorias (react-three-fiber + drei). Mismo patrón que
// src/components/education/topic-graph-3d.tsx: nodos = memorias coloreadas por
// TIPO (memory-types.ts), aristas EXTRACTED (wiki-link/referencia, brillantes)
// vs INFERRED (mismo cerebro+tipo, tenues). SIEMPRE se importa vía
// next/dynamic({ssr:false}) desde memory-graph.tsx — este módulo no debe
// importarse directo desde código que pueda renderizar en el servidor.
// Ver architecture/cerebros-memorias-graphify.md §5.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";

export interface MemGraphNode {
  id: string;
  label: string;
  typeLabel: string;
  color: string;
  size: number;
  position: [number, number, number];
  /** Nº de aristas que tocan este nodo (para destacar "nodos clave"). */
  degree: number;
}

export type MemGraphEdgeKind = "extracted" | "inferred";

export interface MemGraphEdge {
  source: string;
  target: string;
  kind: MemGraphEdgeKind;
}

const EXTRACTED_COLOR = "#fde68a";
const INFERRED_COLOR = "#ffffff22";
const HIGHLIGHT_EDGE = "#22d3ee";

function NodeMesh({
  node,
  dimmed,
  highlighted,
  hovered,
  onHover,
  onUnhover,
  onClick,
}: {
  node: MemGraphNode;
  dimmed: boolean;
  highlighted: boolean;
  hovered: boolean;
  onHover: (id: string) => void;
  onUnhover: () => void;
  onClick: (node: MemGraphNode) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const baseColor = useMemo(() => new THREE.Color(node.color), [node.color]);

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const target = hovered || highlighted ? 1.24 : 1;
    const s = THREE.MathUtils.damp(m.scale.x, target, 8, dt);
    m.scale.setScalar(s);
  });

  const emissiveIntensity = highlighted ? 0.95 : hovered ? 0.7 : 0.32;
  const opacity = dimmed ? 0.16 : 1;

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
      <sphereGeometry args={[node.size, 22, 22]} />
      <meshStandardMaterial
        color={baseColor}
        emissive={baseColor}
        emissiveIntensity={emissiveIntensity}
        roughness={0.35}
        metalness={0.22}
        transparent
        opacity={opacity}
      />
      {(hovered || highlighted) && (
        <Html center distanceFactor={240} style={{ pointerEvents: "none" }}>
          <div
            style={{
              transform: "translateY(-150%)",
              whiteSpace: "nowrap",
              padding: "2px 8px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: "#f8fafc",
              background: "rgba(8,12,20,0.85)",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
            }}
          >
            {node.label}
            <span style={{ opacity: 0.6, fontWeight: 400 }}> · {node.typeLabel}</span>
          </div>
        </Html>
      )}
    </mesh>
  );
}

function Scene({
  nodes,
  edges,
  posById,
  selectedId,
  hoveredId,
  setHoveredId,
  onNodeClick,
}: {
  nodes: MemGraphNode[];
  edges: MemGraphEdge[];
  posById: Map<string, [number, number, number]>;
  selectedId: string | null;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  onNodeClick: (node: MemGraphNode) => void;
}) {
  const focusSet = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    for (const e of edges) {
      if (e.source === selectedId) set.add(e.target);
      if (e.target === selectedId) set.add(e.source);
    }
    return set;
  }, [selectedId, edges]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[200, 300, 200]} intensity={1.1} color="#ffe6b0" />
      <pointLight position={[-250, -150, -200]} intensity={0.5} color="#a78bfa" />

      {edges.map((e, i) => {
        const a = posById.get(e.source);
        const b = posById.get(e.target);
        if (!a || !b) return null;
        const highlighted = !!focusSet && focusSet.has(e.source) && focusSet.has(e.target);
        const dimmed = !!focusSet && !highlighted;
        const baseColor = e.kind === "extracted" ? EXTRACTED_COLOR : INFERRED_COLOR;
        return (
          <Line
            key={`e${i}`}
            points={[a, b]}
            color={highlighted ? HIGHLIGHT_EDGE : baseColor}
            lineWidth={highlighted ? 2.4 : e.kind === "extracted" ? 1.6 : 0.8}
            transparent
            opacity={dimmed ? 0.05 : highlighted ? 0.95 : e.kind === "extracted" ? 0.7 : 0.3}
          />
        );
      })}

      {nodes.map((nd) => {
        const highlighted = !!focusSet && focusSet.has(nd.id);
        const dimmed = !!focusSet && !highlighted;
        return (
          <NodeMesh
            key={nd.id}
            node={nd}
            dimmed={dimmed}
            highlighted={highlighted}
            hovered={hoveredId === nd.id}
            onHover={setHoveredId}
            onUnhover={() => setHoveredId(null)}
            onClick={onNodeClick}
          />
        );
      })}
    </>
  );
}

export default function MemoryGraph3D({
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const posById = useMemo(() => new Map(nodes.map((nd) => [nd.id, nd.position])), [nodes]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[#0a0e16]">
      <Canvas camera={{ position: [0, 140, 480], fov: 55, near: 1, far: 6000 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={["#0a0e16"]} />
        <fogExp2 attach="fog" args={["#0a0e16", 0.0014]} />
        <OrbitControls enablePan enableZoom enableRotate minDistance={20} maxDistance={2000} makeDefault />
        <Scene
          nodes={nodes}
          edges={edges}
          posById={posById}
          selectedId={selectedId}
          hoveredId={hoveredId}
          setHoveredId={setHoveredId}
          onNodeClick={(nd) => onSelect(nd.id)}
        />
      </Canvas>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-white/10 bg-black/45 p-2.5 text-[11px] text-white/70 backdrop-blur">
        {nodes.length} memorias · {edges.length} conexiones
      </div>
    </div>
  );
}
