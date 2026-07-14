/**
 * Audiomorphic — RENDERER COMPLETO (Adenda 69 · K)
 * ============================================================================
 * Port de `components/VisualizerCanvas.tsx` de la repo CORRECTA
 * (github.com/alexbordongarrigos/audiomorphic-ar) a una clase sin React, para
 * que la usen IGUAL la APP `/audiomorphic` y la CAPA DE FONDO del OS.
 *
 * ⚠️ El renderer de la Adenda 68·E venía de la repo EQUIVOCADA
 * (`StarSeedSystem/Audiomorphic-AR-app`) y le faltaba casi todo. Aquí está lo
 * real:
 *   · Las **20 geometrías** (4 aquí + 16 en `geometry-drawers.ts`).
 *   · **Capa de geometría sagrada independiente** (`sacredGeometryEnabled`), con
 *     modos de dibujo `nodes` · `layers` · `both`.
 *   · **Perturbación de la espiral** (`spiralResonanceModes`): las 20 geometrías
 *     deforman de verdad el trazo, cada una con su fórmula.
 *   · **Resonancia automática** (osciladores áureos por modo).
 *   · **Multiplicadores globales** (opacidad · flujo · reactividad · viscosidad).
 *   · **Desvanecido al salir** (`autoOffscreenFade`).
 *   · **Tema** claro/oscuro, **armonía automática**, color propio por geometría.
 *   · `distanceZoom` y `spiralThickness`.
 *
 * ── TRANSPARENCIA REAL ──────────────────────────────────────────────────────
 * El canvas se crea con `alpha: true` y la estela se hace con
 * `globalCompositeOperation = "destination-out"` (BORRA alfa) en lugar de pintar
 * negro encima. Así la espiral se compone de verdad sobre las capas del OS.
 * (En la app original el canvas ya era alfa: lo opaco era el `<body>` #050505 —
 * por eso dentro de un iframe no había forma de hacerla transparente.)
 */

import {
    drawChakras, drawCymatics, drawDharmaChakra, drawHolographicFractal, drawLotus,
    drawMandala1, drawMandala2, drawMandala3, drawMerkaba, drawMetatron, drawOm,
    drawPlatonicSolids, drawSriYantra, drawTreeOfLife, drawVectorEquilibrium, drawYinYang,
} from "./geometry-drawers";
import { lerpAngleDeg } from "./harmonic-math";
import type { AudioMetrics, SacredGeometryMode, SacredGeometrySettings, VisualizerParams } from "./types";
import { DEFAULT_PARAMS, SG_MODES } from "./types";

/* ── Los 4 dibujantes que además perturban la espiral ──────────────────── */

function drawSeedOfLife(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number,
    lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number,
    vol: number, thickness: number,
): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;

    const circle = (x: number, y: number, rad: number) => {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0, rad), 0, Math.PI * 2);
        ctx.stroke();
        if (bgOpacity > 0) ctx.fill();
    };

    circle(0, 0, r);
    for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        circle(Math.cos(a) * r, Math.sin(a) * r, r);
        const aOuter = a + Math.PI / 6;
        const rOuter = r * Math.sqrt(3);
        circle(Math.cos(aOuter) * rOuter, Math.sin(aOuter) * rOuter, r);
    }

    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, r * 3), 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity * 0.5})`;
    ctx.stroke();
    ctx.restore();
}

function drawTorus(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number,
    lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number,
    time: number, vol: number, thickness: number,
): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity * 0.8})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (0.5 + vol) * thickness;

    const rings = 24;
    const tubeRadius = r * 0.6;
    const mainRadius = r;

    for (let i = 0; i < rings; i++) {
        const a = (i / rings) * Math.PI * 2 + time * 0.2;
        const xOffset = Math.cos(a) * mainRadius;
        const yOffset = Math.sin(a) * mainRadius;
        const squeeze = Math.abs(Math.cos(time * 0.5 + i * 0.1));

        ctx.beginPath();
        ctx.ellipse(
            xOffset, yOffset, Math.max(0, tubeRadius),
            Math.max(0, tubeRadius * (0.2 + squeeze * 0.8)), a + time, 0, Math.PI * 2,
        );
        if (bgOpacity > 0) ctx.fill();
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, mainRadius), 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, 100%, ${lineOpacity})`;
    ctx.lineWidth = (1 + vol * 2) * thickness;
    ctx.stroke();
    ctx.restore();
}

function drawQuantumCloud(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, time: number, vol: number,
    lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number, thickness: number,
): void {
    ctx.save();
    ctx.translate(cx, cy);

    const layers = 12;
    for (let i = 1; i <= layers; i++) {
        const layerVol = vol * (1 - i / layers);
        const radius = r * (i / layers) * (1 + Math.sin(time * 2 + i) * 0.15 * layerVol);
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity * 0.8 * (1 - i / layers)})`;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0, radius), 0, Math.PI * 2);
        if (bgOpacity > 0) ctx.fill();
    }

    ctx.strokeStyle = `hsla(${hue}, ${sat}%, 100%, ${lineOpacity * 0.9})`;
    ctx.lineWidth = (0.8 + vol * 1.5) * thickness;

    const petals = 5 + Math.floor(vol * 3);
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2.01; a += 0.05) {
        const mod1 = Math.sin(a * petals + time * 3);
        const mod2 = Math.cos(a * (petals - 2) - time * 2);
        const mod = 1 + 0.3 * mod1 * mod2 * (1 + vol);
        const x = Math.cos(a) * r * mod;
        const y = Math.sin(a) * r * mod;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0, r * 0.2 * (1 + vol)), 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, 100%, ${bgOpacity})`;
    if (bgOpacity > 0) ctx.fill();
    ctx.restore();
}

function drawGoldenSpiral(
    ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number,
    lineOpacity: number, bgOpacity: number, hue: number, sat: number, light: number,
    vol: number, thickness: number,
): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${lineOpacity})`;
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${bgOpacity})`;
    ctx.lineWidth = (1.5 + vol * 2) * thickness;

    ctx.beginPath();
    const a = r * 0.02;
    const b = Math.log(1.6180339) / (Math.PI / 2);
    const maxTheta = Math.PI * 8;
    for (let theta = 0; theta < maxTheta; theta += 0.05) {
        const rad = a * Math.exp(b * theta);
        const x = rad * Math.cos(theta);
        const y = rad * Math.sin(theta);
        if (theta === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
}

/** Despacha una geometría por su id (las 20). */
function drawMode(
    mode: SacredGeometryMode, ctx: CanvasRenderingContext2D, cx: number, cy: number,
    radius: number, rotation: number, lineOpacity: number, bgOpacity: number,
    hue: number, sat: number, light: number, time: number, vol: number, thickness: number,
): void {
    switch (mode) {
        case "flowerOfLife": drawSeedOfLife(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, vol, thickness); break;
        case "torus": drawTorus(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, time, vol, thickness); break;
        case "quantumWave": drawQuantumCloud(ctx, cx, cy, radius, time, vol, lineOpacity, bgOpacity, hue, sat, light, thickness); break;
        case "goldenSpiral": drawGoldenSpiral(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, vol, thickness); break;
        case "metatron": drawMetatron(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, vol, thickness); break;
        case "merkaba": drawMerkaba(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, time, vol, thickness); break;
        case "platonicSolids": drawPlatonicSolids(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, time, vol, thickness); break;
        case "sriYantra": drawSriYantra(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, vol, thickness); break;
        case "cymatics": drawCymatics(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, time, vol, thickness); break;
        case "vectorEquilibrium": drawVectorEquilibrium(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, time, vol, thickness); break;
        case "treeOfLife": drawTreeOfLife(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, vol, thickness); break;
        case "yinYang": drawYinYang(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, time, vol, thickness); break;
        case "mandala1": drawMandala1(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, vol, thickness); break;
        case "mandala2": drawMandala2(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, time, vol, thickness); break;
        case "mandala3": drawMandala3(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, time, vol, thickness); break;
        case "holographicFractal": drawHolographicFractal(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, time, vol, thickness); break;
        case "chakras": drawChakras(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, time, vol, thickness); break;
        case "om": drawOm(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, vol, thickness); break;
        case "lotus": drawLotus(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, time, vol, thickness); break;
        case "dharmaChakra": drawDharmaChakra(ctx, cx, cy, radius, rotation, lineOpacity, bgOpacity, hue, sat, light, time, vol, thickness); break;
    }
}

/** Perturbación que cada geometría aplica al trazo de la espiral. */
function resonanceOffset(
    mode: SacredGeometryMode, px: number, py: number, cx: number, cy: number,
    n: number, t: number, sVol: number, react: number,
): { x: number; y: number } {
    const angle = Math.atan2(py - cy, px - cx);
    const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
    let ox = 0;
    let oy = 0;

    switch (mode) {
        case "goldenSpiral": {
            const offset = Math.sin(angle * 1.6180339 - t) * 10 * sVol * react;
            ox = Math.cos(angle) * offset; oy = Math.sin(angle) * offset;
            break;
        }
        case "quantumWave": {
            const wave = Math.sin(n * 0.1 - t) * Math.cos(n * 0.05 + t);
            ox = wave * 15 * sVol * react; oy = -wave * 15 * sVol * react;
            break;
        }
        case "flowerOfLife": {
            const hex = Math.cos(angle * 6 + t) * 12 * sVol * react;
            ox = Math.cos(angle) * hex; oy = Math.sin(angle) * hex;
            break;
        }
        case "torus": {
            const fold = Math.sin(dist * 0.01 - t * 2) * 10 * sVol * react;
            ox = Math.cos(angle) * fold; oy = Math.sin(angle) * fold;
            break;
        }
        case "metatron": {
            const hex = Math.cos(angle * 6) * 15 * sVol * react;
            ox = Math.cos(angle) * hex; oy = Math.sin(angle) * hex;
            break;
        }
        case "merkaba": {
            const tri1 = Math.sin(angle * 3 + t) * 10 * sVol * react;
            const tri2 = Math.sin(angle * 3 - t + Math.PI) * 10 * sVol * react;
            ox = Math.cos(angle) * (tri1 + tri2); oy = Math.sin(angle) * (tri1 + tri2);
            break;
        }
        case "platonicSolids": {
            const poly = Math.cos(angle * 5 + t * 2) * 12 * sVol * react;
            ox = Math.cos(angle) * poly; oy = Math.sin(angle) * poly;
            break;
        }
        case "sriYantra": {
            const tri = Math.sin(angle * 9) * Math.cos(dist * 0.05) * 15 * sVol * react;
            ox = Math.cos(angle) * tri; oy = Math.sin(angle) * tri;
            break;
        }
        case "cymatics": {
            const nodes = 6 + Math.floor(sVol * 6) * 2;
            const wave = Math.sin(nodes * angle + t) * Math.cos(dist * 0.02 - t) * 20 * sVol * react;
            ox = Math.cos(angle) * wave; oy = Math.sin(angle) * wave;
            break;
        }
        case "vectorEquilibrium": {
            const jitter = Math.sin(t * 4) * Math.cos(angle * 12) * 10 * sVol * react;
            ox = Math.cos(angle) * jitter; oy = Math.sin(angle) * jitter;
            break;
        }
        case "treeOfLife": {
            oy = Math.sin(dist * 0.1) * Math.cos(dist * 0.05) * 12 * sVol * react; // sesgo vertical
            break;
        }
        case "yinYang": {
            const swirl = Math.sin(angle + t) * 15 * sVol * react;
            ox = Math.cos(angle + Math.PI / 2) * swirl; oy = Math.sin(angle + Math.PI / 2) * swirl;
            break;
        }
        case "mandala1":
        case "mandala2":
        case "mandala3": {
            const petals = Math.cos(angle * 8 + t) * 12 * sVol * react;
            ox = Math.cos(angle) * petals; oy = Math.sin(angle) * petals;
            break;
        }
        case "holographicFractal": {
            const frac = Math.sin(angle * 6) * Math.cos(dist * 0.1 + t) * 15 * sVol * react;
            ox = Math.cos(angle) * frac; oy = Math.sin(angle) * frac;
            break;
        }
        case "chakras": {
            oy = -(Math.sin(dist * 0.05 - t * 3) * 10 * sVol * react); // flujo ascendente
            break;
        }
        case "om": {
            const vib = Math.sin(dist * 0.02 - t * 5) * Math.cos(angle * 3) * 15 * sVol * react;
            ox = Math.cos(angle) * vib; oy = Math.sin(angle) * vib;
            break;
        }
        case "lotus": {
            const open = Math.sin(angle * 8) * Math.max(0, Math.sin(t)) * 15 * sVol * react;
            ox = Math.cos(angle) * open; oy = Math.sin(angle) * open;
            break;
        }
        case "dharmaChakra": {
            const wheel = Math.cos(angle * 8 + t * 2) * 12 * sVol * react;
            ox = Math.cos(angle) * wheel; oy = Math.sin(angle) * wheel;
            break;
        }
    }
    return { x: ox, y: oy };
}

function getGeometryColor(
    p: VisualizerParams, settings: SacredGeometrySettings, baseHue: number,
    sVol: number, modeIndex: number, activeModesCount: number,
) {
    let hue = baseHue;
    let sat = p.saturation;
    let light = p.sgTheme === "dark" ? 20 : 80;
    let lineOpacity = settings.lineOpacity;
    let bgOpacity = settings.bgOpacity;

    if (p.sgAutoHarmonic) {
        hue = (baseHue + modeIndex * (360 / Math.max(1, activeModesCount)) + sVol * 90) % 360;
        sat = 70 + sVol * 30;
        light = p.sgTheme === "dark" ? 10 + sVol * 30 : 90 - sVol * 30;
        lineOpacity = Math.min(1.0, settings.lineOpacity * (0.5 + sVol * 1.5));
        bgOpacity = Math.min(1.0, settings.bgOpacity * (0.5 + sVol * 1.5));
    } else if (settings.colored) {
        hue = settings.customColor;
    } else {
        sat = 0;
        light = p.sgTheme === "dark" ? 0 : 100;
    }

    return { hue, sat, light, lineOpacity, bgOpacity };
}

interface FadingMode { mode: SacredGeometryMode; opacity: number; scale: number }

export interface RendererOptions {
    /**
     * Se conserva por compatibilidad de API. El canvas SIEMPRE lleva alfa real y
     * la estela BORRA alfa, así que la transparencia funciona en los dos casos.
     * Lo único que cambia es quién pinta el fondo: la APP monta su propia capa
     * (`background-modes.ts`); la CAPA DE FONDO del OS no monta ninguna.
     */
    transparent?: boolean;
    /** Tope de iteraciones (modo eco / dispositivo lento). */
    maxIter?: number;
    /** Tope de densidad de píxel. */
    maxDpr?: number;
}

export class AudiomorphicRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D | null;
    private opts: RendererOptions;

    private width = 0;
    private height = 0;

    private time = 0;
    private currentHue: number;
    private smoothedVol = 0;
    private smoothedFreq = 0;

    private fadingSg: FadingMode[] = [];
    private prevSgModes: SacredGeometryMode[] = [];
    private fadingResonance: FadingMode[] = [];
    private prevResonanceModes: SacredGeometryMode[] = [];

    constructor(canvas: HTMLCanvasElement, opts: RendererOptions = {}, initialHue = DEFAULT_PARAMS.baseHue) {
        this.canvas = canvas;
        this.opts = opts;
        this.currentHue = initialHue;
        this.ctx = canvas.getContext("2d", { alpha: true });
    }

    resize(width: number, height: number): void {
        if (width <= 0 || height <= 0) return;
        const maxDpr = this.opts.maxDpr ?? 2;
        const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, maxDpr);

        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;

        const ctx = this.ctx;
        if (ctx) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
        }
        this.width = width;
        this.height = height;
    }

    /** Un fotograma. `p` ya viene con el estado vivo del piloto aplicado. */
    render(p: VisualizerParams, metrics: AudioMetrics): void {
        const ctx = this.ctx;
        if (!ctx || this.width <= 0 || this.height <= 0) return;

        const width = this.width;
        const height = this.height;
        const cx = width / 2;
        const cy = height / 2;

        /* Suavizado del audio (la espiral late incluso en silencio) */
        const restingPulse = 0.005;
        const targetVol = Math.max(restingPulse, metrics.volume);
        this.smoothedVol += (targetVol - this.smoothedVol) * 0.05;
        this.smoothedFreq += (metrics.frequency - this.smoothedFreq) * 0.05;
        const sVol = this.smoothedVol;
        const sFreq = this.smoothedFreq;

        /* ── RESONANCIA AUTOMÁTICA ─────────────────────────────────────────── */
        let sgSettings = p.sgSettings;
        const hasSpiralModes = (p.spiralResonanceModes?.length ?? 0) > 0;

        if ((p.autoPilotMode === "genesis" || p.sacredGeometryEnabled || hasSpiralModes) && p.sgAutoResonance) {
            const t = this.time;
            sgSettings = { ...p.sgSettings };

            const activeSpiral = p.spiralResonanceModes ?? [];
            const activeSg = p.sacredGeometryEnabled ? (p.sacredGeometryModes ?? []) : [];
            const activeCount = Math.max(1, new Set([...activeSpiral, ...activeSg]).size);
            const opacityDamping = Math.sqrt(activeCount);

            SG_MODES.forEach((mode, i) => {
                const phi = 1.6180339;
                const phase = i * phi * Math.PI;
                const slowOsc = Math.sin(t * 0.02 + phase);
                const midOsc = Math.cos(t * 0.05 + phase * phi);
                const fastOsc = Math.sin(t * 0.1 + phase / phi);

                const complexity = Math.max(2, Math.min(4, Math.floor(3 + slowOsc + sVol * 1.5)));
                const scale = 0.1 + sVol * 0.03 + midOsc * 0.02;
                const lineOpacity = (0.4 + sVol * 0.2 + fastOsc * 0.1) / opacityDamping;
                const bgOpacity = (0.08 + sVol * 0.04 + slowOsc * 0.02) / opacityDamping;
                const thickness = 0.1 + sVol * 0.05 + (sFreq > 0.8 ? 0.05 : 0);

                sgSettings[mode] = {
                    ...DEFAULT_PARAMS.sgSettings[mode],
                    ...(p.sgSettings[mode] ?? {}),
                    complexity,
                    connectionSpan: Math.floor(100 + slowOsc * 20),
                    scale: Math.max(0.05, scale),
                    lineOpacity: Math.max(0.1, Math.min(1.0, lineOpacity)),
                    bgOpacity: Math.max(0.0, Math.min(1.0, bgOpacity)),
                    thickness: Math.max(0.05, thickness),
                    flowSpeed: 0.2 + slowOsc * 0.05 + midOsc * 0.05,
                    audioReactivity: 4.0 + sFreq * 2.0,
                };
            });
        }

        /* ── MULTIPLICADORES GLOBALES ──────────────────────────────────────── */
        if (sgSettings === p.sgSettings) sgSettings = { ...p.sgSettings };
        for (const mode of SG_MODES) {
            const base = sgSettings[mode] ?? DEFAULT_PARAMS.sgSettings[mode];
            if (!base) continue;
            sgSettings[mode] = {
                ...base,
                lineOpacity: Math.max(0, Math.min(1, base.lineOpacity * (p.sgGlobalOpacity ?? 1))),
                bgOpacity: Math.max(0, Math.min(1, base.bgOpacity * (p.sgGlobalOpacity ?? 1))),
                flowSpeed: base.flowSpeed * (p.sgGlobalFlowSpeed ?? 1),
                audioReactivity: base.audioReactivity * (p.sgGlobalAudioReactivity ?? 1),
                viscosity: (base.viscosity ?? 0.5) * (p.sgGlobalViscosity ?? 1),
            };
        }

        /* ── ESTELA — BORRA alfa (no pinta negro) ⇒ transparencia real ─────── */
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = `rgba(0, 0, 0, ${p.trail})`;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";

        /* ── Cálculos dinámicos ────────────────────────────────────────────── */
        const safeK = p.k || 1.0;
        const dynamicK = 1.0 + (safeK - 1 + sVol * 0.005);
        const dynamicPsi = (p.psi || 0) + sFreq * 0.05;

        const minDim = Math.min(width, height);
        const responsiveZoom = (p.zoom || 0.001) * (p.distanceZoom || 1.0) * minDim;

        const rotReal = Math.cos(dynamicPsi);
        const rotImag = Math.sin(dynamicPsi);

        let zReal = 1.0 + sVol * 0.2;
        let zImag = 0.0;

        // En Génesis el tiempo va más lento (flujo orgánico y calmado).
        this.time += p.autoPilotMode === "genesis" ? p.hueSpeed * 0.2 : p.hueSpeed;

        /* ── Color ─────────────────────────────────────────────────────────── */
        let displayBaseHue: number;
        if (p.harmonicColor || p.autoPilotMode !== "drift") {
            let targetHue = p.baseHue;
            if (p.harmonicColor) {
                const logFreq = Math.log2(1 + sFreq * 32) / 5;
                targetHue = (p.baseHue + logFreq * 360 * (p.harmonicSensitivity || 1)) % 360;
            }
            this.currentHue = lerpAngleDeg(this.currentHue, targetHue, 0.05);
            displayBaseHue = this.currentHue;
        } else {
            this.currentHue = (p.baseHue + this.time) % 360;
            displayBaseHue = this.currentHue;
        }

        /* ── Desvanecido al salir ──────────────────────────────────────────── */
        const currentSgModes = p.sacredGeometryModes ?? [];
        const currentResonanceModes = p.spiralResonanceModes ?? [];

        if (p.autoOffscreenFade) {
            this.prevSgModes.forEach((mode) => {
                if (!currentSgModes.includes(mode) && !this.fadingSg.find((f) => f.mode === mode)) {
                    this.fadingSg.push({ mode, opacity: 1.0, scale: 1.0 });
                }
            });
            this.fadingSg = this.fadingSg.filter((f) => {
                f.opacity -= 0.005;
                f.scale += 0.02;
                return f.opacity > 0;
            });

            this.prevResonanceModes.forEach((mode) => {
                if (!currentResonanceModes.includes(mode) && !this.fadingResonance.find((f) => f.mode === mode)) {
                    this.fadingResonance.push({ mode, opacity: 1.0, scale: 1.0 });
                }
            });
            this.fadingResonance = this.fadingResonance.filter((f) => {
                f.opacity -= 0.005;
                f.scale += 0.02;
                return f.opacity > 0;
            });
        } else {
            this.fadingSg = [];
            this.fadingResonance = [];
        }
        this.prevSgModes = currentSgModes;
        this.prevResonanceModes = currentResonanceModes;

        const allSgModesToDraw: FadingMode[] = [
            ...currentSgModes.map((m) => ({ mode: m, opacity: 1.0, scale: 1.0 })),
            ...this.fadingSg,
        ];

        /* ── CAPA DE GEOMETRÍA SAGRADA (modo "capas") ──────────────────────── */
        if (p.sacredGeometryEnabled && (p.sgDrawMode === "layers" || p.sgDrawMode === "both")) {
            allSgModesToDraw.forEach(({ mode, opacity: fadeOpacity, scale: fadeScale }, modeIndex) => {
                const settings = sgSettings[mode] ?? DEFAULT_PARAMS.sgSettings[mode];
                if (!settings) return;

                const numLayers = Math.max(1, Math.floor(settings.complexity));
                const baseRadius = Math.min(width, height) * 0.1 * settings.scale * fadeScale;
                const effectiveFlowSpeed = settings.flowSpeed * 0.5 * (1 - settings.viscosity * 0.8);
                const timeOffset = this.time * effectiveFlowSpeed;
                const effectiveReactivity = settings.audioReactivity * (1 - settings.viscosity * 0.5);
                const damping = Math.sqrt(allSgModesToDraw.length);

                for (let i = 0; i < numLayers; i++) {
                    const layerProgress = (i + (timeOffset % 1)) / numLayers;
                    const radius = Math.pow(2, layerProgress * 4) * baseRadius * (1.0 + sVol * effectiveReactivity * 0.5);

                    const layerHue = (displayBaseHue + layerProgress * p.hueRange) % 360;
                    const col = getGeometryColor(p, settings, layerHue, sVol, modeIndex, allSgModesToDraw.length);

                    let alphaMultiplier = Math.sin(layerProgress * Math.PI);
                    alphaMultiplier *= 0.3 + 0.7 * sVol * effectiveReactivity;
                    alphaMultiplier = Math.min(1.0, Math.max(0.0, alphaMultiplier));
                    if (alphaMultiplier <= 0.01) continue;

                    const rotation = this.time * 0.2 * (i % 2 === 0 ? 1 : -1) + layerProgress * Math.PI;

                    drawMode(
                        mode, ctx, cx, cy,
                        radius * (1 - modeIndex * 0.05),
                        rotation + (modeIndex * Math.PI) / allSgModesToDraw.length,
                        (col.lineOpacity * alphaMultiplier * fadeOpacity) / damping,
                        (col.bgOpacity * alphaMultiplier * fadeOpacity) / damping,
                        col.hue, col.sat, col.light, this.time,
                        sVol * effectiveReactivity, settings.thickness,
                    );
                }
            });
        }

        /* ── BUCLE FRACTAL: Zn+1 = Zn · (k · e^{iψ}) + Z0 ──────────────────── */
        const maxIter = this.opts.maxIter ? Math.min(p.iter, this.opts.maxIter) : p.iter;
        const spiralPoints: { x: number; y: number; mag: number; angle: number }[] = [];

        const allResonanceToDraw: FadingMode[] = [
            ...currentResonanceModes.map((m) => ({ mode: m, opacity: 1.0, scale: 1.0 })),
            ...this.fadingResonance,
        ];
        const resonanceDamping = Math.sqrt(Math.max(1, allResonanceToDraw.length));
        const tRes = this.time * 0.2;
        const collectPoints = p.sacredGeometryEnabled || currentResonanceModes.length > 0;

        ctx.beginPath();
        ctx.moveTo(cx + zReal * responsiveZoom, cy - zImag * responsiveZoom);

        for (let n = 0; n < maxIter; n++) {
            const zrK = zReal * dynamicK;
            const ziK = zImag * dynamicK;

            zReal = zrK * rotReal - ziK * rotImag + p.z0_r;
            zImag = zrK * rotImag + ziK * rotReal + p.z0_i;

            let px = cx + zReal * responsiveZoom;
            let py = cy - zImag * responsiveZoom;

            // Salvaguarda: coordenadas enormes o NaN reventarían el canvas 2D.
            if (
                !Number.isFinite(px) || !Number.isFinite(py) ||
                Math.abs(px - cx) > width * 2 || Math.abs(py - cy) > height * 2
            ) break;

            // Perturbación metafísica: la geometría deforma el trazo de verdad.
            if (allResonanceToDraw.length > 0) {
                let ox = 0;
                let oy = 0;
                for (const { mode, opacity: fadeOpacity, scale: fadeScale } of allResonanceToDraw) {
                    const settings = p.sgSettings[mode] ?? DEFAULT_PARAMS.sgSettings[mode];
                    if (!settings) continue;
                    const react = settings.audioReactivity * fadeOpacity * fadeScale;
                    const off = resonanceOffset(mode, px, py, cx, cy, n, tRes, sVol, react);
                    ox += off.x;
                    oy += off.y;
                }
                px += ox / resonanceDamping;
                py += oy / resonanceDamping;
            }

            ctx.lineTo(px, py);

            if (collectPoints) {
                spiralPoints.push({
                    x: px, y: py,
                    mag: Math.sqrt(zReal * zReal + zImag * zImag),
                    angle: Math.atan2(zImag, zReal),
                });
            }
        }

        /* ── Trazo (degradado + brillo) ────────────────────────────────────── */
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        const intensity = Math.min(sVol * 60, 40);
        const secHue = (displayBaseHue + p.hueRange) % 360;
        const brightnessBoost = p.geometryData?.regime === "reciprocal" ? 30 : 0;

        let baseLightness = p.brightness;
        if (p.sgAutoHarmonic) baseLightness = p.sgTheme === "dark" ? 20 : 80;

        const col1Lightness = p.sgTheme === "dark"
            ? Math.max(0, baseLightness - intensity - brightnessBoost)
            : Math.min(100, baseLightness + intensity + brightnessBoost);
        const col2Lightness = p.sgTheme === "dark"
            ? Math.min(100, baseLightness + 20 - intensity)
            : Math.max(0, baseLightness - 20 + intensity);

        const col1 = `hsl(${displayBaseHue}, ${p.saturation}%, ${col1Lightness}%)`;
        const col2 = `hsl(${secHue}, ${p.saturation}%, ${col2Lightness}%)`;
        gradient.addColorStop(0, col1);
        gradient.addColorStop(1, col2);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = (p.spiralThickness || 1.0) + sVol * 2;
        ctx.lineJoin = "round";

        if (p.brightness > 30) {
            ctx.shadowBlur = sVol * 15;
            ctx.shadowColor = col1;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        /* ── NODOS EMANANTES (modo "nodos") ────────────────────────────────── */
        if (
            p.sacredGeometryEnabled && spiralPoints.length > 0 && p.sgShowNodes &&
            (p.sgDrawMode === "nodes" || p.sgDrawMode === "both")
        ) {
            const getSpiralPoint = (t: number) => {
                const len = spiralPoints.length;
                const safeT = ((t % len) + len) % len;
                const i = Math.floor(safeT);
                const j = (i + 1) % len;
                const frac = safeT - i;
                const p1 = spiralPoints[i];
                const p2 = spiralPoints[j];
                const angleDiff = ((p2.angle - p1.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
                return {
                    x: p1.x + (p2.x - p1.x) * frac,
                    y: p1.y + (p2.y - p1.y) * frac,
                    mag: p1.mag + (p2.mag - p1.mag) * frac,
                    angle: p1.angle + angleDiff * frac,
                };
            };

            allSgModesToDraw.forEach(({ mode, opacity: fadeOpacity, scale: fadeScale }, modeIndex) => {
                const settings = sgSettings[mode] ?? DEFAULT_PARAMS.sgSettings[mode];
                if (!settings) return;

                const numNodes = Math.max(1, Math.floor(settings.complexity));
                const step = spiralPoints.length / numNodes;
                const effectiveFlowSpeed = settings.flowSpeed * 15 * (1 - settings.viscosity * 0.8);
                const timeOffset = this.time * effectiveFlowSpeed;
                const effectiveReactivity = settings.audioReactivity * (1 - settings.viscosity * 0.5);
                const damping = Math.sqrt(allSgModesToDraw.length);

                for (let i = 0; i < numNodes; i++) {
                    const pt = getSpiralPoint(timeOffset + i * step);

                    const radius =
                        Math.pow(pt.mag, 0.5) * responsiveZoom * 0.05 * settings.scale * fadeScale *
                        (1.0 + sVol * effectiveReactivity);

                    const nodeHue = (displayBaseHue + (i / numNodes) * p.hueRange * 0.5) % 360;
                    const col = getGeometryColor(p, settings, nodeHue, sVol, modeIndex, allSgModesToDraw.length);
                    const alphaMultiplier = Math.min(1.0, Math.max(0.02, 0.15 + 0.85 * sVol * effectiveReactivity));

                    drawMode(
                        mode, ctx, pt.x, pt.y,
                        radius * (1 - modeIndex * 0.05),
                        pt.angle + this.time * 0.1 + (modeIndex * Math.PI) / allSgModesToDraw.length,
                        (col.lineOpacity * alphaMultiplier * fadeOpacity) / damping,
                        (col.bgOpacity * alphaMultiplier * fadeOpacity) / damping,
                        col.hue, col.sat, col.light, this.time,
                        sVol * effectiveReactivity, settings.thickness,
                    );
                }
            });
        }
    }
}
