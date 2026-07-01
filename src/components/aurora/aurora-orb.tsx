"use client";

/**
 * AuroraOrb — el núcleo visual del Orbe de Aurora.
 * ----------------------------------------------------------------------------
 * Una ESFERA (orbe) con una ESTRELLA de 4 puntas cuyos brazos usan los colores
 * cardinales de la Trinidad (arriba azul/Zenith, abajo rojo/Anchor, izquierda
 * verde/Horizon, derecha amarillo/Logic). La iluminación, el color y la forma
 * responden al sonido/tono/energía de la voz:
 *
 *   · Mientras Aurora ESCUCHA, conectamos (defensivo, con permiso) un
 *     `AnalyserNode` al micrófono → amplitud (RMS) + 3 bandas de frecuencia
 *     desplazan el brillo, el color dominante y la deformación orgánica.
 *   · Mientras Aurora HABLA, el motor emite pulsos `aurora:speak` (onboundary):
 *     cada pulso da un "latido" al orbe (el TTS no expone amplitud).
 *   · En reposo, respira con suavidad.
 *
 * Todo se dibuja en un <canvas> con requestAnimationFrame y degrada con gracia:
 * sin Web Audio / sin permiso de micro / con `prefers-reduced-motion`, cae a una
 * animación de respiración calmada. SSR-safe: nada toca window fuera de efectos.
 */

import { useEffect, useRef } from "react";
import {
  subscribeAuroraSpeak,
  createMicAnalyser,
  type MicAnalyser,
} from "@/lib/aurora/aurora-orb-bus";

// Colores cardinales de la estrella (Trinity).
const C = {
  up: [0, 127, 255] as [number, number, number],     // Zenith · azul
  down: [220, 20, 60] as [number, number, number],   // Anchor · rojo
  left: [57, 255, 20] as [number, number, number],   // Horizon · verde
  right: [255, 191, 0] as [number, number, number],  // Logic · amarillo
};

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Estado vivo leído dentro del bucle de animación (sin re-crear el bucle).
  const modeRef = useRef({ speaking, listening, paused, supported });
  modeRef.current = { speaking, listening, paused, supported };

  // Nivel de "latido" por eventos de voz (TTS) — decae con el tiempo.
  const beatRef = useRef(0);
  // Nivel/bandas del micrófono (STT) cuando hay analizador disponible.
  const micRef = useRef<MicAnalyser | null>(null);
  const micLevelRef = useRef({ level: 0, bands: [0, 0, 0] as [number, number, number] });

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

  // ── Bucle de dibujo ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.scale(dpr, dpr);

    const reduce = prefersReducedMotion();
    const cx = size / 2;
    const cy = size / 2;
    const baseR = size * 0.34;

    let raf = 0;
    let t = 0;

    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const mix = (
      a: [number, number, number],
      b: [number, number, number],
      k: number,
    ): [number, number, number] => [
      Math.round(lerp(a[0], b[0], k)),
      Math.round(lerp(a[1], b[1], k)),
      Math.round(lerp(a[2], b[2], k)),
    ];
    const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    const draw = () => {
      const { speaking: sp, listening: li, paused: pa, supported: su } = modeRef.current;
      t += reduce ? 0.006 : 0.022;

      // Decaimiento del latido por voz.
      beatRef.current *= 0.9;

      // Lectura del micrófono (si hay analizador).
      if (micRef.current) {
        micLevelRef.current = micRef.current.read();
      }
      const mic = micLevelRef.current;

      // Energía global (0..1): combina micro real + latido de voz + respiración.
      const breath = 0.5 + 0.5 * Math.sin(t * 1.4);
      const active = su && (sp || li);
      let energy: number;
      if (li && mic.level > 0.001) {
        energy = Math.min(1, mic.level * 0.85 + beatRef.current * 0.4 + 0.12);
      } else if (sp) {
        energy = Math.min(1, 0.28 + beatRef.current * 0.72);
      } else {
        energy = active ? 0.35 + breath * 0.25 : breath * 0.22 + (su ? 0.08 : 0.02);
      }
      if (pa) energy *= 0.55;

      // Color dominante: se desplaza por los 4 colores cardinales según el tiempo
      // y, si hay micro, según las bandas (graves→rojo/verde, agudos→azul/amarillo).
      const [bLow, bMid, bHigh] = mic.bands;
      const phase = (Math.sin(t * 0.5) + 1) / 2; // 0..1 recorrido continuo
      // Rueda de color entre las 4 puntas.
      let dom: [number, number, number];
      const seg = phase * 4;
      if (seg < 1) dom = mix(C.up, C.right, seg);
      else if (seg < 2) dom = mix(C.right, C.down, seg - 1);
      else if (seg < 3) dom = mix(C.down, C.left, seg - 2);
      else dom = mix(C.left, C.up, seg - 3);
      // Empuje espectral hacia un cardinal según la banda con más energía.
      if (li && (bLow + bMid + bHigh) > 0.05) {
        if (bLow >= bMid && bLow >= bHigh) dom = mix(dom, C.down, 0.35);
        else if (bHigh >= bMid) dom = mix(dom, C.up, 0.35);
        else dom = mix(dom, C.right, 0.3);
      }

      ctx.clearRect(0, 0, size, size);

      // ── Halo exterior (glow) ──
      const haloR = baseR * (1.9 + energy * 0.9);
      const halo = ctx.createRadialGradient(cx, cy, baseR * 0.4, cx, cy, haloR);
      halo.addColorStop(0, rgba(dom, 0.5 + energy * 0.4));
      halo.addColorStop(0.45, rgba(dom, 0.22 + energy * 0.2));
      halo.addColorStop(1, rgba(dom, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();

      // ── Estrella de 4 puntas (colores cardinales) ──
      const armLen = baseR * (0.9 + energy * 1.15);
      const armW = baseR * (0.42 + energy * 0.16);
      const arms: Array<{ ang: number; col: [number, number, number] }> = [
        { ang: -Math.PI / 2, col: C.up },     // arriba · azul
        { ang: Math.PI / 2, col: C.down },    // abajo · rojo
        { ang: Math.PI, col: C.left },        // izquierda · verde
        { ang: 0, col: C.right },             // derecha · amarillo
      ];
      ctx.save();
      ctx.translate(cx, cy);
      // Ligera rotación orgánica.
      ctx.rotate(reduce ? 0 : Math.sin(t * 0.6) * 0.06);
      for (const a of arms) {
        // Cada brazo late un poco desfasado (forma orgánica).
        const wobble = 1 + (reduce ? 0 : Math.sin(t * 2.3 + a.ang) * 0.12 * energy);
        const tip = armLen * wobble;
        const g = ctx.createLinearGradient(0, 0, Math.cos(a.ang) * tip, Math.sin(a.ang) * tip);
        g.addColorStop(0, rgba(a.col, 0.15));
        g.addColorStop(1, rgba(a.col, 0.75 + energy * 0.25));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const nx = Math.cos(a.ang + Math.PI / 2) * armW * 0.5;
        const ny = Math.sin(a.ang + Math.PI / 2) * armW * 0.5;
        ctx.lineTo(nx, ny);
        ctx.lineTo(Math.cos(a.ang) * tip, Math.sin(a.ang) * tip);
        ctx.lineTo(-nx, -ny);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // ── Esfera central (cristal líquido) ──
      const coreR = baseR * (1 + energy * 0.12);
      const core = ctx.createRadialGradient(
        cx - coreR * 0.3, cy - coreR * 0.35, coreR * 0.1,
        cx, cy, coreR,
      );
      const bright = mix(dom, [255, 255, 255], 0.55);
      core.addColorStop(0, rgba(bright, 0.98));
      core.addColorStop(0.5, rgba(dom, 0.9));
      core.addColorStop(1, rgba(mix(dom, [10, 12, 20], 0.5), 0.95));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Anillo/borde de la esfera.
      ctx.strokeStyle = rgba(bright, 0.5 + energy * 0.4);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.stroke();

      // Reflejo especular (highlight) para dar volumen de esfera.
      const hl = ctx.createRadialGradient(
        cx - coreR * 0.35, cy - coreR * 0.4, 0,
        cx - coreR * 0.35, cy - coreR * 0.4, coreR * 0.7,
      );
      hl.addColorStop(0, "rgba(255,255,255,0.85)");
      hl.addColorStop(0.4, "rgba(255,255,255,0.18)");
      hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.arc(cx - coreR * 0.28, cy - coreR * 0.32, coreR * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // Onda expansiva sutil cuando habla/escucha con energía alta.
      if (active && energy > 0.55 && !reduce) {
        const ringR = coreR + (energy - 0.55) * baseR * 3.2;
        ctx.strokeStyle = rgba(dom, Math.max(0, 0.5 - (energy - 0.55)));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ width: size, height: size }}
    />
  );
}

export default AuroraOrb;
