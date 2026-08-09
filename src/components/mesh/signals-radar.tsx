"use client";

/**
 * SignalsRadar — RADAR DE SEÑALES REALES (Adenda 99b · ampliado en la 150).
 * ============================================================================
 * Un solo radar con TODO lo que esta neurona percibe de verdad, venga de la
 * antena que venga:
 *
 *   · Nodos LoRa/Meshtastic del radio conectado (SNR/RSSI/GPS/saltos/batería).
 *   · Faros de la red sináptica (neuronas StarSeed vía relé).
 *   · Neuronas registradas de tu cuenta + topologías federadas.
 *   · La portadora IP medida (router Wi-Fi/Ethernet/datos).
 *   · Dispositivos Bluetooth LE oídos en un escaneo con gesto (RSSI real).
 *   · Puertos serie USB ya autorizados.
 *
 * HONESTIDAD RADICAL en la colocación — cada señal lleva su ANILLO DE PRECISIÓN:
 *   · GPS de ambos extremos  → rumbo y distancia reales, anillo PEQUEÑO.
 *   · Solo RF (SNR/RSSI)     → distancia real por modelo log-distancia, rumbo
 *                              DESCONOCIDO ⇒ va al sector de su antena y el
 *                              anillo crece con el error del modelo.
 *   · Ni posición ni RF      → sector de su antena, distancia derivada SOLO de
 *                              la calidad, y anillo GRANDE (máxima duda).
 * Determinista: el ángulo sin GPS sale de un hash del id, jamás de Math.random.
 * SSR-safe. Nunca lanza. Las animaciones degradan con prefers-reduced-motion.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useMeshState, detectSignals, subscribeConnectivity, type SignalSource, type SignalKind } from "@/ai/astraura/mesh";
import { ANTENNA_SECTOR, type AntennaKind, type DetectedSignal } from "@/ai/astraura/mesh/signals";
import { useDetectedSignals } from "./use-detected-signals";
import { SignalDetailCard } from "./signal-detail";

const rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * ROSA DE ANTENAS (Adenda 150): cada familia de antena ocupa su propio sector
 * del radar, y las antenas LOCALES de esta neurona se alinean con el sector al
 * que pertenecen — así el radar se lee como un mapa del espectro y no como una
 * nube de puntos. Los sectores de las señales detectadas viven en signals.ts
 * (ANTENNA_SECTOR) para que la colocación sea la MISMA en todas las superficies.
 */
const KIND_ANGLE: Record<SignalKind, number> = {
  mesh: rad(-90),      // sector "lora"
  serial: rad(-45),    // sector "serial"
  bluetooth: rad(0),   // sector "ble"
  wifi: rad(33),       // sector "ip"
  cellular: rad(57),   // sector "ip"
  gps: rad(180),       // eje de posición (sin señales detectadas propias)
  nfc: rad(-147),      // eje de proximidad
  telephony: rad(-123),
};
const KIND_COLOR: Record<SignalKind, string> = {
  mesh: "#34d399",
  wifi: "#38bdf8",
  cellular: "#a78bfa",
  bluetooth: "#60a5fa",
  gps: "#f59e0b",
  telephony: "#f472b6",
  nfc: "#22d3ee",
  serial: "#94a3b8",
};

/** Distancia (m) → fracción de radio del radar (log: 30 m→0,16 · 6 km→0,92). */
function radiusFrac(m: number): number {
  const lo = Math.log10(30), hi = Math.log10(6000);
  const f = (Math.log10(Math.max(30, Math.min(6000, m))) - lo) / (hi - lo);
  return 0.16 + f * 0.76;
}

/** Color por CALIDAD (la leyenda histórica fuerte/medio/débil, ahora 0..1). */
function qualityColor(q: number | null): string {
  if (q == null) return "#8b8b9e";
  if (q >= 0.62) return "#34d399";
  if (q >= 0.34) return "#fbbf24";
  return "#fb7185";
}

const RINGS: { m: number; label: string }[] = [
  { m: 100, label: "100 m" },
  { m: 1000, label: "1 km" },
  { m: 5000, label: "5 km" },
];

/** Cuña SVG del sector de una antena (para leer el radar como rosa de antenas). */
function wedgePath(cx: number, cy: number, R: number, center: number, half: number): string {
  const a0 = center - half, a1 = center + half;
  const x0 = cx + Math.cos(a0) * R, y0 = cy + Math.sin(a0) * R;
  const x1 = cx + Math.cos(a1) * R, y1 = cy + Math.sin(a1) * R;
  const large = half > Math.PI / 2 ? 1 : 0;
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

/** Etiqueta corta del sector (cabe en el borde del radar). */
const SECTOR_SHORT: Record<AntennaKind, string> = {
  lora: "LoRa",
  serial: "USB",
  ble: "BLE",
  ip: "IP",
  relay: "relé",
  account: "cuenta",
};

interface Plotted {
  sig: DetectedSignal;
  x: number; y: number;
  /** Radio del halo de precisión en unidades del viewBox. */
  halo: number;
}

export interface SignalsRadarProps {
  /** Alto del SVG en px. */
  height?: number;
  compact?: boolean;
  showLegend?: boolean;
  className?: string;
  /** Señales-antena de ESTA neurona (opcional). Si no se pasan, se autodetectan. */
  signals?: SignalSource[];
  /**
   * Mostrar la FICHA completa al pulsar un blip. Por defecto activa fuera del
   * modo compacto (en el widget del escritorio no cabe).
   */
  showDetail?: boolean;
  /** Abrir la Red Mesh desde la ficha (pestaña o navegación del contenedor). */
  onOpenMesh?: () => void;
  /**
   * Consultar el registro de neuronas de la cuenta (única fuente que sale a la
   * red). Por defecto se apaga en modo compacto.
   */
  accountRegistry?: boolean;
}

export function SignalsRadar({
  height = 180, compact = false, showLegend = true, className, signals,
  showDetail, onOpenMesh, accountRegistry,
}: SignalsRadarProps) {
  const mesh = useMeshState();
  const [sel, setSel] = useState<string | null>(null);
  const cx = 50, cy = 50, R = 45;
  const withDetail = showDetail ?? !compact;

  const detected = useDetectedSignals({ accountRegistry: accountRegistry ?? !compact });
  const connected = mesh.status === "ready" || mesh.status === "degraded";

  /* Colocación: polar (del agregador, determinista) → cartesiano del viewBox. */
  const plotted = useMemo<Plotted[]>(
    () =>
      detected.signals.map((sig) => {
        const p = sig.placement;
        const r = Math.max(0.1, Math.min(0.97, p.radiusFrac)) * R;
        return {
          sig,
          x: cx + Math.cos(p.angleRad) * r,
          y: cy + Math.sin(p.angleRad) * r,
          halo: Math.max(1.2, Math.min(28, p.accuracyFrac * R)),
        };
      }),
    [detected.signals],
  );

  const selected = plotted.find((p) => p.sig.id === sel) ?? null;
  useEffect(() => {
    // Si la señal seleccionada desaparece (nodo caído, escaneo detenido), suelta
    // la selección en vez de dejar una ficha huérfana.
    if (sel && !detected.signals.some((s) => s.id === sel)) setSel(null);
  }, [sel, detected.signals]);

  /* Antenas LOCALES de esta neurona (lo que ESTA neurona puede emitir/recibir). */
  const [selfSignals, setSelfSignals] = useState<SignalSource[]>([]);
  const meshRef = useRef(mesh);
  meshRef.current = mesh;
  const onlineCount = useMemo(
    () => mesh.nodes.filter((n) => !n.isSelf && n.presence === "online").length,
    [mesh.nodes],
  );
  useEffect(() => {
    if (signals) return; // controladas por el padre
    let alive = true;
    const seq = { n: 0 };
    const run = () => {
      const my = ++seq.n;
      void detectSignals(meshRef.current).then((r) => {
        if (alive && my === seq.n) setSelfSignals(r);
      });
    };
    run();
    const off = subscribeConnectivity(run);
    return () => { alive = false; off(); };
  }, [signals, mesh.status, mesh.region, onlineCount]);

  const sigs = signals ?? selfSignals;
  // Solo antenas reales (con soporte); "unsupported" no se dibuja.
  const activeSigs = useMemo(
    () => sigs.filter((s) => s.status === "active" || s.status === "available" || s.status === "info"),
    [sigs],
  );

  /* Sectores con al menos una señal detectada (los demás no se sombrean). */
  const liveSectors = useMemo(() => {
    const set = new Set<AntennaKind>();
    for (const s of detected.signals) set.add(s.antenna);
    return [...set];
  }, [detected.signals]);

  const gpsCount = detected.signals.filter((s) => s.placement.mode === "gps").length;

  return (
    <div className={cn("relative", className)}>
      <svg viewBox="0 0 100 100" style={{ height }} className="w-full" role="group"
        aria-label={`Radar de señales: ${detected.signals.length} señal(es) detectada(s)`}>
        <defs>
          <radialGradient id="ss-radar-fade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.10" />
            <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          {/* Los halos de incertidumbre grandes se recortan al disco del radar:
              la duda se ve, pero no se derrama fuera del instrumento. */}
          <clipPath id="ss-radar-clip">
            <circle cx={cx} cy={cy} r={R} />
          </clipPath>
        </defs>
        <circle cx={cx} cy={cy} r={R} fill="url(#ss-radar-fade)" />

        {/* Sectores por familia de antena (solo los que tienen señales) */}
        {liveSectors.map((k) => {
          const s = ANTENNA_SECTOR[k];
          const lx = cx + Math.cos(s.center) * (R + 3.2);
          const ly = cy + Math.sin(s.center) * (R + 3.2);
          const anchor = Math.cos(s.center) > 0.3 ? "start" : Math.cos(s.center) < -0.3 ? "end" : "middle";
          return (
            <g key={`sector-${k}`}>
              <path d={wedgePath(cx, cy, R, s.center, s.half)} fill="hsl(var(--primary))" fillOpacity={0.028} />
              {!compact && (
                <text x={lx} y={ly + 0.8} fontSize={2.4} textAnchor={anchor}
                  fill="hsl(var(--muted-foreground))" opacity={0.5}>
                  {SECTOR_SHORT[k]}
                </text>
              )}
            </g>
          );
        })}

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

        {/* ANILLOS DE PRECISIÓN: el halo dice cuánto NO sabemos de esa posición.
            GPS ⇒ casi un punto · RF ⇒ anillo medio · sin posición ⇒ anillo enorme. */}
        <g clipPath="url(#ss-radar-clip)">
        {plotted.map((p) => (
          <circle
            key={`halo-${p.sig.id}`}
            cx={p.x} cy={p.y} r={p.halo}
            fill={p.sig.color}
            fillOpacity={p.sig.placement.mode === "gps" ? 0.1 : 0.045}
            stroke={p.sig.color}
            strokeOpacity={sel === p.sig.id ? 0.65 : 0.28}
            strokeWidth={0.35}
            strokeDasharray={p.sig.placement.mode === "gps" ? undefined : "1.2 1.2"}
          />
        ))}
        </g>

        {/* Blips: cada señal detectada, real, pulsable */}
        {plotted.map((p) => {
          const q = p.sig.quality;
          const dot = qualityColor(q);
          const isSel = sel === p.sig.id;
          const r = 1.5 + (q == null ? 0.3 : q * 1.2);
          return (
            <g
              key={p.sig.id}
              role="button"
              tabIndex={0}
              aria-label={`${p.sig.label} · ${p.sig.antennaLabel} · calidad ${q == null ? "no medible" : `${Math.round(q * 100)} de 100`}`}
              className="cursor-pointer"
              onClick={() => setSel((s) => (s === p.sig.id ? null : p.sig.id))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSel((s) => (s === p.sig.id ? null : p.sig.id));
                }
              }}
            >
              {/* Área de pulsación cómoda (invisible) */}
              <circle cx={p.x} cy={p.y} r={Math.max(3.2, r + 2)} fill="transparent" />
              {(q ?? 0) > 0.5 && (
                <circle className="ss-signal-ping" cx={p.x} cy={p.y} r={2} fill="none" stroke={dot} strokeWidth={0.4} strokeOpacity={0.55} />
              )}
              {isSel && <circle cx={p.x} cy={p.y} r={r + 2} fill="none" stroke={dot} strokeWidth={0.7} strokeOpacity={0.9} />}
              <circle
                cx={p.x} cy={p.y} r={r}
                fill={dot}
                stroke={p.sig.color}
                strokeWidth={0.45}
                style={{ filter: `drop-shadow(0 0 2px ${dot})` }}
              />
              {p.sig.starseed && (
                // Punto interior = la señal declara cuenta StarSeed verificada.
                <circle cx={p.x} cy={p.y} r={0.55} fill="#ffffff" fillOpacity={0.9} />
              )}
              {!compact && isSel && (
                <text x={p.x} y={p.y - r - 1.4} fontSize={2.4} textAnchor="middle" fill={dot} opacity={0.95}>
                  {p.sig.label.slice(0, 22)}
                </text>
              )}
            </g>
          );
        })}

        {/* Antenas LOCALES de esta neurona, en el eje de su sector (referencia). */}
        {activeSigs.map((s) => {
          const ang = KIND_ANGLE[s.kind];
          const rr = R * (s.status === "active" ? 0.3 : s.status === "available" ? 0.42 : 0.52);
          const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
          const color = KIND_COLOR[s.kind];
          return (
            <g key={`sig-${s.kind}`}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeOpacity={0.16} strokeWidth={0.3} />
              {s.status === "active" && (
                <circle className="ss-signal-ping" cx={x} cy={y} r={1.6} fill="none" stroke={color} strokeWidth={0.35} strokeOpacity={0.5} />
              )}
              <circle cx={x} cy={y} r={1.2} fill={color} fillOpacity={s.status === "info" ? 0.45 : 0.92}
                style={{ filter: `drop-shadow(0 0 1.5px ${color})` }} />
              {!compact && (
                <text x={x} y={y - 2.1} fontSize={2.1} textAnchor="middle" fill={color} opacity={0.7}>{s.kind}</text>
              )}
            </g>
          );
        })}

        {/* Yo (centro) */}
        <circle cx={cx} cy={cy} r={3} fill="hsl(var(--primary))" style={{ filter: "drop-shadow(0 0 3px hsl(var(--primary)))" }} />
      </svg>

      {/* Estado honesto abajo (sin tapar las antenas locales, que siempre existen) */}
      {detected.signals.length === 0 && (
        <div className="absolute inset-x-0 bottom-1 flex items-center justify-center pointer-events-none">
          <span className="text-[9px] text-muted-foreground/55 text-center px-4">
            {connected
              ? "Malla lista · ninguna señal externa detectada todavía"
              : "Sin radio LoRa · se muestran las antenas de esta neurona; conecta la malla o escanea BLE para detectar señales"}
          </span>
        </div>
      )}

      {/* Ficha completa de la señal seleccionada */}
      {selected && withDetail && (
        <SignalDetailCard
          className="mt-2"
          signal={selected.sig}
          onClose={() => setSel(null)}
          onOpenMesh={onOpenMesh}
        />
      )}
      {/* En compacto, una línea honesta con lo esencial (la ficha no cabe) */}
      {selected && !withDetail && (
        <div className="mt-1 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-2.5 py-1.5 text-[10px]">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-black">{selected.sig.label}</span>
            <span className="tabular-nums text-muted-foreground/70">
              {selected.sig.quality == null ? "sin métrica" : `${Math.round(selected.sig.quality * 100)}/100`}
              {selected.sig.placement.distanceM != null
                ? ` · ${selected.sig.placement.distanceM >= 1000 ? `${(selected.sig.placement.distanceM / 1000).toFixed(1)} km` : `${selected.sig.placement.distanceM} m`}`
                : ""}
              {selected.sig.placement.mode === "gps" ? " (GPS)" : selected.sig.placement.mode === "rf" ? " (est. RF)" : " (sin posición)"}
            </span>
          </div>
        </div>
      )}

      {showLegend && !compact && (
        <div className="mt-1.5 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground/60">
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: "hsl(var(--primary))" }} /> tú</span>
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-400" /> señal fuerte</span>
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-400" /> media</span>
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-rose-400" /> débil</span>
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-zinc-500" /> sin métrica</span>
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-white/90" /> con cuenta StarSeed</span>
          </div>
          <p className="text-[9px] leading-snug text-muted-foreground/55">
            <span className="font-semibold text-muted-foreground/75">El anillo alrededor de cada señal es su RANGO DE PRECISIÓN:</span>{" "}
            anillo continuo y pequeño = posición GPS real de ambos extremos ({gpsCount} ahora);
            anillo punteado medio = distancia real por RF con rumbo desconocido (se sitúa en el sector de su antena);
            anillo punteado grande = sin posición, la distancia al centro solo refleja la calidad.
            Cada cuña del borde es una familia de antena. Pulsa cualquier señal para ver su ficha completa.
          </p>
        </div>
      )}
    </div>
  );
}

export default SignalsRadar;
