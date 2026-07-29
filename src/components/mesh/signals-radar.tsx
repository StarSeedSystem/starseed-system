"use client";

/**
 * SignalsRadar — RADAR DE SEÑALES (Adenda 99b).
 * ============================================================================
 * El MISMO radar de los nodos REALES de la malla, en 2D: cada neurona activa
 * ubicada por su señal — distancia derivada del SNR (modelo log-distancia de
 * antennas.ts) o por GPS real cuando el nodo comparte posición — con ONDAS que
 * emanan de cada nodo (los "rebotes de frecuencia" que mapean el área). Es la
 * versión plana del mapa 3D de /red-mesh, para el hub y el widget.
 *
 * Honestidad radical: la DISTANCIA es real (RF o GPS); la DIRECCIÓN es real solo
 * con GPS compartido — sin él, el ángulo es determinista y estable (no una
 * ubicación exacta), y así se etiqueta. SSR-safe. Nunca lanza.
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { estimateDistanceMeters, useMeshState, type MeshNodeInfo } from "@/ai/astraura/mesh";

/** Distancia (m) → fracción de radio del radar (log: 30 m→0.16 · 6 km→0.92). */
function radiusFrac(m: number): number {
  const lo = Math.log10(30), hi = Math.log10(6000);
  const f = (Math.log10(Math.max(30, Math.min(6000, m))) - lo) / (hi - lo);
  return 0.16 + f * 0.76;
}

/** Ángulo determinista y estable por número de nodo (sin Math.random). */
function angleFor(num: number): number {
  let h = num >>> 0;
  h = (h ^ (h >> 16)) * 0x45d9f3b;
  h = (h ^ (h >> 16)) >>> 0;
  return (h % 3600) * (Math.PI / 1800);
}

function snrColor(snr: number | undefined): string {
  if (typeof snr !== "number") return "#8b8b9e";
  if (snr >= 5) return "#34d399";
  if (snr >= -5) return "#fbbf24";
  return "#fb7185";
}

interface Placed {
  node: MeshNodeInfo;
  x: number; y: number;
  gps: boolean;
  distanceM: number;
}

/** Guard: número FINITO (typeof NaN === "number" colaría; esto lo excluye y narra). */
function fin(v: number | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function place(nodes: MeshNodeInfo[], self: MeshNodeInfo | undefined, cx: number, cy: number, R: number): Placed[] {
  const lat0 = self?.lat, lon0 = self?.lon;
  return nodes.filter((n) => !n.isSelf).map((n) => {
    // Guard FINITO (typeof NaN === "number" colaría lat/lon NaN → coordenadas SVG
    // NaN). Con GPS finito de ambos, posición real; si no, estimación por RF.
    if (fin(n.lat) && fin(n.lon) && fin(lat0) && fin(lon0)) {
      const dx = (n.lon - lon0) * 111_320 * Math.cos((lat0 * Math.PI) / 180);
      const dz = (n.lat - lat0) * 110_540;
      const meters = Math.max(10, Math.hypot(dx, dz));
      const rf = radiusFrac(meters) * R;
      const ang = Math.atan2(dz, dx);
      return { node: n, x: cx + Math.cos(ang) * rf, y: cy + Math.sin(ang) * rf, gps: true, distanceM: Math.round(meters) };
    }
    const meters = estimateDistanceMeters(n.snr);
    const rf = radiusFrac(meters) * R;
    const ang = angleFor(n.num);
    return { node: n, x: cx + Math.cos(ang) * rf, y: cy + Math.sin(ang) * rf, gps: false, distanceM: meters };
  });
}

const RINGS: { m: number; label: string }[] = [
  { m: 100, label: "100 m" },
  { m: 1000, label: "1 km" },
  { m: 5000, label: "5 km" },
];

export interface SignalsRadarProps {
  /** Alto del SVG en px. */
  height?: number;
  compact?: boolean;
  showLegend?: boolean;
  className?: string;
}

export function SignalsRadar({ height = 180, compact = false, showLegend = true, className }: SignalsRadarProps) {
  const mesh = useMeshState();
  const [sel, setSel] = useState<number | null>(null);
  const cx = 50, cy = 50, R = 45;

  const online = useMemo(() => mesh.nodes.filter((n) => !n.isSelf && n.presence === "online"), [mesh.nodes]);
  const placed = useMemo(() => place(online, mesh.self, cx, cy, R), [online, mesh.self]);
  const remotes = mesh.remoteTopologies ?? [];
  const connected = mesh.status === "ready" || mesh.status === "degraded";
  const selected = placed.find((p) => p.node.num === sel) ?? null;

  return (
    <div className={cn("relative", className)}>
      <svg viewBox="0 0 100 100" style={{ height }} className="w-full">
        <defs>
          <radialGradient id="ss-radar-fade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.10" />
            <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R} fill="url(#ss-radar-fade)" />

        {/* Anillos de alcance reales (100 m / 1 km / 5 km) */}
        {RINGS.map((ring) => {
          const r = radiusFrac(ring.m) * R;
          return (
            <g key={ring.m}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--border))" strokeOpacity={0.2} strokeWidth={0.4} />
              {!compact && (
                <text x={cx + 1} y={cy - r - 0.6} fontSize={2.6} fill="hsl(var(--muted-foreground))" opacity={0.6}>{ring.label}</text>
              )}
            </g>
          );
        })}
        <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="hsl(var(--border))" strokeOpacity={0.1} strokeWidth={0.3} />
        <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="hsl(var(--border))" strokeOpacity={0.1} strokeWidth={0.3} />

        {/* Barrido giratorio */}
        <g className="ss-radar-beam" style={{ transformOrigin: "50px 50px" }}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - R} stroke="#38bdf8" strokeOpacity={0.45} strokeWidth={0.6} />
        </g>

        {/* Ondas que emite ESTA neurona (rebotes de frecuencia desde el centro) */}
        <circle className="ss-signal-ping" cx={cx} cy={cy} r={4} fill="none" stroke="hsl(var(--primary))" strokeWidth={0.5} />
        <circle className="ss-signal-ping ss-signal-ping-2" cx={cx} cy={cy} r={4} fill="none" stroke="hsl(var(--primary))" strokeWidth={0.5} />

        {/* Nodos reales de la malla + su onda */}
        {placed.map((p) => {
          const color = snrColor(p.node.snr);
          const isSel = sel === p.node.num;
          return (
            <g key={p.node.num}>
              <circle className="ss-signal-ping" cx={p.x} cy={p.y} r={2} fill="none" stroke={color} strokeWidth={0.4} strokeOpacity={0.6} />
              {isSel && <circle cx={p.x} cy={p.y} r={4} fill="none" stroke={color} strokeWidth={0.6} strokeOpacity={0.8} />}
              <circle cx={p.x} cy={p.y} r={2.2} fill={color} className="cursor-pointer"
                onClick={() => setSel((s) => (s === p.node.num ? null : p.node.num))}
                style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
            </g>
          );
        })}

        {/* Neuronas federadas (tus otras neuronas) en la órbita exterior */}
        {remotes.map((r, i) => {
          const a = (i / Math.max(1, remotes.length)) * Math.PI * 2 + 0.6;
          const x = cx + Math.cos(a) * (R * 0.98), y = cy + Math.sin(a) * (R * 0.98);
          return <circle key={r.deviceId} cx={x} cy={y} r={1.8} fill="#c084fc" style={{ filter: "drop-shadow(0 0 2px #c084fc)" }} />;
        })}

        {/* Yo (centro) */}
        <circle cx={cx} cy={cy} r={3} fill="hsl(var(--primary))" style={{ filter: "drop-shadow(0 0 3px hsl(var(--primary)))" }} />
      </svg>

      {/* Sin radio: mensaje honesto encima */}
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] text-muted-foreground/60 text-center px-4">
            Sin radio: conecta la malla para ver las señales reales
          </span>
        </div>
      )}
      {connected && placed.length === 0 && (
        <div className="absolute inset-x-0 bottom-1 flex items-center justify-center pointer-events-none">
          <span className="text-[9px] text-muted-foreground/50">Malla lista · sin vecinos a la vista todavía</span>
        </div>
      )}

      {/* Detalle del nodo seleccionado */}
      {selected && !compact && (
        <div className="mt-1 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-2.5 py-1.5 text-[10px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-black truncate">
              {selected.node.shortName || selected.node.longName || `!${selected.node.num.toString(16)}`}
            </span>
            <span className="tabular-nums text-muted-foreground/70">
              {typeof selected.node.snr === "number" ? `${selected.node.snr.toFixed(1)} dB · ` : ""}
              {selected.distanceM >= 1000 ? `${(selected.distanceM / 1000).toFixed(1)} km` : `${selected.distanceM} m`}
              {selected.gps ? " (GPS)" : " (est. RF)"}
            </span>
          </div>
        </div>
      )}

      {showLegend && !compact && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground/55">
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: "hsl(var(--primary))" }} /> tú</span>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-400" /> fuerte</span>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-400" /> medio</span>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-rose-400" /> débil</span>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-violet-400" /> otras neuronas</span>
          <span className="ml-auto">dist. real por RF/GPS · dirección ilustrativa sin GPS</span>
        </div>
      )}
    </div>
  );
}

export default SignalsRadar;
