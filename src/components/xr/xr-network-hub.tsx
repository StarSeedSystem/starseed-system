'use client';

// ════════════════════════════════════════════════════════════════════════════
// XRNetworkHub — Hub 3D / VR / AR unificado e inteligente del StarSeed OS
// ----------------------------------------------------------------------------
// Presenta TODA la red real del usuario en 3D como nodos animados:
//   • Cerebros (brains)            → núcleos dorados
//   • Archivos de memoria          → ramas (brain_memory_files)
//   • Memorias (memories)          → satélites cian
//   • Baúles (vaults)              → almacenes
//   • Pizarras (canvases)          → lienzos
//   • Páginas / Grupos / Eventos   → entidades sociales (os_pages/os_groups/os_events)
//   • Interconexiones              → aristas (cerebro↔archivo, cerebro↔memoria,
//                                     baúl↔memoria, cerebro↔baúl…)
//
// + Menú 3D inteligente (radial/espacial, pensado para VR/AR): navegar áreas,
//   filtrar tipos de nodo, abrir el item real (ruta/preview) o enfocarlo.
// + Trinity dock en 3D (lee dock-config en solo lectura).
// + Astraura integrada: botón de voz/acción (useAurora) + skills 3D
//   (enfocar nodo, agrupar por tipo, recorrido guiado).
// + Sesión WebXR (AR/VR) con degradación elegante a orbit-3D (reusa useWebXR).
//
// REUTILIZA el stack existente: @react-three/fiber + @react-three/drei + three.
// REUTILIZA la capa de datos: @/utils/supabase/client + @/lib/realtime/realtime.
// REUTILIZA WebXR: ../dashboard/apps/immersive/use-webxr.
// REUTILIZA Astraura: @/components/aurora/aurora-provider (useAurora) — solo IMPORTA.
//
// SSR-safe: "use client" + debe cargarse con next/dynamic { ssr:false } (el
// Canvas/WebGL no puede ejecutarse en el servidor). Respeta prefers-reduced-motion.
// ════════════════════════════════════════════════════════════════════════════

import React, {
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Line, Stars, Sparkles, Float } from '@react-three/drei';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import {
    Headset,
    ScanEye,
    LogOut,
    Loader2,
    Mic,
    MicOff,
    Layers,
    Compass,
    Network,
    Sparkle,
    Route,
    Grid3x3,
    X,
    Brain,
    FileText,
    Database,
    PenLine,
    Users,
    CalendarDays,
    Globe2,
} from 'lucide-react';

import { createClient } from '@/utils/supabase/client';
import { useRealtimeRows } from '@/lib/realtime/realtime';
import { useAurora } from '@/components/aurora/aurora-provider';
import {
    useWebXR,
    type WebXRState,
    type XRMode,
} from '@/components/dashboard/apps/immersive/use-webxr';
import { DOCK_PRESETS, type DockItemConfig } from '@/components/layout/dock-config';

// ────────────────────────────────────────────────────────────────────────────
// Tipos de las filas (solo lectura del grafo)
// ────────────────────────────────────────────────────────────────────────────

interface BrainRow {
    id: string;
    owner: string;
    name: string | null;
    includes?: { vaults?: string[] | null } | Record<string, unknown> | null;
}
interface MemoryFileRow {
    id: string;
    owner: string;
    brain_id?: string | null;
    name: string | null;
}
interface MemoryRow {
    id: string;
    owner: string;
    name: string | null;
    vault_id?: string | null;
}
interface VaultRow {
    id: string;
    owner: string;
    name: string | null;
}
interface CanvasRow {
    id: string;
    owner: string;
    title: string | null;
}
interface EntityRow {
    id: string;
    slug: string | null;
    name?: string | null;
    title?: string | null;
    accent?: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Modelo de grafo
// ────────────────────────────────────────────────────────────────────────────

export type XRNodeKind =
    | 'brain'
    | 'file'
    | 'memory'
    | 'vault'
    | 'canvas'
    | 'page'
    | 'group'
    | 'event';

interface XRNode {
    id: string;
    refId: string;
    label: string;
    kind: XRNodeKind;
    color: string;
    size: number;
    position: [number, number, number];
    href?: string;
    subtitle?: string;
}

interface XREdge {
    id: string;
    source: string;
    target: string;
    color: string;
    width: number;
}

const KIND_COLOR: Record<XRNodeKind, string> = {
    brain: '#fcd34d',
    file: '#c084fc',
    memory: '#22d3ee',
    vault: '#34d399',
    canvas: '#f472b6',
    page: '#60a5fa',
    group: '#a78bfa',
    event: '#fb923c',
};

const KIND_LABEL: Record<XRNodeKind, string> = {
    brain: 'Cerebros',
    file: 'Archivos',
    memory: 'Memorias',
    vault: 'Baúles',
    canvas: 'Pizarras',
    page: 'Páginas',
    group: 'Grupos',
    event: 'Eventos',
};

const KIND_EMOJI: Record<XRNodeKind, string> = {
    brain: '🧠',
    file: '📄',
    memory: '💠',
    vault: '🗄',
    canvas: '🎨',
    page: '📄',
    group: '👥',
    event: '📅',
};

const ALL_KINDS: XRNodeKind[] = [
    'brain',
    'file',
    'memory',
    'vault',
    'canvas',
    'page',
    'group',
    'event',
];

const MAX_NODES = 320;
const EDGE_DIM = 0.06;

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

function fib(i: number, n: number, radius: number, cy = 0): [number, number, number] {
    if (n <= 0) return [0, cy, 0];
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - (i / Math.max(1, n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = golden * i;
    return [Math.cos(t) * r * radius, cy + y * radius * 0.55, Math.sin(t) * r * radius];
}

function vaultIdsOf(brain: BrainRow): string[] {
    const inc = brain.includes as { vaults?: unknown } | null | undefined;
    const v = inc?.vaults;
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
    return [];
}

interface BuiltGraph {
    nodes: XRNode[];
    edges: XREdge[];
    branchMap: Map<string, Set<string>>;
    counts: Record<XRNodeKind, number>;
}

function buildGraph(
    brains: BrainRow[],
    files: MemoryFileRow[],
    memories: MemoryRow[],
    vaults: VaultRow[],
    canvases: CanvasRow[],
    pages: EntityRow[],
    groups: EntityRow[],
    events: EntityRow[],
    show: Record<XRNodeKind, boolean>,
): BuiltGraph {
    const nodes: XRNode[] = [];
    const edges: XREdge[] = [];
    const counts = {
        brain: brains.length,
        file: files.length,
        memory: memories.length,
        vault: vaults.length,
        canvas: canvases.length,
        page: pages.length,
        group: groups.length,
        event: events.length,
    } as Record<XRNodeKind, number>;

    const nodeById = new Map<string, XRNode>();
    const add = (n: XRNode) => {
        if (nodes.length >= MAX_NODES) return false;
        nodes.push(n);
        nodeById.set(n.id, n);
        return true;
    };

    const brainPos = new Map<string, [number, number, number]>();
    if (show.brain) {
        brains.forEach((b, i) => {
            const pos = ring(0, 0, Math.max(3, brains.length * 0.9), i, brains.length, 0);
            brainPos.set(b.id, pos);
            add({
                id: `brain:${b.id}`,
                refId: b.id,
                label: b.name || 'Cerebro',
                kind: 'brain',
                color: KIND_COLOR.brain,
                size: 0.62,
                position: pos,
                href: '/cerebro/mapa',
                subtitle: 'cerebro',
            });
        });
    }

    if (show.file) {
        const byBrain = new Map<string, MemoryFileRow[]>();
        for (const f of files) {
            const k = f.brain_id || '__loose__';
            if (!byBrain.has(k)) byBrain.set(k, []);
            byBrain.get(k)!.push(f);
        }
        let looseIdx = 0;
        for (const [brainId, fs] of byBrain) {
            const center = brainPos.get(brainId);
            fs.forEach((f, i) => {
                let pos: [number, number, number];
                if (center) {
                    pos = ring(center[0], center[2], 1.7, i, fs.length, 0.4 + (i % 3) * 0.35);
                } else {
                    pos = fib(looseIdx++, files.length + 1, 6, 4.5);
                }
                const ok = add({
                    id: `file:${f.id}`,
                    refId: f.id,
                    label: f.name || 'nota.md',
                    kind: 'file',
                    color: KIND_COLOR.file,
                    size: 0.26,
                    position: pos,
                    href: '/cerebro/mapa',
                    subtitle: 'archivo',
                });
                if (ok && center) {
                    edges.push({
                        id: `e:b-f:${f.id}`,
                        source: `brain:${brainId}`,
                        target: `file:${f.id}`,
                        color: '#c084fc55',
                        width: 1.2,
                    });
                }
            });
        }
    }

    const vaultPos = new Map<string, [number, number, number]>();
    if (show.vault) {
        vaults.forEach((v, i) => {
            const pos = ring(0, 0, Math.max(6, vaults.length * 0.7) + 4, i, vaults.length, -1.6);
            vaultPos.set(v.id, pos);
            add({
                id: `vault:${v.id}`,
                refId: v.id,
                label: v.name || 'Baúl',
                kind: 'vault',
                color: KIND_COLOR.vault,
                size: 0.42,
                position: pos,
                href: '/baules',
                subtitle: 'baúl',
            });
        });
        for (const b of brains) {
            for (const vid of vaultIdsOf(b)) {
                if (nodeById.has(`brain:${b.id}`) && nodeById.has(`vault:${vid}`)) {
                    edges.push({
                        id: `e:b-v:${b.id}:${vid}`,
                        source: `brain:${b.id}`,
                        target: `vault:${vid}`,
                        color: '#34d39955',
                        width: 1.1,
                    });
                }
            }
        }
    }

    if (show.memory) {
        memories.forEach((m, i) => {
            const vpos = m.vault_id ? vaultPos.get(m.vault_id) : undefined;
            const pos = vpos
                ? ring(vpos[0], vpos[2], 1.5, i, memories.length, vpos[1] + 0.6 + (i % 3) * 0.3)
                : fib(i, memories.length + 1, 11, 1);
            const ok = add({
                id: `memory:${m.id}`,
                refId: m.id,
                label: m.name || 'Memoria',
                kind: 'memory',
                color: KIND_COLOR.memory,
                size: 0.24,
                position: pos,
                href: '/memorias-3d',
                subtitle: 'memoria',
            });
            if (ok && vpos && m.vault_id && nodeById.has(`vault:${m.vault_id}`)) {
                edges.push({
                    id: `e:v-m:${m.id}`,
                    source: `vault:${m.vault_id}`,
                    target: `memory:${m.id}`,
                    color: '#22d3ee55',
                    width: 0.9,
                });
            }
        });
    }

    if (show.canvas) {
        canvases.forEach((c, i) => {
            add({
                id: `canvas:${c.id}`,
                refId: c.id,
                label: c.title || 'Pizarra',
                kind: 'canvas',
                color: KIND_COLOR.canvas,
                size: 0.36,
                position: ring(0, 0, 13, i, canvases.length, 5.5),
                href: `/pizarra?canvas=${encodeURIComponent(c.id)}`,
                subtitle: 'pizarra',
            });
        });
    }

    const placeEntities = (
        rows: EntityRow[],
        kind: XRNodeKind,
        baseRoute: string,
        cy: number,
    ) => {
        if (!show[kind]) return;
        rows.forEach((r, i) => {
            const label = r.name || r.title || r.slug || KIND_LABEL[kind];
            add({
                id: `${kind}:${r.id}`,
                refId: r.id,
                label,
                kind,
                color: r.accent || KIND_COLOR[kind],
                size: kind === 'event' ? 0.3 : 0.38,
                position: fib(i, Math.max(1, rows.length), 16, cy),
                href: r.slug ? `${baseRoute}/${encodeURIComponent(r.slug)}` : baseRoute,
                subtitle: KIND_LABEL[kind].toLowerCase(),
            });
        });
    };
    placeEntities(pages, 'page', '/p', -6);
    placeEntities(groups, 'group', '/g', 7.5);
    placeEntities(events, 'event', '/e', -8.5);

    const branchMap = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
        if (!branchMap.has(a)) branchMap.set(a, new Set([a]));
        if (!branchMap.has(b)) branchMap.set(b, new Set([b]));
        branchMap.get(a)!.add(b);
        branchMap.get(b)!.add(a);
    };
    for (const e of edges) link(e.source, e.target);
    for (const n of nodes) if (!branchMap.has(n.id)) branchMap.set(n.id, new Set([n.id]));

    return { nodes, edges, branchMap, counts };
}

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const apply = () => setReduced(mq.matches);
        apply();
        mq.addEventListener?.('change', apply);
        return () => mq.removeEventListener?.('change', apply);
    }, []);
    return reduced;
}

// ════════════════════════════════════════════════════════════════════════════
// Nodo 3D (icosaedro emisivo + etiqueta al hover/enfoque)
// ════════════════════════════════════════════════════════════════════════════
function NodeMesh({
    node,
    dimmed,
    highlighted,
    hovered,
    onHover,
    onUnhover,
    onClick,
    reduced,
}: {
    node: XRNode;
    dimmed: boolean;
    highlighted: boolean;
    hovered: boolean;
    onHover: (id: string) => void;
    onUnhover: () => void;
    onClick: (node: XRNode) => void;
    reduced: boolean;
}) {
    const ref = useRef<THREE.Mesh>(null);
    const color = useMemo(() => new THREE.Color(node.color), [node.color]);

    useFrame((state, dt) => {
        const m = ref.current;
        if (!m) return;
        const target = hovered || highlighted ? 1.22 : 1;
        const s = THREE.MathUtils.damp(m.scale.x, target, 8, dt);
        m.scale.setScalar(s);
        if (!reduced) m.rotation.y += dt * 0.25;
    });

    const emissive = highlighted ? 1.05 : hovered ? 0.8 : 0.4;
    const opacity = dimmed ? 0.16 : 1;

    return (
        <mesh
            ref={ref}
            position={node.position}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                onHover(node.id);
                if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                onUnhover();
                if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
            }}
            onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onClick(node);
            }}
        >
            <icosahedronGeometry args={[node.size, node.kind === 'brain' ? 2 : 1]} />
            <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={emissive}
                roughness={0.3}
                metalness={0.35}
                transparent
                opacity={opacity}
            />
            {(hovered || highlighted) && (
                <Html center distanceFactor={node.kind === 'brain' ? 9 : 6} style={{ pointerEvents: 'none' }}>
                    <div
                        style={{
                            transform: 'translateY(-150%)',
                            whiteSpace: 'nowrap',
                            padding: '2px 9px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#f8fafc',
                            background: 'rgba(8,12,20,0.85)',
                            border: `1px solid ${node.color}88`,
                            boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
                            userSelect: 'none',
                        }}
                    >
                        {KIND_EMOJI[node.kind]} {node.label}
                        {node.subtitle ? (
                            <span style={{ opacity: 0.55, fontWeight: 400 }}> · {node.subtitle}</span>
                        ) : null}
                    </div>
                </Html>
            )}
        </mesh>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// Arista 3D
// ════════════════════════════════════════════════════════════════════════════
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
            color={highlighted ? '#fde68a' : color}
            lineWidth={highlighted ? width + 1.4 : width}
            transparent
            opacity={dimmed ? EDGE_DIM : highlighted ? 0.95 : 0.45}
        />
    );
}

// ════════════════════════════════════════════════════════════════════════════
// Trinity dock en 3D — panel de accesos, lee dock-config (solo lectura)
// ════════════════════════════════════════════════════════════════════════════
function TrinityDock3D({
    onNavigate,
    reduced,
}: {
    onNavigate: (path: string) => void;
    reduced: boolean;
}) {
    const items = useMemo<DockItemConfig[]>(
        () => DOCK_PRESETS.filter((d) => d.enabled).slice(0, 12),
        [],
    );
    const colorOf = (c: DockItemConfig['color']) =>
        ({
            neutral: '#94a3b8',
            cyan: '#22d3ee',
            crimson: '#fb7185',
            amber: '#fbbf24',
            emerald: '#34d399',
            purple: '#a855f7',
        })[c] ?? '#94a3b8';

    return (
        <group position={[0, -2.6, 4.4]} rotation={[-0.32, 0, 0]}>
            <Html center distanceFactor={10} zIndexRange={[20, 0]}>
                <div
                    style={{
                        display: 'flex',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 999,
                        background: 'rgba(8,10,20,0.72)',
                        border: '1px solid rgba(255,255,255,0.14)',
                        backdropFilter: 'blur(10px)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
                        maxWidth: 540,
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                    }}
                >
                    {items.map((it) => (
                        <button
                            key={it.id}
                            type="button"
                            onClick={() => onNavigate(it.path)}
                            title={it.label}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '5px 10px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#f8fafc',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                                background: `color-mix(in srgb, ${colorOf(it.color)} 18%, rgba(6,8,16,0.7))`,
                                border: `1px solid ${colorOf(it.color)}66`,
                                transition: reduced ? 'none' : 'transform .15s',
                            }}
                            onMouseEnter={(e) => {
                                if (!reduced) (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                            }}
                        >
                            <span
                                style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: 999,
                                    background: colorOf(it.color),
                                    boxShadow: `0 0 8px ${colorOf(it.color)}`,
                                }}
                            />
                            {it.label}
                        </button>
                    ))}
                </div>
            </Html>
        </group>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// XRBridge — capta el renderer (gl) y eleva el estado WebXR
// ════════════════════════════════════════════════════════════════════════════
function XRBridge({ onState }: { onState: (s: WebXRState) => void }) {
    const gl = useThree((s) => s.gl);
    const xr = useWebXR(gl);
    useEffect(() => {
        onState(xr);
    }, [onState, xr, xr.vrSupported, xr.arSupported, xr.inSession, xr.mode, xr.error]);
    return null;
}

// ════════════════════════════════════════════════════════════════════════════
// CameraRig — vuelo suave de la cámara hacia un nodo enfocado
// ════════════════════════════════════════════════════════════════════════════
function CameraRig({
    focusPos,
    controlsRef,
}: {
    focusPos: [number, number, number] | null;
    controlsRef: React.MutableRefObject<any>;
}) {
    const targetVec = useRef(new THREE.Vector3());
    useFrame((state, dt) => {
        if (!focusPos) return;
        const [x, y, z] = focusPos;
        targetVec.current.set(x, y, z);
        const cam = state.camera;
        const dir = new THREE.Vector3().subVectors(cam.position, targetVec.current).normalize();
        const desired = new THREE.Vector3().copy(targetVec.current).add(dir.multiplyScalar(4.5));
        cam.position.lerp(desired, 1 - Math.pow(0.001, dt));
        const ctr = controlsRef.current;
        if (ctr && ctr.target) {
            ctr.target.lerp(targetVec.current, 1 - Math.pow(0.001, dt));
            ctr.update?.();
        }
    });
    return null;
}

// ════════════════════════════════════════════════════════════════════════════
// Escena 3D
// ════════════════════════════════════════════════════════════════════════════
function Scene({
    graph,
    show,
    reduced,
    focusedNode,
    onFocusPos,
    onOpenNode,
    onXRState,
    onNavigate,
    controlsRef,
}: {
    graph: BuiltGraph;
    show: Record<XRNodeKind, boolean>;
    reduced: boolean;
    focusedNode: string | null;
    onFocusPos: (pos: [number, number, number] | null) => void;
    onOpenNode: (node: XRNode) => void;
    onXRState: (s: WebXRState) => void;
    onNavigate: (path: string) => void;
    controlsRef: React.MutableRefObject<any>;
}) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const branch = focusedNode ? graph.branchMap.get(focusedNode) : undefined;
    const posById = useMemo(() => {
        const m = new Map<string, [number, number, number]>();
        for (const n of graph.nodes) m.set(n.id, n.position);
        return m;
    }, [graph.nodes]);

    useEffect(() => {
        if (!focusedNode) {
            onFocusPos(null);
            return;
        }
        const p = posById.get(focusedNode) ?? null;
        onFocusPos(p);
    }, [focusedNode, posById, onFocusPos]);

    const focusPos = focusedNode ? posById.get(focusedNode) ?? null : null;

    return (
        <>
            <fog attach="fog" args={['#05060f', 14, 48]} />
            <color attach="background" args={['#05060f']} />

            <ambientLight intensity={0.55} color="#9db8ff" />
            <hemisphereLight intensity={0.55} color="#bff5d8" groundColor="#10131f" />
            <directionalLight position={[8, 12, 6]} intensity={1.0} color="#ffe9b0" />
            <pointLight position={[-10, 6, -8]} intensity={0.7} color="#a855f7" distance={50} />
            <pointLight position={[0, 4, 10]} intensity={0.5} color="#22d3ee" distance={40} />

            <Stars radius={120} depth={60} count={4500} factor={4} saturation={0} fade speed={reduced ? 0 : 0.5} />
            <Sparkles count={70} scale={[28, 16, 28]} size={3} speed={reduced ? 0 : 0.25} color="#7CF6C8" opacity={0.5} />

            <Float speed={reduced ? 0 : 1} floatIntensity={reduced ? 0 : 0.4} rotationIntensity={reduced ? 0 : 0.2}>
                <mesh position={[0, 0, 0]}>
                    <icosahedronGeometry args={[0.5, 2]} />
                    <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={1.3} roughness={0.2} metalness={0.5} />
                </mesh>
            </Float>

            {graph.edges.map((e) => {
                const from = posById.get(e.source);
                const to = posById.get(e.target);
                if (!from || !to) return null;
                const hl = !!branch && branch.has(e.source) && branch.has(e.target);
                const dim = !!branch && !hl;
                return (
                    <EdgeLine
                        key={e.id}
                        from={from}
                        to={to}
                        color={e.color}
                        width={e.width}
                        dimmed={dim}
                        highlighted={hl}
                    />
                );
            })}

            {graph.nodes.map((n) => {
                if (!show[n.kind]) return null;
                const inBranch = !!branch && branch.has(n.id);
                const dim = !!branch && !inBranch;
                const hl = inBranch || focusedNode === n.id;
                return (
                    <NodeMesh
                        key={n.id}
                        node={n}
                        dimmed={dim}
                        highlighted={hl}
                        hovered={hoveredId === n.id}
                        onHover={setHoveredId}
                        onUnhover={() => setHoveredId(null)}
                        onClick={onOpenNode}
                        reduced={reduced}
                    />
                );
            })}

            <TrinityDock3D onNavigate={onNavigate} reduced={reduced} />

            <OrbitControls
                ref={controlsRef}
                makeDefault
                enablePan
                minDistance={4}
                maxDistance={60}
                autoRotate={!reduced && !focusedNode}
                autoRotateSpeed={0.2}
                target={[0, 0.4, 0]}
            />

            <CameraRig focusPos={focusPos} controlsRef={controlsRef} />

            <XRBridge onState={onXRState} />
        </>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// Menú 3D inteligente (HUD radial/espacial, pensado para VR/AR)
// ════════════════════════════════════════════════════════════════════════════
function SpatialMenu({
    show,
    counts,
    onToggleKind,
    onAllKinds,
    onNavigate,
    activeArea,
}: {
    show: Record<XRNodeKind, boolean>;
    counts: Record<XRNodeKind, number>;
    onToggleKind: (k: XRNodeKind) => void;
    onAllKinds: (v: boolean) => void;
    onNavigate: (path: string) => void;
    activeArea: string | null;
}) {
    const [open, setOpen] = useState(true);

    const AREAS: { label: string; path: string; icon: React.ReactNode }[] = [
        { label: 'Mapa mental', path: '/cerebro/mapa', icon: <Brain className="size-3.5" /> },
        { label: 'Red 3D', path: '/red-3d', icon: <Network className="size-3.5" /> },
        { label: 'Memorias 3D', path: '/memorias-3d', icon: <Database className="size-3.5" /> },
        { label: 'Pizarras', path: '/pizarras', icon: <PenLine className="size-3.5" /> },
        { label: 'Hub', path: '/hub', icon: <Users className="size-3.5" /> },
        { label: 'Inmersivo', path: '/immersive', icon: <Globe2 className="size-3.5" /> },
    ];

    const kindIcon: Record<XRNodeKind, React.ReactNode> = {
        brain: <Brain className="size-3.5" />,
        file: <FileText className="size-3.5" />,
        memory: <Sparkle className="size-3.5" />,
        vault: <Database className="size-3.5" />,
        canvas: <PenLine className="size-3.5" />,
        page: <FileText className="size-3.5" />,
        group: <Users className="size-3.5" />,
        event: <CalendarDays className="size-3.5" />,
    };

    return (
        <div className="pointer-events-auto absolute left-4 top-4 z-20 flex max-h-[80%] w-[15.5rem] flex-col gap-3 overflow-y-auto rounded-2xl border border-white/12 bg-black/55 p-3 backdrop-blur-md">
            <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/80">
                    <Compass className="size-4 text-violet-300" /> Menú 3D
                </span>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
                    title={open ? 'Colapsar' : 'Expandir'}
                >
                    {open ? <X className="size-3.5" /> : <Layers className="size-3.5" />}
                </button>
            </div>

            {open && (
                <>
                    <div>
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                                Filtrar nodos
                            </span>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => onAllKinds(true)}
                                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white/60 hover:bg-white/10"
                                >
                                    Todos
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onAllKinds(false)}
                                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white/60 hover:bg-white/10"
                                >
                                    Ninguno
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            {ALL_KINDS.map((k) => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => onToggleKind(k)}
                                    className={
                                        'inline-flex items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ' +
                                        (show[k]
                                            ? 'text-white'
                                            : 'border-white/10 text-white/35 hover:text-white/60')
                                    }
                                    style={
                                        show[k]
                                            ? {
                                                  background: `color-mix(in srgb, ${KIND_COLOR[k]} 20%, rgba(6,8,16,0.7))`,
                                                  borderColor: `${KIND_COLOR[k]}66`,
                                              }
                                            : undefined
                                    }
                                    title={`${KIND_LABEL[k]} (${counts[k] ?? 0})`}
                                >
                                    <span className="inline-flex items-center gap-1.5" style={{ color: show[k] ? KIND_COLOR[k] : undefined }}>
                                        {kindIcon[k]}
                                        {KIND_LABEL[k]}
                                    </span>
                                    <span className="tabular-nums opacity-60">{counts[k] ?? 0}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                            Ir a un área
                        </span>
                        <div className="flex flex-col gap-1">
                            {AREAS.map((a) => (
                                <button
                                    key={a.path}
                                    type="button"
                                    onClick={() => onNavigate(a.path)}
                                    className={
                                        'inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:bg-white/10 ' +
                                        (activeArea === a.path ? 'bg-white/10 text-white' : 'text-white/70')
                                    }
                                >
                                    <span className="text-violet-300">{a.icon}</span>
                                    {a.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// Skills 3D + Astraura (voz/acción) — barra inferior
// ════════════════════════════════════════════════════════════════════════════
function SkillsBar({
    onTour,
    onGroupByType,
    onResetFocus,
    tourActive,
    nodeCount,
}: {
    onTour: () => void;
    onGroupByType: () => void;
    onResetFocus: () => void;
    tourActive: boolean;
    nodeCount: number;
}) {
    const aurora = useAurora();
    const listening = !!aurora?.listening;

    const toggleVoice = useCallback(() => {
        if (!aurora) return;
        try {
            aurora.toggle();
        } catch {
            /* noop */
        }
    }, [aurora]);

    return (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/12 bg-black/55 px-3 py-2 backdrop-blur-md">
            {aurora ? (
                <button
                    type="button"
                    onClick={toggleVoice}
                    className={
                        'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold text-white shadow-lg transition ' +
                        (listening ? 'bg-rose-600/90 animate-pulse' : 'bg-gradient-to-br from-violet-600 to-indigo-600')
                    }
                    title='Astraura — di: "abre la pizarra X", "muéstrame mis memorias", "ve al mapa mental"'
                >
                    {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                    {listening ? 'Escuchando…' : 'Astraura'}
                </button>
            ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-xs font-semibold text-white/45">
                    <MicOff className="size-4" /> Astraura no disponible
                </span>
            )}

            <div className="mx-1 h-5 w-px bg-white/15" />

            <button
                type="button"
                onClick={onGroupByType}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/85 transition hover:bg-white/12"
                title="Agrupar por tipo"
            >
                <Grid3x3 className="size-4 text-emerald-300" /> Agrupar
            </button>
            <button
                type="button"
                onClick={onTour}
                className={
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition ' +
                    (tourActive
                        ? 'border-amber-400/60 bg-amber-500/20 text-amber-100'
                        : 'border-white/15 bg-white/5 text-white/85 hover:bg-white/12')
                }
                title="Recorrido guiado por la red"
                disabled={nodeCount === 0}
            >
                <Route className="size-4 text-amber-300" /> {tourActive ? 'Detener' : 'Recorrido'}
            </button>
            <button
                type="button"
                onClick={onResetFocus}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/85 transition hover:bg-white/12"
                title="Quitar enfoque / vista general"
            >
                <Compass className="size-4 text-cyan-300" /> Vista general
            </button>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// Botonera XR (AR/VR) — solo aparece si hay soporte real
// ════════════════════════════════════════════════════════════════════════════
function XRControls({ xr }: { xr: WebXRState | null }) {
    if (!xr) return null;
    const { vrSupported, arSupported, inSession, enter, exit, error } = xr;

    const enterBtn = (mode: XRMode, label: string, Icon: typeof Headset) => (
        <button
            type="button"
            onClick={() => void enter(mode)}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-md transition-transform hover:-translate-y-px"
            style={{
                background:
                    mode === 'immersive-vr'
                        ? 'linear-gradient(135deg, #A855F7, #6366F1)'
                        : 'linear-gradient(135deg, #22D3EE, #0EA5E9)',
            }}
        >
            <Icon className="size-4" /> {label}
        </button>
    );

    return (
        <div className="pointer-events-auto absolute right-4 top-4 z-20 flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
                {inSession ? (
                    <button
                        type="button"
                        onClick={() => void exit()}
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-rose-600/90 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-md transition-transform hover:-translate-y-px"
                    >
                        <LogOut className="size-4" /> Salir de XR
                    </button>
                ) : (
                    <>
                        {vrSupported && enterBtn('immersive-vr', 'Entrar en VR', Headset)}
                        {arSupported && enterBtn('immersive-ar', 'Entrar en AR', ScanEye)}
                    </>
                )}
            </div>
            {error && (
                <span className="max-w-[14rem] rounded-lg border border-rose-400/40 bg-rose-950/60 px-2.5 py-1 text-[11px] font-medium text-rose-200">
                    {error}
                </span>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// XRNetworkHub — export principal
// ════════════════════════════════════════════════════════════════════════════
export function XRNetworkHub({ ctx }: { ctx?: string | null }) {
    const reduced = usePrefersReducedMotion();
    const router = useRouter();
    const aurora = useAurora();
    const controlsRef = useRef<any>(null);

    const [xr, setXr] = useState<WebXRState | null>(null);
    const [uid, setUid] = useState<string | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [show, setShow] = useState<Record<XRNodeKind, boolean>>({
        brain: true,
        file: true,
        memory: true,
        vault: true,
        canvas: true,
        page: true,
        group: true,
        event: true,
    });
    const [focusedNode, setFocusedNode] = useState<string | null>(null);
    const [, setFocusPos] = useState<[number, number, number] | null>(null);
    const [tourActive, setTourActive] = useState(false);
    const [activeArea, setActiveArea] = useState<string | null>(null);

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

    const ownerFilter = useMemo(() => (uid ? `owner=eq.${uid}` : undefined), [uid]);
    const ownerIdFilter = useMemo(() => (uid ? `owner_id=eq.${uid}` : undefined), [uid]);

    const { rows: brains, loading: lb } = useRealtimeRows<BrainRow>(
        'brains',
        async () => {
            if (!uid) return [];
            const sb = createClient();
            const { data } = await sb
                .from('brains')
                .select('id,owner,name,includes')
                .eq('owner', uid)
                .limit(200);
            return (data as BrainRow[]) ?? [];
        },
        { filter: ownerFilter, idKey: 'id' },
    );

    const { rows: files, loading: lf } = useRealtimeRows<MemoryFileRow>(
        'brain_memory_files',
        async () => {
            if (!uid) return [];
            const sb = createClient();
            const { data } = await sb
                .from('brain_memory_files')
                .select('id,owner,brain_id,name')
                .eq('owner', uid)
                .limit(600);
            return (data as MemoryFileRow[]) ?? [];
        },
        { filter: ownerFilter, idKey: 'id' },
    );

    const { rows: memories, loading: lm } = useRealtimeRows<MemoryRow>(
        'memories',
        async () => {
            if (!uid) return [];
            const sb = createClient();
            const { data } = await sb
                .from('memories')
                .select('id,owner,name,vault_id')
                .eq('owner', uid)
                .limit(400);
            return (data as MemoryRow[]) ?? [];
        },
        { filter: ownerFilter, idKey: 'id' },
    );

    const { rows: vaults, loading: lv } = useRealtimeRows<VaultRow>(
        'vaults',
        async () => {
            if (!uid) return [];
            const sb = createClient();
            const { data } = await sb
                .from('vaults')
                .select('id,owner,name')
                .eq('owner', uid)
                .limit(200);
            return (data as VaultRow[]) ?? [];
        },
        { filter: ownerFilter, idKey: 'id' },
    );

    const { rows: canvases, loading: lc } = useRealtimeRows<CanvasRow>(
        'canvases',
        async () => {
            if (!uid) return [];
            const sb = createClient();
            const { data } = await sb
                .from('canvases')
                .select('id,owner,title')
                .eq('owner', uid)
                .limit(200);
            return (data as CanvasRow[]) ?? [];
        },
        { filter: ownerFilter, idKey: 'id' },
    );

    const { rows: pages, loading: lp } = useRealtimeRows<EntityRow>(
        'os_pages',
        async () => {
            if (!uid) return [];
            const sb = createClient();
            const { data } = await sb
                .from('os_pages')
                .select('id,slug,name,accent')
                .eq('owner_id', uid)
                .limit(200);
            return (data as EntityRow[]) ?? [];
        },
        { filter: ownerIdFilter, idKey: 'id' },
    );

    const { rows: groups, loading: lg } = useRealtimeRows<EntityRow>(
        'os_groups',
        async () => {
            if (!uid) return [];
            const sb = createClient();
            const { data } = await sb
                .from('os_groups')
                .select('id,slug,name,accent')
                .eq('owner_id', uid)
                .limit(200);
            return (data as EntityRow[]) ?? [];
        },
        { filter: ownerIdFilter, idKey: 'id' },
    );

    const { rows: events, loading: le } = useRealtimeRows<EntityRow>(
        'os_events',
        async () => {
            if (!uid) return [];
            const sb = createClient();
            const { data } = await sb
                .from('os_events')
                .select('id,slug,title,accent')
                .eq('owner_id', uid)
                .limit(200);
            return (data as EntityRow[]) ?? [];
        },
        { filter: ownerIdFilter, idKey: 'id' },
    );

    const loading = !authReady || lb || lf || lm || lv || lc || lp || lg || le;

    const graph = useMemo(
        () =>
            buildGraph(
                brains,
                files,
                memories,
                vaults,
                canvases,
                pages,
                groups,
                events,
                show,
            ),
        [brains, files, memories, vaults, canvases, pages, groups, events, show],
    );

    useEffect(() => {
        if (!ctx || graph.nodes.length === 0) return;
        const raw = String(ctx).trim();
        let match = graph.nodes.find((n) => n.id === raw);
        if (!match) match = graph.nodes.find((n) => n.refId === raw);
        if (!match) {
            const low = raw.toLowerCase();
            match = graph.nodes.find((n) => n.label.toLowerCase().includes(low));
        }
        if (match) setFocusedNode(match.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx, graph.nodes.length]);

    const navigate = useCallback(
        (path: string) => {
            setActiveArea(path);
            try {
                router.push(path);
            } catch {
                /* noop */
            }
        },
        [router],
    );

    const openNode = useCallback(
        (node: XRNode) => {
            setFocusedNode(node.id);
            if (node.href) {
                navigate(node.href);
            }
        },
        [navigate],
    );

    const groupByType = useCallback(() => {
        setShow((prev) => {
            const anyHidden = ALL_KINDS.some((k) => !prev[k] && (graph.counts[k] ?? 0) > 0);
            const next = {} as Record<XRNodeKind, boolean>;
            for (const k of ALL_KINDS) next[k] = anyHidden ? (graph.counts[k] ?? 0) > 0 : prev[k];
            return next;
        });
        setFocusedNode(null);
    }, [graph.counts]);

    const resetFocus = useCallback(() => {
        setFocusedNode(null);
        setTourActive(false);
    }, []);

    const tourTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const tourIdx = useRef(0);
    const toggleTour = useCallback(() => {
        if (tourActive) {
            setTourActive(false);
            if (tourTimer.current) clearInterval(tourTimer.current);
            tourTimer.current = null;
            return;
        }
        const visible = graph.nodes.filter((n) => show[n.kind]);
        if (visible.length === 0) return;
        const order = [...visible].sort(
            (a, b) => (a.kind === 'brain' ? -1 : 0) - (b.kind === 'brain' ? -1 : 0),
        );
        tourIdx.current = 0;
        setTourActive(true);
        setFocusedNode(order[0].id);
        if (aurora?.enabled) {
            try {
                aurora.speak(`Recorrido por tu red: ${order.length} nodos. Empezamos por ${order[0].label}.`);
            } catch {
                /* noop */
            }
        }
        tourTimer.current = setInterval(() => {
            tourIdx.current = (tourIdx.current + 1) % order.length;
            setFocusedNode(order[tourIdx.current].id);
        }, 3200);
    }, [tourActive, graph.nodes, show, aurora]);

    useEffect(() => {
        return () => {
            if (tourTimer.current) clearInterval(tourTimer.current);
        };
    }, []);

    const toggleKind = useCallback((k: XRNodeKind) => {
        setShow((p) => ({ ...p, [k]: !p[k] }));
    }, []);
    const allKinds = useCallback((v: boolean) => {
        setShow({
            brain: v,
            file: v,
            memory: v,
            vault: v,
            canvas: v,
            page: v,
            group: v,
            event: v,
        });
    }, []);

    const noData = authReady && !loading && graph.nodes.length === 0;
    const noXR = xr && xr.vrSupported === false && xr.arSupported === false;

    return (
        <div className="relative h-full w-full overflow-hidden bg-[#05060f]">
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{ position: [0, 4, 18], fov: 55 }}
                gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
                onCreated={({ gl }) => {
                    gl.toneMapping = THREE.ACESFilmicToneMapping;
                    gl.toneMappingExposure = 1.05;
                }}
            >
                <Suspense fallback={null}>
                    <Scene
                        graph={graph}
                        show={show}
                        reduced={reduced}
                        focusedNode={focusedNode}
                        onFocusPos={setFocusPos}
                        onOpenNode={openNode}
                        onXRState={setXr}
                        onNavigate={navigate}
                        controlsRef={controlsRef}
                    />
                </Suspense>
            </Canvas>

            <SpatialMenu
                show={show}
                counts={graph.counts}
                onToggleKind={toggleKind}
                onAllKinds={allKinds}
                onNavigate={navigate}
                activeArea={activeArea}
            />

            <SkillsBar
                onTour={toggleTour}
                onGroupByType={groupByType}
                onResetFocus={resetFocus}
                tourActive={tourActive}
                nodeCount={graph.nodes.length}
            />

            <XRControls xr={xr} />

            <div className="pointer-events-none absolute bottom-[4.6rem] left-1/2 z-10 -translate-x-1/2 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                arrastra para orbitar · rueda para zoom · toca un nodo para enfocarlo y abrirlo
            </div>

            {loading && (
                <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-[#05060f]/60">
                    <div className="flex flex-col items-center gap-2 text-white/70">
                        <Loader2 className="size-7 animate-spin text-violet-400" />
                        <p className="text-sm font-semibold">Cargando tu red…</p>
                    </div>
                </div>
            )}

            {noData && (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-6 text-center">
                    <p className="text-sm font-semibold text-white/70">
                        {uid
                            ? 'Aún no hay nodos en tu red. Crea cerebros, memorias o pizarras para verlos aquí en 3D.'
                            : 'Inicia sesión para ver tu red real en 3D. Mientras tanto puedes explorar el espacio.'}
                    </p>
                </div>
            )}

            {noXR && (
                <div className="pointer-events-none absolute right-4 top-16 z-10 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-[11px] font-semibold text-white/65 backdrop-blur">
                    VR/AR no disponible en este dispositivo · explora en 3D
                </div>
            )}
        </div>
    );
}

export default XRNetworkHub;
