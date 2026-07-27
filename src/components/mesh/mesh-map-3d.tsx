"use client";

/**
 * MeshMap3D — MAPA 3D de la malla (Adenda 98 · página Red Mesh).
 * ============================================================================
 * Ubica cada neurona/nodo activo en un espacio 3D navegable (React Three
 * Fiber + OrbitControls):
 *
 *   · Nodos CON GPS (el radio comparte posición) → posición REAL relativa al
 *     nodo local (proyección local en metros).
 *   · Nodos SIN GPS → posición ESTIMADA POR RADIOFRECUENCIA: la distancia se
 *     deriva del SNR (modelo log-distancia de antennas.ts) y el ángulo es
 *     determinista por número de nodo — un anillo honesto etiquetado como
 *     "estimado por RF", no una ubicación exacta.
 *   · Neuronas FEDERADAS (tus otras neuronas, vía Supabase) → órbita exterior
 *     con sus propios vecinos como satélites.
 *
 * Colores: verde = enlace fuerte (SNR alto) · ámbar = débil · azul = tú ·
 * violeta = neuronas federadas. Las aristas al nodo local se tiñen por SNR.
 * Todo respeta prefers-reduced-motion (sin órbitas animadas si está activo).
 */

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { estimateDistanceMeters, useMeshState, type MeshNodeInfo, type RemoteTopology } from "@/ai/astraura/mesh";

/* ── Posicionamiento ───────────────────────────────────────────────────────── */

/** Escala: metros reales → unidades de escena (log para que quepan km). */
function sceneRadius(meters: number): number {
  return 1.2 + Math.log10(Math.max(10, meters)) * 2.2; // 100 m→5.6 · 1 km→7.8 · 5 km→9.3
}

/** Ángulo determinista por número de nodo (sin Math.random: estable entre frames). */
function angleFor(num: number): number {
  let h = num >>> 0;
  h = (h ^ (h >> 16)) * 0x45d9f3b;
  h = (h ^ (h >> 16)) >>> 0;
  return (h % 3600) * (Math.PI / 1800);
}

interface PlacedNode {
  node: MeshNodeInfo;
  pos: [number, number, number];
  /** true = posición GPS real; false = estimada por RF (SNR). */
  gps: boolean;
  distanceM: number;
}

function placeNodes(nodes: MeshNodeInfo[], self: MeshNodeInfo | undefined): PlacedNode[] {
  const lat0 = self?.lat;
  const lon0 = self?.lon;
  return nodes
    .filter((n) => !n.isSelf)
    .map((n) => {
      // GPS real (relativo al nodo local) cuando AMBOS tienen posición.
      if (
        typeof n.lat === "number" && typeof n.lon === "number" &&
        typeof lat0 === "number" && typeof lon0 === "number"
      ) {
        const dx = (n.lon - lon0) * 111_320 * Math.cos((lat0 * Math.PI) / 180);
        const dz = (n.lat - lat0) * 110_540;
        const meters = Math.max(10, Math.hypot(dx, dz));
        const r = sceneRadius(meters);
        const ang = Math.atan2(dz, dx);
        return {
          node: n,
          pos: [Math.cos(ang) * r, 0.15, Math.sin(ang) * r] as [number, number, number],
          gps: true,
          distanceM: Math.round(meters),
        };
      }
      // Estimación por RF: distancia del SNR + ángulo determinista.
      const meters = estimateDistanceMeters(n.snr);
      const r = sceneRadius(meters);
      const ang = angleFor(n.num);
      const y = 0.15 + Math.min(2, (n.hopsAway ?? 0) * 0.7); // saltos = altura
      return {
        node: n,
        pos: [Math.cos(ang) * r, y, Math.sin(ang) * r] as [number, number, number],
        gps: false,
        distanceM: meters,
      };
    });
}

function snrColor(snr: number | undefined): string {
  if (typeof snr !== "number") return "#8b8b9e";
  if (snr >= 5) return "#34d399"; // esmeralda: fuerte
  if (snr >= -5) return "#fbbf24"; // ámbar: medio
  return "#fb7185"; // rosa: débil
}

/* ── Piezas 3D ─────────────────────────────────────────────────────────────── */

/** ¿El usuario pidió movimiento reducido? (SSR-safe). */
function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

function SelfNode() {
  const ref = useRef<THREE.Mesh>(null);
  // Respeta prefers-reduced-motion: sin latido si el usuario lo pidió (a11y
  // vestibular). El hook useFrame siempre se registra (regla de hooks), pero no
  // hace nada cuando reduced-motion está activo.
  const reduced = useRef(prefersReducedMotion());
  useFrame(({ clock }) => {
    if (!ref.current || reduced.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 2) * 0.06; // latido sutil
    ref.current.scale.setScalar(s);
  });
  return (
    <group>
      <mesh ref={ref}>
        <sphereGeometry args={[0.45, 24, 24]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.7} />
      </mesh>
      <Html center distanceFactor={14}>
        <div className="pointer-events-none whitespace-nowrap rounded-full border border-sky-400/40 bg-black/70 px-2 py-0.5 text-[10px] text-sky-100">
          Esta neurona
        </div>
      </Html>
    </group>
  );
}

function PeerNode({ placed }: { placed: PlacedNode }) {
  const { node, pos, gps, distanceM } = placed;
  const color = snrColor(node.snr);
  const dim = node.presence !== "online";
  const km = distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${distanceM} m`;
  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[0.3, 18, 18]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={dim ? 0.1 : 0.5}
          transparent
          opacity={dim ? 0.35 : 1}
        />
      </mesh>
      <Html center distanceFactor={16}>
        <div className="pointer-events-none whitespace-nowrap rounded-lg border border-white/15 bg-black/75 px-2 py-1 text-center text-[10px] leading-tight text-white/85">
          <span className="block font-medium">
            {node.shortName || node.longName || `!${node.num.toString(16)}`}
          </span>
          <span className="block text-white/45">
            {typeof node.snr === "number" ? `${node.snr.toFixed(1)} dB · ` : ""}
            {km} {gps ? "(GPS)" : "(est. RF)"}
          </span>
        </div>
      </Html>
    </group>
  );
}

function RemoteCluster({ remote, index, total }: { remote: RemoteTopology; index: number; total: number }) {
  const ang = (index / Math.max(1, total)) * Math.PI * 2 + 0.7;
  const R = 13; // órbita exterior de neuronas federadas
  const pos: [number, number, number] = [Math.cos(ang) * R, 1.6, Math.sin(ang) * R];
  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[0.38, 20, 20]} />
        <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={0.55} />
      </mesh>
      {/* Satélites: los vecinos que ESA neurona ve. */}
      {(remote.snapshot.nodes ?? []).slice(0, 8).map((n, i) => {
        const a = angleFor(n.num) + i * 0.35;
        const r = 1.1 + (i % 3) * 0.4;
        return (
          <mesh key={n.num} position={[Math.cos(a) * r, 0.2 * (i % 2 ? 1 : -1), Math.sin(a) * r]}>
            <sphereGeometry args={[0.12, 10, 10]} />
            <meshStandardMaterial color="#d8b4fe" transparent opacity={0.8} />
          </mesh>
        );
      })}
      <Html center distanceFactor={18}>
        <div className="pointer-events-none whitespace-nowrap rounded-lg border border-violet-400/30 bg-black/75 px-2 py-1 text-center text-[10px] leading-tight text-violet-100">
          <span className="block font-medium">{remote.label}</span>
          <span className="block text-white/45">
            {remote.onlineCount} nodos · {remote.snapshot.region ?? "?"} (federada)
          </span>
        </div>
      </Html>
    </group>
  );
}

function RangeRings() {
  // Anillos de referencia: 100 m · 1 km · 5 km (misma escala log que los nodos).
  const rings = [100, 1000, 5000];
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {rings.map((m) => (
        <mesh key={m}>
          <ringGeometry args={[sceneRadius(m) - 0.015, sceneRadius(m) + 0.015, 96]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.12} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function Scene() {
  const state = useMeshState();
  const placed = useMemo(() => placeNodes(state.nodes, state.self), [state.nodes, state.self]);
  const remotes = state.remoteTopologies ?? [];
  return (
    <>
      <ambientLight intensity={0.55} />
      <pointLight position={[8, 10, 6]} intensity={90} />
      <RangeRings />
      <SelfNode />
      {placed.map((p) => (
        <group key={p.node.num}>
          <PeerNode placed={p} />
          <Line
            points={[[0, 0, 0], p.pos]}
            color={snrColor(p.node.snr)}
            transparent
            opacity={p.node.presence === "online" ? 0.5 : 0.15}
            lineWidth={1}
          />
        </group>
      ))}
      {remotes.map((r, i) => (
        <RemoteCluster key={r.deviceId} remote={r} index={i} total={remotes.length} />
      ))}
      <OrbitControls enablePan={false} minDistance={4} maxDistance={40} makeDefault />
    </>
  );
}

/* ── Componente público ────────────────────────────────────────────────────── */

export function MeshMap3D({ className }: { className?: string }) {
  const state = useMeshState();
  const online = state.nodes.filter((n) => !n.isSelf && n.presence === "online").length;
  const connected = state.status === "ready" || state.status === "degraded";
  return (
    <div className={className}>
      <div className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40">
        <Canvas camera={{ position: [0, 9, 14], fov: 50 }} dpr={[1, 1.75]}>
          <Scene />
        </Canvas>
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 text-[11px] text-white/70">
          {connected
            ? `${online} nodos al alcance · anillos: 100 m / 1 km / 5 km`
            : "Sin radio: conecta la malla (o el simulador) para ver el mapa vivo"}
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2 text-[10px] text-white/55">
          <span className="rounded-full border border-sky-400/30 bg-black/60 px-2 py-0.5">azul = tú</span>
          <span className="rounded-full border border-emerald-400/30 bg-black/60 px-2 py-0.5">verde = enlace fuerte</span>
          <span className="rounded-full border border-amber-400/30 bg-black/60 px-2 py-0.5">ámbar = medio</span>
          <span className="rounded-full border border-violet-400/30 bg-black/60 px-2 py-0.5">violeta = tus otras neuronas</span>
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 text-[10px] text-white/50">
          GPS real cuando el nodo lo comparte · resto: distancia estimada por RF (SNR)
        </div>
      </div>
    </div>
  );
}

export default MeshMap3D;
