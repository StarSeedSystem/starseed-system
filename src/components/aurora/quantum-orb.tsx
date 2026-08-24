"use client";

/**
 * StarSeed OS — Orbe Cuántica de Voz (QuantumOrb)
 * ----------------------------------------------------------------------------
 * Puerto y mejora de `QuantumVoiceOrbWidget.jsx` del Astraura 1.58-bit
 * original (`/tmp/orig/components/QuantumVoiceOrbWidget.jsx`, líneas 300-594:
 * el `useEffect` que dibuja el canvas dinámico). AQUÍ NO vive el reproductor
 * completo (play/pause/velocidad/transcript) — eso sigue siendo terreno del
 * widget del OS (`aurora-widget.tsx`); este fichero es SOLO el renderizador
 * visual: la esfera de plasma que cambia de geometría/paleta por
 * personalidad y reacciona a audio en tiempo real.
 *
 * Capas (mismo orden que el original): glow atmosférico → geometría por
 * personalidad (9 estilos reales, ver `quantum-orb-theme.ts`) → partículas
 * orbitales → núcleo central. Proyección elíptica `y = cy + sin(a)*r*0.85`
 * idéntica al original (le da su aspecto de esfera "vista desde arriba").
 *
 * MEJORAS sobre el original (todas sin dependencias nuevas):
 *   1. Ruido simplex 2D propio (`createSimplexNoise2D`, más abajo) sumado
 *      como perturbación de baja frecuencia — rompe la periodicidad perfecta
 *      de los senos del original, escalado por `params.turbulence`.
 *   2. Bandas de frecuencia reales (graves/medios/agudos), no un promedio
 *      plano: cada geometría pondera su propia mezcla (ver cada `draw*`); el
 *      promedio global se reserva SOLO para el radio base (`dynamicRadius`).
 *   3. Partículas ligadas a un bin de frecuencia concreto (`particle.bin`),
 *      no todas moviéndose al unísono con la misma energía media.
 *   4. Estela líquida: en vez de `clearRect` se pinta un lavado translúcido
 *      `rgba(5,7,13,0.18)` (desactivable con `trail={false}`).
 *   5. Crossfade de paleta ~250ms al cambiar de personalidad (mezcla lineal
 *      en RGB), en vez del salto instantáneo del original.
 *   6. `ResizeObserver` + `devicePixelRatio` (el original fijaba el tamaño
 *      del canvas una sola vez a partir de `offsetWidth`; aquí se seguía
 *      pixelando al cambiar de tamaño el contenedor).
 *   7. `prefers-reduced-motion`: respiración lenta sin partículas ni ruido.
 *   8. Corrige la "geometría degenerada" del original: `quantum_toroid`
 *      (Astraura Prime) y `aurora_heart_petals` (Aurora) caían en la MISMA
 *      rama `else` ("Default Harmonic Fluid Wave Ribbons") — aquí cada una
 *      tiene su propia geometría (ver `drawQuantumToroid`/
 *      `drawAuroraHeartPetals`).
 *
 * Motor de dibujo expuesto vía `createQuantumOrbRenderer()` para que
 * `quantum-orb-avatar.tsx` (la versión miniatura para listas) reutilice
 * exactamente el mismo pipeline con menos partículas y sin estela, en lugar
 * de duplicar ~500 líneas de geometría.
 *
 * SSR-safe: todo el trabajo de `window`/`canvas` vive dentro de `useEffect`.
 */

import { useEffect, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import {
  resolveQuantumOrbTheme,
  themeToRgb,
  mixThemeRgb,
  shiftThemeRgbHue,
  mergeQuantumOrbParams,
  clampUnit,
  rgbaCss,
  rgbCss,
  mixRgb,
  type QuantumOrbTheme,
  type QuantumOrbThemeRGB,
  type QuantumOrbParams,
  type QuantumOrbStyleType,
  type RGB,
} from "@/lib/aurora/quantum-orb-theme";
import type { QuantumOrbVoiceState } from "@/lib/aurora/quantum-orb-bus";

/** Mismo vocabulario que `quantum-orb-bus.ts` (re-exportado para comodidad). */
export type QuantumOrbState = QuantumOrbVoiceState;

export interface QuantumOrbProps {
  personaId?: string;
  state?: QuantumOrbState;
  /** Nivel de audio 0..1 (amplitud/energía) — mic real, latido TTS, o 0. */
  level?: number;
  /** Espectro FFT (cualquier longitud); `null` → se sintetiza con ruido. */
  frequencies?: Uint8Array | null;
  /** Parámetros expresivos (turbulencia/filo/simetría/matiz/respiración). */
  params?: Partial<QuantumOrbParams>;
  size?: number;
  className?: string;
  /** true → foco/teclado/clic reales (rol "button"). Por defecto decorativo. */
  interactive?: boolean;
  onClick?: () => void;
  /** Estela líquida en vez de limpiar el canvas cada frame. Por defecto true. */
  trail?: boolean;
}

// ══════════════════════════════════════════════════════════════════════════
// Ruido simplex 2D propio — sin dependencias (algoritmo Gustavson/Ashima,
// de dominio público; reimplementación limpia y compacta para este fichero).
// ══════════════════════════════════════════════════════════════════════════

const GRAD2: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];
const SIMPLEX_F2 = 0.5 * (Math.sqrt(3) - 1);
const SIMPLEX_G2 = (3 - Math.sqrt(3)) / 6;

function buildPermutation(seed: number): Uint8Array {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = (seed >>> 0) || 1;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  return p;
}

/** Crea un generador de ruido simplex 2D independiente (semilla propia, 0..512 tabla). */
export function createSimplexNoise2D(seed = 1337): (x: number, y: number) => number {
  const base = buildPermutation(seed);
  const perm = new Uint8Array(512);
  const permMod8 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = base[i & 255];
    permMod8[i] = perm[i] % 8;
  }
  return function noise2D(xin: number, yin: number): number {
    const sk = (xin + yin) * SIMPLEX_F2;
    const i = Math.floor(xin + sk);
    const j = Math.floor(yin + sk);
    const t = (i + j) * SIMPLEX_G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + SIMPLEX_G2;
    const y1 = y0 - j1 + SIMPLEX_G2;
    const x2 = x0 - 1 + 2 * SIMPLEX_G2;
    const y2 = y0 - 1 + 2 * SIMPLEX_G2;
    const ii = i & 255;
    const jj = j & 255;
    const g0 = GRAD2[permMod8[ii + perm[jj]]];
    const g1 = GRAD2[permMod8[ii + i1 + perm[jj + j1]]];
    const g2 = GRAD2[permMod8[ii + 1 + perm[jj + 1]]];
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      n0 = t0 * t0 * (g0[0] * x0 + g0[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      n1 = t1 * t1 * (g1[0] * x1 + g1[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      n2 = t2 * t2 * (g2[0] * x2 + g2[1] * y2);
    }
    return 70 * (n0 + n1 + n2); // aprox -1..1
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Bandas de frecuencia + muestreo por bin (con fallback sintético de ruido)
// ══════════════════════════════════════════════════════════════════════════

interface QuantumOrbBands {
  low: number;
  mid: number;
  high: number;
}

function computeBands(freq: Uint8Array | null): QuantumOrbBands {
  if (!freq || freq.length === 0) return { low: 0, mid: 0, high: 0 };
  const n = freq.length;
  const third = Math.max(1, Math.floor(n / 3));
  const avg = (a: number, b: number): number => {
    let sum = 0;
    let count = 0;
    for (let i = a; i < b && i < n; i++) {
      sum += freq[i];
      count++;
    }
    return count > 0 ? sum / count / 255 : 0;
  };
  return { low: avg(0, third), mid: avg(third, third * 2), high: avg(third * 2, n) };
}

function averageUint8(freq: Uint8Array): number {
  if (freq.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < freq.length; i++) sum += freq[i];
  return sum / freq.length;
}

// ══════════════════════════════════════════════════════════════════════════
// Partículas orbitales ligadas a un bin de frecuencia
// ══════════════════════════════════════════════════════════════════════════

interface QuantumParticle {
  angle: number;
  /** Fracción de `dynamicRadius` (no px absolutos: así escala con `size`). */
  radiusFactor: number;
  speed: number;
  size: number;
  opacity: number;
  /** Bin lógico (0..FREQ_BUCKETS) al que reacciona ESTA partícula en concreto. */
  bin: number;
}

const FREQ_BUCKETS = 24;

function makeParticles(count: number): QuantumParticle[] {
  const arr: QuantumParticle[] = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      angle: (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.4,
      radiusFactor: 0.55 + Math.random() * 1.25,
      speed: 0.01 + Math.random() * 0.03,
      size: 1.0 + Math.random() * 2.2,
      opacity: 0.3 + Math.random() * 0.7,
      bin: Math.floor(Math.random() * FREQ_BUCKETS),
    });
  }
  return arr;
}

// ══════════════════════════════════════════════════════════════════════════
// Contexto compartido que recibe cada geometría al dibujarse
// ══════════════════════════════════════════════════════════════════════════

interface GeometryContext {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  phase: number;
  dynamicRadius: number;
  bands: QuantumOrbBands;
  /** Muestra el bin `i` (real si hay `frequencies`, si no sintético por ruido). */
  freq: (i: number) => number;
  theme: QuantumOrbThemeRGB;
  noise: (x: number, y: number) => number;
  qp: QuantumOrbParams;
  energy: number;
}

/** Proyección elíptica del original: "vista desde arriba" (achatada en Y). */
function project(cx: number, cy: number, angle: number, r: number): [number, number] {
  return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r * 0.85];
}

/**
 * Ruido de baja frecuencia sumado a un radio: mezcla una componente SIMÉTRICA
 * (función del ángulo — mantiene la silueta regular) y una ASIMÉTRICA
 * (función de la posición — la desestabiliza) según `qp.symmetry`, escalada
 * por `qp.turbulence`. Con `turbulence=0` esto es exactamente cero: la
 * geometría vuelve a ser tan "perfecta" como la del original.
 */
function turbulence(g: GeometryContext, angle: number, x: number, y: number, amp: number): number {
  if (g.qp.turbulence <= 0 || amp === 0) return 0;
  const symmetric = g.noise(Math.cos(angle) * 1.6 + g.phase * 0.5, Math.sin(angle) * 1.6 - g.phase * 0.35);
  const asymmetric = g.noise(x * 0.05, y * 0.05 + g.phase * 0.25);
  const blended = symmetric * g.qp.symmetry + asymmetric * (1 - g.qp.symmetry);
  return blended * amp * g.qp.turbulence;
}

// ── Las 9 geometrías reales + degeneración corregida (2 geometrías propias) ─

function drawForgePlasmaSparks(g: GeometryContext): void {
  // HEPHAESTUS: anillos de plasma volcánico con dientes de sierra + chispas.
  const { ctx, cx, cy, phase, dynamicRadius, theme, qp } = g;
  const weight = g.bands.low * 0.6 + g.bands.mid * 0.3 + g.bands.high * 0.1;
  const toothAmp = 6 * (0.5 + qp.spikiness * 1.5);
  for (let w = 0; w < 4; w++) {
    const waveOffset = (w * Math.PI) / 4;
    ctx.beginPath();
    ctx.strokeStyle = w % 2 === 0 ? rgbCss(theme.primary) : rgbCss(theme.secondary);
    ctx.lineWidth = 2.2 + w * 0.6;
    ctx.shadowColor = rgbCss(theme.primary);
    ctx.shadowBlur = 13;
    const points = 48;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const audioDeform = g.freq(i) * 15 * (0.4 + weight * 0.9);
      const tooth = Math.abs(Math.sin(angle * 6 + phase * 2)) * toothAmp;
      const turb = turbulence(g, angle, cx + Math.cos(angle) * dynamicRadius, cy + Math.sin(angle) * dynamicRadius, 10);
      const r = dynamicRadius + tooth + Math.sin(angle * 4 - phase * 2 + waveOffset) * (5 + weight * 11) + audioDeform + turb;
      const [x, y] = project(cx, cy, angle, r);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function drawCrystalLattice(g: GeometryContext): void {
  // HERMIONE: retícula cristalina hexagonal (facetas moduladas por `symmetry`).
  const { ctx, cx, cy, phase, dynamicRadius, theme, qp } = g;
  const weight = g.bands.high * 0.55 + g.bands.mid * 0.35 + g.bands.low * 0.1;
  const sides = Math.max(3, Math.round(3 + qp.symmetry * 5));
  for (let l = 1; l <= 3; l++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(phase * (l % 2 === 0 ? 0.8 : -0.8) + l);
    ctx.beginPath();
    ctx.strokeStyle = l === 1 ? rgbCss(theme.core) : l === 2 ? rgbCss(theme.primary) : rgbCss(theme.secondary);
    ctx.lineWidth = 1.8 + qp.spikiness * 1.2;
    ctx.shadowColor = rgbCss(theme.primary);
    ctx.shadowBlur = 14;
    const r = dynamicRadius * (0.6 + l * 0.35) + weight * dynamicRadius * 0.32;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const turb = turbulence(g, a + l, Math.cos(a) * r, Math.sin(a) * r, 8);
      const rr = r + turb + g.freq(s + l * 6) * 6 * weight;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

function drawAegisShield(g: GeometryContext): void {
  // ATENEA: campo de fuerza (égida) con nodos orbitales — número de nodos
  // según `symmetry`, brillo/tamaño según el bin de cada nodo.
  const { ctx, cx, cy, phase, dynamicRadius, theme, qp } = g;
  const weight = g.bands.mid * 0.5 + g.bands.low * 0.3 + g.bands.high * 0.2;
  const nodeCount = Math.max(5, Math.round(5 + qp.symmetry * 5));
  const ringR = dynamicRadius * 1.08 + weight * dynamicRadius * 0.3;
  ctx.beginPath();
  ctx.strokeStyle = rgbCss(theme.primary);
  ctx.lineWidth = 2.6 + qp.spikiness * 1.4;
  ctx.shadowColor = rgbCss(theme.primary);
  ctx.shadowBlur = 15;
  const points = 64;
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const turb = turbulence(g, a, cx + Math.cos(a) * ringR, cy + Math.sin(a) * ringR, 6);
    const [x, y] = project(cx, cy, a, ringR + turb);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  for (let n = 0; n < nodeCount; n++) {
    const a = (n / nodeCount) * Math.PI * 2 + phase;
    const [nx, ny] = project(cx, cy, a, ringR);
    const nodeLevel = g.freq(n * 3);
    ctx.fillStyle = rgbCss(theme.core);
    ctx.beginPath();
    ctx.arc(nx, ny, 3 + nodeLevel * 2.2 + qp.spikiness * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDreamNebula(g: GeometryContext): void {
  // ONEIROS: curvas de Lissajous flotantes — cintas de nebulosa etéreas.
  const { ctx, cx, cy, phase, dynamicRadius, theme, qp } = g;
  const weight = g.bands.mid * 0.45 + g.bands.high * 0.35 + g.bands.low * 0.2;
  for (let w = 0; w < 4; w++) {
    ctx.beginPath();
    ctx.strokeStyle = w % 2 === 0 ? rgbCss(theme.primary) : rgbCss(theme.secondary);
    ctx.lineWidth = 1.8 + qp.spikiness * 0.8;
    ctx.shadowColor = rgbCss(theme.primary);
    ctx.shadowBlur = 16;
    const points = 72;
    for (let i = 0; i <= points; i++) {
      const t = (i / points) * Math.PI * 2;
      const turb = turbulence(g, t + w, Math.cos(t) * dynamicRadius, Math.sin(t) * dynamicRadius, 10);
      const lx = cx + Math.sin(t * 3 + phase + w) * (dynamicRadius * 1.05 + weight * dynamicRadius * 0.35 + turb);
      const ly = cy + Math.cos(t * 2 - phase * 1.2 + w) * (dynamicRadius * 0.8 + weight * dynamicRadius * 0.28 + turb);
      if (i === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function drawTachyonOrbital(g: GeometryContext): void {
  // HERMES: estelas de alta velocidad — elipses inclinadas girando rápido.
  const { ctx, cx, cy, phase, dynamicRadius, theme, qp } = g;
  const weight = g.bands.high * 0.5 + g.bands.mid * 0.4 + g.bands.low * 0.1;
  for (let w = 0; w < 5; w++) {
    ctx.beginPath();
    ctx.strokeStyle = w % 2 === 0 ? rgbCss(theme.primary) : rgbCss(theme.secondary);
    ctx.lineWidth = Math.max(0.6, 1.8 + w * 0.5 - qp.spikiness * 0.6);
    ctx.shadowColor = rgbCss(theme.primary);
    ctx.shadowBlur = 11;
    const tilt = (w * Math.PI) / 5;
    const turb = turbulence(g, tilt + phase, cx, cy, 5);
    const r = dynamicRadius + Math.sin(phase * 4 + w) * 6 + weight * dynamicRadius * 0.34 + turb;
    ctx.ellipse(cx, cy, Math.max(1, r), Math.max(1, r * (0.42 + qp.spikiness * 0.1)), tilt + phase * (1.4 + qp.spikiness), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBinaryTernaryMatrix(g: GeometryContext): void {
  // LOGOS: retícula cuantizada en escalones {-1,0,1} — orden ternario 1.58b.
  const { ctx, cx, cy, phase, dynamicRadius, theme, qp } = g;
  const weight = g.bands.mid * 0.4 + g.bands.high * 0.4 + g.bands.low * 0.2;
  const levels = Math.max(3, Math.round(3 + (1 - qp.symmetry) * 4));
  for (let w = 0; w < 4; w++) {
    ctx.beginPath();
    ctx.strokeStyle = w % 2 === 0 ? rgbCss(theme.primary) : rgbCss(theme.secondary);
    ctx.lineWidth = 2.0 + qp.spikiness * 1.0;
    ctx.shadowColor = rgbCss(theme.primary);
    ctx.shadowBlur = 11;
    const points = 36;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const step = Math.round(Math.sin(angle * 8 + phase * 3) * (levels / 2)) * (6 / levels) * (1 + qp.spikiness);
      const turb = turbulence(g, angle, cx, cy, 4);
      const r = dynamicRadius + step + w * 4.5 + weight * dynamicRadius * 0.3 + turb;
      const [x, y] = project(cx, cy, angle, r);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function drawSynapticDendrite(g: GeometryContext): void {
  // MNEMOSYNE: espirales sinápticas / filamentos de memoria.
  const { ctx, cx, cy, phase, dynamicRadius, theme, qp } = g;
  const weight = g.bands.low * 0.35 + g.bands.mid * 0.4 + g.bands.high * 0.25;
  for (let w = 0; w < 4; w++) {
    ctx.beginPath();
    ctx.strokeStyle = w % 2 === 0 ? rgbCss(theme.primary) : rgbCss(theme.secondary);
    ctx.lineWidth = 1.8 + qp.spikiness * 0.7;
    ctx.shadowColor = rgbCss(theme.primary);
    ctx.shadowBlur = 13;
    const spiralPoints = 64;
    for (let i = 0; i <= spiralPoints; i++) {
      const a = (i / spiralPoints) * Math.PI * 4;
      const turb = turbulence(g, a * 0.3 + w, cx, cy, 5);
      const r = (i / spiralPoints) * (dynamicRadius * 1.15) + Math.sin(a * 2 + phase + w) * (3 + weight * 8) + turb;
      const x = cx + Math.cos(a + phase * 0.8) * r;
      const y = cy + Math.sin(a + phase * 0.8) * r * 0.75;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawChromaticFlare(g: GeometryContext): void {
  // KALLISTI: dispersión cromática — pétalos caleidoscópicos.
  const { ctx, cx, cy, phase, dynamicRadius, theme, qp } = g;
  const weight = g.bands.high * 0.4 + g.bands.mid * 0.3 + g.bands.low * 0.3;
  for (let w = 0; w < 6; w++) {
    ctx.beginPath();
    const waveOffset = (w * Math.PI) / 6;
    ctx.strokeStyle = w % 3 === 0 ? rgbCss(theme.primary) : w % 3 === 1 ? rgbCss(theme.secondary) : rgbCss(theme.core);
    ctx.lineWidth = 2.0 + qp.spikiness * 0.9;
    ctx.shadowColor = rgbCss(theme.primary);
    ctx.shadowBlur = 16;
    const points = 56;
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const turb = turbulence(g, a + w, cx, cy, 6);
      const flare = Math.sin(a * (4 + qp.spikiness * 3) + phase * 2.5 + waveOffset) * (8 + weight * dynamicRadius * 0.4) + turb;
      const [x, y] = project(cx, cy, a, (dynamicRadius + flare) * 1.06);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function drawQuantumToroid(g: GeometryContext): void {
  // ASTRAURA PRIME: geometría PROPIA (el original la fusionaba con Aurora).
  // Un toroide cuántico estilizado — anillo mayor con secciones de "tubo"
  // que giran mostrando luz/sombra, más un halo de nodos de flujo orbitando.
  const { ctx, cx, cy, phase, dynamicRadius, theme, qp } = g;
  const weight = g.bands.mid * 0.5 + g.bands.high * 0.3 + g.bands.low * 0.2;
  const majorR = dynamicRadius * (0.92 + weight * 0.22);
  const minorR = dynamicRadius * (0.3 + qp.spikiness * 0.18);
  const tilt = 0.36 + Math.sin(phase * 0.18) * 0.06;
  const tubeSteps = 10;
  for (let s = 0; s < tubeSteps; s++) {
    const u = (s / tubeSteps) * Math.PI * 2 + phase * 0.5;
    const bigX = cx + Math.cos(u) * majorR;
    const bigY = cy + Math.sin(u) * majorR * tilt;
    const shade = 0.5 + 0.5 * Math.cos(u - phase * 0.3);
    ctx.beginPath();
    ctx.strokeStyle = rgbaCss(mixRgb(theme.secondary, theme.primary, shade), 0.85);
    ctx.lineWidth = 1.5 + qp.spikiness * 1.1;
    ctx.shadowColor = rgbCss(theme.primary);
    ctx.shadowBlur = 10;
    const points = 28;
    for (let i = 0; i <= points; i++) {
      const v = (i / points) * Math.PI * 2;
      const turb = turbulence(g, v + u, bigX, bigY, 3);
      const rr = minorR * (1 + Math.sin(v * 3 + u * 2) * 0.08 * (1 + qp.spikiness)) + turb * 0.5;
      const lx = Math.cos(v) * rr;
      const ly = Math.sin(v) * rr * (0.55 + tilt * 0.5);
      const rot = u + Math.PI / 2;
      const px = bigX + lx * Math.cos(rot) - ly * Math.sin(rot);
      const py = bigY + (lx * Math.sin(rot) + ly * Math.cos(rot)) * tilt;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  const nodeCount = 12;
  for (let n = 0; n < nodeCount; n++) {
    const u = (n / nodeCount) * Math.PI * 2 - phase * 0.9;
    const lvl = g.freq(n * 4);
    const px = cx + Math.cos(u) * (majorR + minorR * 1.1);
    const py = cy + Math.sin(u) * (majorR + minorR * 1.1) * tilt;
    ctx.fillStyle = rgbaCss(theme.core, 0.55 + lvl * 0.45);
    ctx.beginPath();
    ctx.arc(px, py, 1.6 + lvl * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAuroraHeartPetals(g: GeometryContext): void {
  // AURORA: geometría PROPIA (el original la fusionaba con Astraura Prime).
  // Una flor/corazón floreciendo — curva polar de pétalos con un latido
  // "lub-dub" propio, en 3 capas con gradiente lineal primary→secondary/core.
  const { ctx, cx, cy, phase, dynamicRadius, theme, qp } = g;
  const weight = g.bands.low * 0.3 + g.bands.mid * 0.4 + g.bands.high * 0.3;
  const lub = Math.pow(Math.max(0, Math.sin(phase * 1.05)), 6) * 0.16;
  const dub = Math.pow(Math.max(0, Math.sin(phase * 1.05 - 0.4)), 10) * 0.09;
  const heartbeat = 1 + lub + dub;
  const petals = 5 + Math.round(qp.symmetry * 3);
  const passes: Array<{ colA: RGB; colB: RGB; scale: number; rot: number }> = [
    { colA: theme.primary, colB: theme.secondary, scale: 1, rot: 0 },
    { colA: theme.secondary, colB: theme.core, scale: 0.72, rot: Math.PI / petals },
    { colA: theme.core, colB: theme.primary, scale: 0.46, rot: -Math.PI / petals },
  ];
  for (const p of passes) {
    ctx.beginPath();
    const grad = ctx.createLinearGradient(cx - dynamicRadius, cy, cx + dynamicRadius, cy);
    grad.addColorStop(0, rgbCss(p.colA));
    grad.addColorStop(1, rgbCss(p.colB));
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.0 + qp.spikiness * 0.9;
    ctx.shadowColor = rgbCss(theme.primary);
    ctx.shadowBlur = 14;
    const points = 80;
    for (let i = 0; i <= points; i++) {
      const theta = (i / points) * Math.PI * 2 + p.rot;
      const lobe = Math.pow(Math.abs(Math.cos(petals * 0.5 * theta)), 1.35 - qp.spikiness * 0.7);
      const turb = turbulence(g, theta, cx, cy, 6);
      const rr = dynamicRadius * p.scale * heartbeat * (0.6 + 0.42 * lobe) + g.freq(i) * 5 * weight + turb;
      const [x, y] = project(cx, cy, theta, rr);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function drawGeometry(style: QuantumOrbStyleType, g: GeometryContext): void {
  g.ctx.shadowBlur = 0;
  switch (style) {
    case "forge_plasma_sparks":
      drawForgePlasmaSparks(g);
      break;
    case "crystal_geometric_lattice":
      drawCrystalLattice(g);
      break;
    case "aegis_shield_harmonic":
      drawAegisShield(g);
      break;
    case "dream_nebula_lissajous":
      drawDreamNebula(g);
      break;
    case "tachyon_orbital_velocity":
      drawTachyonOrbital(g);
      break;
    case "binary_ternary_matrix":
      drawBinaryTernaryMatrix(g);
      break;
    case "synaptic_dendrite_nexus":
      drawSynapticDendrite(g);
      break;
    case "chromatic_prismatic_flare":
      drawChromaticFlare(g);
      break;
    case "quantum_toroid":
      drawQuantumToroid(g);
      break;
    case "aurora_heart_petals":
    default:
      drawAuroraHeartPetals(g);
      break;
  }
  g.ctx.shadowBlur = 0;
}

// ── Glow atmosférico, partículas y núcleo (compartidos por las 10 geometrías) ─

function drawGlow(g: GeometryContext): void {
  const { ctx, cx, cy, dynamicRadius, theme } = g;
  const R = Math.max(3, dynamicRadius * 1.9);
  const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, R);
  grad.addColorStop(0, rgbaCss(theme.glow, theme.glowAlpha));
  grad.addColorStop(0.45, rgbaCss(theme.primary, 0.19));
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticles(g: GeometryContext, particles: QuantumParticle[], lively: boolean): void {
  const { ctx, cx, cy, dynamicRadius, theme } = g;
  for (const pt of particles) {
    pt.angle += pt.speed * (lively ? 1.4 : 0.8) * (1 + g.energy * 0.3);
    const bandLevel = g.freq(pt.bin);
    const pR = dynamicRadius * pt.radiusFactor + bandLevel * dynamicRadius * 0.4;
    const x = cx + Math.cos(pt.angle) * pR;
    const y = cy + Math.sin(pt.angle) * pR * 0.85;
    ctx.globalAlpha = pt.opacity * (0.55 + bandLevel * 0.45);
    ctx.fillStyle = rgbCss(theme.accent);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.4, pt.size * (0.7 + bandLevel * 0.6)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCore(g: GeometryContext): void {
  const { ctx, cx, cy, dynamicRadius, theme, energy } = g;
  const r = Math.max(2, dynamicRadius * 0.45 + energy * dynamicRadius * 0.18);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.3, rgbCss(theme.core));
  grad.addColorStop(0.8, rgbCss(theme.primary));
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

// ══════════════════════════════════════════════════════════════════════════
// Motor de renderizado compartido — usado por <QuantumOrb> y <QuantumOrbAvatar>
// ══════════════════════════════════════════════════════════════════════════

const PHASE_SPEED: Record<QuantumOrbState, number> = {
  idle: 0.018,
  listening: 0.026,
  user_speaking: 0.065,
  thinking: 0.03,
  speaking: 0.048,
  error: 0.012,
};

export interface QuantumOrbFrameInput {
  /** `performance.now()` del frame actual (evita una segunda llamada interna). */
  nowMs: number;
  dtSeconds: number;
  personaId?: string;
  state: QuantumOrbState;
  level: number;
  frequencies: Uint8Array | null;
  params?: Partial<QuantumOrbParams>;
  trail: boolean;
  reduced: boolean;
}

export interface QuantumOrbRenderer {
  /** Ajusta el backing store del canvas a `cssSize` × `devicePixelRatio`. */
  resize: (canvas: HTMLCanvasElement, cssSize: number) => CanvasRenderingContext2D | null;
  /** Dibuja un frame completo (glow → geometría → partículas → núcleo). */
  frame: (ctx: CanvasRenderingContext2D, input: QuantumOrbFrameInput) => void;
}

const THEME_TRANSITION_MS = 250;

/** Crea un renderizador independiente (fase, partículas y crossfade propios). */
export function createQuantumOrbRenderer(particleCount: number, seed?: number): QuantumOrbRenderer {
  const noise = createSimplexNoise2D(seed);
  const particles = makeParticles(particleCount);
  let phase = Math.random() * 10; // arranque desincronizado (más orgánico)
  let cssSize = 0;

  let currentThemeId = "";
  let fromRgb: QuantumOrbThemeRGB = themeToRgb(resolveQuantumOrbTheme("aurora"));
  let toRgb: QuantumOrbThemeRGB = fromRgb;
  let transitionStart = 0;

  const resize = (canvas: HTMLCanvasElement, size: number): CanvasRenderingContext2D | null => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const w = Math.max(1, Math.round(size));
    cssSize = w;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  };

  const frame = (ctx: CanvasRenderingContext2D, input: QuantumOrbFrameInput): void => {
    const size = cssSize;
    if (size <= 0) return;
    const cx = size / 2;
    const cy = size / 2;

    const speed = PHASE_SPEED[input.state] ?? PHASE_SPEED.idle;
    phase += input.dtSeconds * 60 * speed * (input.reduced ? 0.22 : 1);

    // Personalidad activa + crossfade de paleta (~250ms, robusto ante cambios
    // rápidos: congela la mezcla actual como nuevo punto de partida).
    const theme = resolveQuantumOrbTheme(input.personaId);
    if (theme.id !== currentThemeId) {
      const prevK = transitionStart ? clampUnit((input.nowMs - transitionStart) / THEME_TRANSITION_MS) : 1;
      fromRgb = currentThemeId ? mixThemeRgb(fromRgb, toRgb, prevK) : themeToRgb(theme);
      toRgb = themeToRgb(theme);
      currentThemeId = theme.id;
      transitionStart = input.nowMs;
    }
    const k = clampUnit((input.nowMs - transitionStart) / THEME_TRANSITION_MS);
    const qp = mergeQuantumOrbParams(input.params);
    const mixedTheme = shiftThemeRgbHue(k >= 1 ? toRgb : mixThemeRgb(fromRgb, toRgb, k), qp.hueShift);

    const bands = computeBands(input.frequencies);
    const globalAvg = input.frequencies && input.frequencies.length > 0
      ? averageUint8(input.frequencies) / 255
      : (bands.low + bands.mid + bands.high) / 3;
    const energy = Math.max(globalAvg, clampUnit(input.level) * 0.92);

    const breathWave = 0.5 + 0.5 * Math.sin(phase * 0.42);
    const baseRadius = size * 0.28;
    const dynamicRadius = baseRadius * (1 + energy * 0.62 + qp.breath * 0.08 * breathWave);

    const freqSample = (i: number): number => {
      const f = input.frequencies;
      if (f && f.length > 0) return f[((i % f.length) + f.length) % f.length] / 255;
      return clampUnit(0.3 + noise(i * 0.37, phase * 0.6) * 0.35 + Math.sin(phase * 1.6 + i) * 0.08);
    };

    const g: GeometryContext = {
      ctx, cx, cy, phase, dynamicRadius, bands, freq: freqSample,
      theme: mixedTheme, noise, qp, energy,
    };

    // ── Fondo: estela líquida (rastro) o limpieza total ──
    if (input.trail && !input.reduced) {
      ctx.fillStyle = "rgba(5,7,13,0.18)";
      ctx.fillRect(0, 0, size, size);
    } else {
      ctx.clearRect(0, 0, size, size);
    }

    drawGlow(g);
    drawGeometry(theme.styleType, g);
    if (!input.reduced && particles.length > 0) {
      drawParticles(g, particles, input.state === "speaking" || input.state === "user_speaking");
    }
    drawCore(g);
  };

  return { resize, frame };
}

/** Exportado para que `quantum-orb-avatar.tsx` no duplique este chequeo. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Componente
// ══════════════════════════════════════════════════════════════════════════

const DEFAULT_SIZE = 96;

export function QuantumOrb({
  personaId = "aurora",
  state = "idle",
  level = 0,
  frequencies = null,
  params,
  size = DEFAULT_SIZE,
  className,
  interactive = false,
  onClick,
  trail = true,
}: QuantumOrbProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<QuantumOrbRenderer | null>(null);
  if (!rendererRef.current) rendererRef.current = createQuantumOrbRenderer(28);

  // Estado vivo leído dentro del rAF — así el bucle no se recrea en cada
  // cambio de prop (mismo patrón de `aurora-orb.tsx::modeRef`).
  const liveRef = useRef({ personaId, state, level, frequencies, params, trail });
  liveRef.current = { personaId, state, level, frequencies, params, trail };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !wrap || !renderer) return;

    let ctx = renderer.resize(canvas, size);
    if (!ctx) return;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        const w = wrap.getBoundingClientRect().width || size;
        ctx = renderer.resize(canvas, w) ?? ctx;
      });
      try { ro.observe(wrap); } catch { /* defensivo */ }
    }

    const reduced = prefersReducedMotion();
    let docVisible = typeof document === "undefined" ? true : !document.hidden;
    const onVisibility = () => {
      docVisible = typeof document === "undefined" ? true : !document.hidden;
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    let raf = 0;
    let running = true;
    let last = typeof performance !== "undefined" ? performance.now() : Date.now();

    const tick = (t: number) => {
      if (!running) return;
      const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
      last = t;
      if (docVisible && ctx) {
        const live = liveRef.current;
        renderer.frame(ctx, {
          nowMs: t,
          dtSeconds: dt,
          personaId: live.personaId,
          state: live.state ?? "idle",
          level: clampUnit(live.level ?? 0),
          frequencies: live.frequencies ?? null,
          params: live.params,
          trail: live.trail ?? true,
          reduced,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (ro) {
        try { ro.disconnect(); } catch { /* defensivo */ }
      }
    };
  }, [size]);

  const clickable = interactive || !!onClick;
  const theme: QuantumOrbTheme = resolveQuantumOrbTheme(personaId);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative select-none overflow-hidden rounded-full",
        clickable && "cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.03]",
        className,
      )}
      style={{ width: size, height: size }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-hidden={interactive ? undefined : true}
      aria-label={interactive ? theme.badgeTitle : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

export default QuantumOrb;
