"use client";

/**
 * AuroraOrb — el núcleo visual del Orbe de Aurora.
 * ----------------------------------------------------------------------------
 * Traslada el diseño del botón del Café StarSeed (.ssx-fab del Exocórtex del
 * portal) al orbe del OS: una ESFERA tipo joya construida por capas:
 *
 *   (a) ARO exterior en conic-gradient (colores aurora del Café + cardinales
 *       Trinity) girando lento — hipnótico, GPU-friendly (CSS animation).
 *   (b) ESFERA-NÚCLEO de cristal oscuro con highlight especular.
 *   (c) CANVAS interior (clip circular) con una AURORA de cintas/ondas suaves
 *       reactiva a la voz: reutiliza la lógica existente de energía/bandas/
 *       latido (AnalyserNode del micrófono + pulsos `aurora:speak` del motor).
 *   (d) ESTRELLA ✦ de 4 puntas NÍTIDA encima, con las puntas en los colores
 *       cardinales exactos (arriba #007FFF Zenith · abajo #DC143C Anchor ·
 *       izquierda #39FF14 Horizon · derecha #FFBF00 Logic) y centro blanco
 *       brillante. Su glow/latido escala con la CSS var --aurora-energy,
 *       actualizada vía requestAnimationFrame SIN re-render de React.
 *   (e) Anillo "ping" (~3.2s) y sombra-glow exterior que respiran (~5.6s).
 *
 * Comportamiento reactivo:
 *   · HABLA  → pulsos `aurora:speak` (onboundary): la estrella late y la
 *     aurora interior emite ondas de color expansivas.
 *   · ESCUCHA → bandas del micrófono desplazan color/intensidad de las cintas
 *     (graves→rojo/verde · agudos→azul/amarillo).
 *   · REPOSO → respiración calmada.
 *
 * Degrada con gracia: sin Web Audio / sin permiso de micro / con
 * `prefers-reduced-motion`, cae a una versión serena (el CSS desactiva
 * giro/ping/respiración y el canvas reduce su movimiento). SSR-safe: nada
 * toca window fuera de efectos.
 */

import { useEffect, useId, useRef } from "react";
import {
  subscribeAuroraSpeak,
  createMicAnalyser,
  type MicAnalyser,
} from "@/lib/aurora/aurora-orb-bus";
import styles from "./aurora-orb.module.css";

type RGB = [number, number, number];

// Colores cardinales de la estrella (Trinity).
const C = {
  up: [0, 127, 255] as RGB,     // Zenith · azul
  down: [220, 20, 60] as RGB,   // Anchor · rojo
  left: [57, 255, 20] as RGB,   // Horizon · verde
  right: [255, 191, 0] as RGB,  // Logic · amarillo
};

// Paleta aurora del Café (mismos hex que el conic-gradient de .ssx-fab).
const CAFE = {
  lime: [159, 232, 112] as RGB,
  teal: [111, 230, 214] as RGB,
  sky: [127, 184, 255] as RGB,
  lavender: [201, 168, 255] as RGB,
  amber: [255, 194, 71] as RGB,
  coral: [255, 138, 92] as RGB,
};

const WHITE: RGB = [255, 255, 255];

/**
 * Cintas aurora del interior del núcleo. Cada cinta pertenece a una familia
 * espectral: con micrófono activo, los GRAVES encienden las cintas rojas y
 * verdes y los AGUDOS las azules y amarillas (los medios, la lavanda).
 */
const RIBBONS: Array<{
  family: "low" | "mid" | "high";
  base: RGB;      // color aurora (Café) en reposo
  cardinal: RGB;  // cardinal Trinity hacia el que se desplaza al excitarse
  yBase: number;  // altura base (fracción del diámetro)
  speed: number;  // velocidad de ondulación
  phase: number;  // desfase inicial
  tilt: number;   // inclinación propia (remolino)
}> = [
  { family: "high", base: CAFE.sky,      cardinal: C.up,    yBase: 0.3,  speed: 0.42, phase: 2.1, tilt: 0.12 },
  { family: "low",  base: CAFE.lime,     cardinal: C.left,  yBase: 0.42, speed: 0.55, phase: 0.0, tilt: -0.16 },
  { family: "mid",  base: CAFE.lavender, cardinal: C.up,    yBase: 0.52, speed: 0.35, phase: 3.3, tilt: 0.02 },
  { family: "high", base: CAFE.amber,    cardinal: C.right, yBase: 0.58, speed: 0.48, phase: 1.3, tilt: -0.1 },
  { family: "low",  base: CAFE.coral,    cardinal: C.down,  yBase: 0.7,  speed: 0.62, phase: 4.2, tilt: 0.2 },
];

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mix = (a: RGB, b: RGB, k: number): RGB => [
  Math.round(lerp(a[0], b[0], k)),
  Math.round(lerp(a[1], b[1], k)),
  Math.round(lerp(a[2], b[2], k)),
];
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Rueda de color continua entre las 4 puntas cardinales (0..1). */
function wheel(k: number): RGB {
  const seg = k * 4;
  if (seg < 1) return mix(C.up, C.right, seg);
  if (seg < 2) return mix(C.right, C.down, seg - 1);
  if (seg < 3) return mix(C.down, C.left, seg - 2);
  return mix(C.left, C.up, seg - 3);
}

interface AuroraOrbProps {
  size: number;
  speaking: boolean;
  listening: boolean;
  paused: boolean;
  supported: boolean;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function AuroraOrb({ size, speaking, listening, paused, supported }: AuroraOrbProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Ids únicos para los gradientes SVG (sin ":" — deben ser válidos en url(#…)).
  const gid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  // Estado vivo leído dentro del bucle de animación (sin re-crear el bucle).
  const modeRef = useRef({ speaking, listening, paused, supported });
  modeRef.current = { speaking, listening, paused, supported };

  // Nivel de "latido" por eventos de voz (TTS) — decae con el tiempo.
  const beatRef = useRef(0);
  // Nivel/bandas del micrófono (STT) cuando hay analizador disponible.
  const micRef = useRef<MicAnalyser | null>(null);
  const micLevelRef = useRef({ level: 0, bands: [0, 0, 0] as RGB });

  // ── Latido por eventos de voz del motor ──
  useEffect(() => {
    const unsub = subscribeAuroraSpeak((phase) => {
      if (phase === "start" || phase === "boundary") {
        beatRef.current = Math.min(1, beatRef.current + (phase === "start" ? 0.7 : 0.55));
      } else if (phase === "end") {
        beatRef.current = 0;
      }
    });
    return unsub;
  }, []);

  // ── Analizador de micrófono mientras Aurora escucha ──
  useEffect(() => {
    let cancelled = false;
    if (listening && supported) {
      // Conecta de forma defensiva; si falla, seguimos con latido/respiración.
      createMicAnalyser().then((m) => {
        if (cancelled) { m?.stop(); return; }
        micRef.current = m;
      }).catch(() => { /* */ });
    }
    return () => {
      cancelled = true;
      try { micRef.current?.stop(); } catch { /* */ }
      micRef.current = null;
      micLevelRef.current = { level: 0, bands: [0, 0, 0] };
    };
  }, [listening, supported]);

  // ── Geometría de capas ──
  // Grosor del aro aurora visible (rim) y diámetro del núcleo de cristal.
  const rim = Math.max(4, Math.round(size * 0.09));
  const coreSize = size - rim * 2;
  const starSize = Math.round(coreSize * 0.68);

  // ── Bucle de dibujo: aurora interior + CSS vars (--aurora-energy/rgb) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const d = coreSize;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    canvas.width = Math.round(d * dpr);
    canvas.height = Math.round(d * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const reduce = prefersReducedMotion();
    let raf = 0;
    let t = Math.random() * 10; // arranque desincronizado (más orgánico)
    let smooth = 0;             // energía suavizada (evita parpadeos)

    const draw = () => {
      const { speaking: sp, listening: li, paused: pa, supported: su } = modeRef.current;
      t += reduce ? 0.005 : 0.018;

      // Decaimiento del latido por voz.
      beatRef.current *= 0.9;

      // Lectura del micrófono (si hay analizador).
      if (micRef.current) {
        micLevelRef.current = micRef.current.read();
      }
      const mic = micLevelRef.current;
      const [bLow, bMid, bHigh] = mic.bands;

      // Energía global (0..1): micro real + latido de voz + respiración.
      const breath = 0.5 + 0.5 * Math.sin(t); // ≈5.6s por ciclo a 60fps
      const active = su && (sp || li);
      let target: number;
      if (li && mic.level > 0.001) {
        target = Math.min(1, mic.level * 0.85 + beatRef.current * 0.4 + 0.12);
      } else if (sp) {
        target = Math.min(1, 0.3 + beatRef.current * 0.7);
      } else {
        target = active ? 0.32 + breath * 0.22 : breath * 0.2 + (su ? 0.08 : 0.02);
      }
      if (pa) target *= 0.55;
      smooth += (target - smooth) * 0.16;
      const e = smooth;

      // Color dominante: rueda cardinal continua + empuje espectral con micro
      // (graves→rojo/verde · agudos→azul/amarillo).
      const phase = (Math.sin(t * 0.45) + 1) / 2;
      let dom = wheel(phase);
      if (li && bLow + bMid + bHigh > 0.05) {
        if (bLow >= bMid && bLow >= bHigh) dom = mix(dom, C.down, 0.35);
        else if (bHigh >= bMid) dom = mix(dom, C.up, 0.35);
        else dom = mix(dom, C.right, 0.3);
      }

      // → CSS vars para estrella/halo/glow (sin re-render de React).
      root.style.setProperty("--aurora-energy", e.toFixed(3));
      root.style.setProperty("--aurora-rgb", `${dom[0]} ${dom[1]} ${dom[2]}`);

      // ══ Aurora interior del núcleo ══
      ctx.clearRect(0, 0, d, d);

      // Iluminación ambiental del cristal (brilla con la energía).
      const amb = ctx.createRadialGradient(d / 2, d * 0.6, 0, d / 2, d * 0.6, d * 0.62);
      amb.addColorStop(0, rgba(dom, 0.1 + e * 0.3));
      amb.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = amb;
      ctx.fillRect(0, 0, d, d);

      // Cintas aurora suaves (aditivas), con remolino interior sutil.
      ctx.globalCompositeOperation = "lighter";
      const swirl = reduce ? 0 : Math.sin(t * 0.14) * 0.3;
      for (const r of RIBBONS) {
        const boost = li
          ? (r.family === "low" ? bLow : r.family === "high" ? bHigh : bMid)
          : 0;
        const col = mix(r.base, r.cardinal, Math.min(1, 0.25 + boost * 0.75));
        const amp = d * (0.05 + e * 0.09) * (1 + boost * 0.9);
        const drift = Math.sin(t * 0.3 + r.phase * 1.7) * d * 0.06;
        const alpha = Math.min(0.5, 0.08 + e * 0.26 + boost * 0.3);

        ctx.save();
        ctx.translate(d / 2, d / 2);
        ctx.rotate(swirl + r.tilt);
        ctx.translate(-d / 2, -d / 2);
        ctx.beginPath();
        const STEPS = 18;
        for (let i = 0; i <= STEPS; i++) {
          const x = (i / STEPS) * d * 1.4 - d * 0.2;
          const y = r.yBase * d + drift + Math.sin((x / d) * 3.2 + t * r.speed + r.phase) * amp;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        // Banda ancha y tenue + hilo interior brillante (cinta de aurora).
        ctx.strokeStyle = rgba(col, alpha);
        ctx.lineWidth = d * (0.13 + e * 0.05);
        ctx.stroke();
        ctx.strokeStyle = rgba(mix(col, WHITE, 0.4), alpha * 0.9);
        ctx.lineWidth = d * 0.045;
        ctx.stroke();
        ctx.restore();
      }

      // Cuando HABLA: onda de color expansiva por cada pulso `aurora:speak`.
      if (sp && beatRef.current > 0.05 && !reduce) {
        const k = 1 - beatRef.current; // 0 (pulso) → 1 (apagado)
        ctx.strokeStyle = rgba(mix(dom, WHITE, 0.3), beatRef.current * 0.4);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(d / 2, d / 2, d * (0.14 + k * 0.4), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [coreSize]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={styles.root}
      style={{
        width: size,
        height: size,
        "--aurora-energy": 0,
        "--aurora-rgb": "159 232 112",
      } as React.CSSProperties}
    >
      {/* Halo-glow exterior que respira con la voz. */}
      <div className={styles.halo} />

      {/* (a) Esfera con el aro aurora cónico girando + especular del vidrio. */}
      <div className={styles.sphere}>
        <div className={styles.ring} />
        <div className={styles.specular} />
      </div>

      {/* (e) Anillo ping (~3.2s). */}
      <div className={styles.ping} />

      {/* (b)+(c) Núcleo de cristal oscuro con la aurora interior en canvas. */}
      <div className={styles.core} style={{ inset: rim }}>
        <canvas ref={canvasRef} className={styles.canvas} />
        <div className={styles.coreSpecular} />
      </div>

      {/* (d) Estrella ✦ nítida: puntas en los 4 cardinales Trinity exactos,
          centro blanco brillante. Late y brilla vía --aurora-energy. */}
      <svg
        className={styles.star}
        width={starSize}
        height={starSize}
        viewBox="0 0 24 24"
        aria-hidden
      >
        <defs>
          <linearGradient id={`${gid}u`} x1="12" y1="11" x2="12" y2="1.6" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#EAF6FF" />
            <stop offset="0.4" stopColor="#3E9FFF" />
            <stop offset="1" stopColor="#007FFF" />
          </linearGradient>
          <linearGradient id={`${gid}d`} x1="12" y1="13" x2="12" y2="22.4" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFEDF1" />
            <stop offset="0.4" stopColor="#F4476B" />
            <stop offset="1" stopColor="#DC143C" />
          </linearGradient>
          <linearGradient id={`${gid}l`} x1="13" y1="12" x2="1.6" y2="12" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#F0FFE9" />
            <stop offset="0.4" stopColor="#6FFF4D" />
            <stop offset="1" stopColor="#39FF14" />
          </linearGradient>
          <linearGradient id={`${gid}r`} x1="11" y1="12" x2="22.4" y2="12" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFF7E0" />
            <stop offset="0.4" stopColor="#FFD24D" />
            <stop offset="1" stopColor="#FFBF00" />
          </linearGradient>
          <radialGradient id={`${gid}c`} cx="12" cy="12" r="3.6" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.85" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Arriba · Zenith · azul */}
        <path d="M12 12 C10.7 8.6 10.9 5.4 12 1.6 C13.1 5.4 13.3 8.6 12 12 Z" fill={`url(#${gid}u)`} />
        {/* Abajo · Anchor · rojo */}
        <path d="M12 12 C13.3 15.4 13.1 18.6 12 22.4 C10.9 18.6 10.7 15.4 12 12 Z" fill={`url(#${gid}d)`} />
        {/* Izquierda · Horizon · verde */}
        <path d="M12 12 C8.6 13.3 5.4 13.1 1.6 12 C5.4 10.9 8.6 10.7 12 12 Z" fill={`url(#${gid}l)`} />
        {/* Derecha · Logic · amarillo */}
        <path d="M12 12 C15.4 10.7 18.6 10.9 22.4 12 C18.6 13.1 15.4 13.3 12 12 Z" fill={`url(#${gid}r)`} />
        {/* Centro blanco brillante */}
        <circle cx="12" cy="12" r="3.4" fill={`url(#${gid}c)`} />
        <circle cx="12" cy="12" r="1.4" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

export default AuroraOrb;
