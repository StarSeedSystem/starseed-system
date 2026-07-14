/**
 * Audiomorphic — RENDERER (motor del espiral) · port nativo
 * ============================================================================
 * Port de `components/VisualizerCanvas.tsx` (StarSeedSystem/Audiomorphic-AR-app)
 * a una clase sin React, para que la usen IGUAL la APP y la CAPA DE FONDO.
 *
 * ── EL CAMBIO CLAVE: TRANSPARENCIA REAL ─────────────────────────────────────
 * El original es un canvas **2D** (no WebGL) y hacía DOS cosas que lo volvían
 * irremediablemente opaco:
 *
 *      const ctx = canvas.getContext('2d', { alpha: false });   // ①
 *      ctx.fillStyle = `rgba(0, 0, 0, ${p.trail})`;             // ②
 *      ctx.fillRect(0, 0, width, height);                       //   ← pinta NEGRO
 *
 *   ① `alpha: false` ⇒ el canvas NO puede tener píxeles transparentes.
 *   ② la "estela" (trail) se conseguía pintando un velo NEGRO encima cada
 *      fotograma. Con `trail: 1.0` (el defecto) eso es un rectángulo negro
 *      opaco: el fondo del canvas es negro sólido, por definición.
 *
 * Por eso el iframe jamás pudo ser transparente y hubo que recurrir a
 * `mix-blend-mode: screen` (que no compone: solo "esconde" el negro).
 *
 * **Arreglo (modo `transparent`):**
 *   ① `getContext('2d', { alpha: true })`.
 *   ② la estela deja de PINTAR negro y pasa a BORRAR alfa:
 *
 *          ctx.globalCompositeOperation = 'destination-out';
 *          ctx.fillStyle = `rgba(0,0,0,${trail})`;
 *          ctx.fillRect(0, 0, w, h);       // ← resta alfa, no añade color
 *          ctx.globalCompositeOperation = 'source-over';
 *
 *      Semántica IDÉNTICA: con `trail = 1` borra del todo (limpieza completa,
 *      sin estela); con `trail < 1` el fotograma anterior se desvanece poco a
 *      poco. La diferencia es que ahora lo que queda es **alfa 0**, es decir,
 *      transparencia AUTÉNTICA ⇒ el espiral se compone de verdad sobre las
 *      capas de debajo, sin trucos de mezcla.
 *
 * El resto (matemática, geometría sagrada, colores) es el original, intacto.
 */

import type {
    AudioMetrics,
    SacredGeometryMode,
    SacredGeometrySettings,
    VisualizerParams,
} from "./types";
import { lerpAngleDeg } from "./harmonic-math";

/* ══ DIBUJANTES DE GEOMETRÍA SAGRADA (port literal) ══════════════════════ */

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
        ctx.arc(x, y, rad, 0, Math.PI * 2);
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
    ctx.arc(0, 0, r * 3, 0, Math.PI * 2);
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
        ctx.ellipse(xOffset, yOffset, tubeRadius, tubeRadius * (0.2 + squeeze * 0.8), a + time, 0, Math.PI * 2);
        if (bgOpacity > 0) ctx.fill();
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, mainRadius, 0, Math.PI * 2);
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
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
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
        if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2 * (1 + vol), 0, Math.PI * 2);
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
        if (theta === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.restore();
}

/* ══ RENDERER ════════════════════════════════════════════════════════════ */

export interface RendererOptions {
    /**
     * TRANSPARENCIA REAL. `true` ⇒ canvas con alfa y estela por `destination-out`
     * (borra alfa en vez de pintar negro) ⇒ el espiral se compone de verdad
     * sobre las capas de abajo. Es lo que usa la CAPA DE FONDO.
     * `false` ⇒ comportamiento original (fondo negro sólido). Lo usa la APP.
     */
    transparent: boolean;
    /** Tope de iteraciones (rendimiento: "eco" baja el detalle en vez de apagar). */
    maxIter?: number;
    /** Tope de densidad de píxeles (1 en eco, devicePixelRatio en alta). */
    maxDpr?: number;
}

export class AudiomorphicRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D | null;
    private opts: RendererOptions;

    // Estado persistente del bucle (eran useRef en el original)
    private time = 0;
    private currentHue: number;
    private smoothedVol = 0;
    private smoothedFreq = 0;

    // Tamaño lógico (CSS px)
    private width = 0;
    private height = 0;

    constructor(canvas: HTMLCanvasElement, opts: RendererOptions, initialHue = 200) {
        this.canvas = canvas;
        this.opts = opts;
        this.currentHue = initialHue;
        // ⚠️ `alpha` decide la transparencia REAL del canvas. Solo se puede fijar
        // al crear el contexto: por eso el componente remonta el <canvas> si el
        // modo cambia (ver audiomorphic-canvas.tsx).
        this.ctx = canvas.getContext("2d", { alpha: opts.transparent });
    }

    /** Reajusta el búfer al tamaño real. Llamar desde el ResizeObserver. */
    resize(width: number, height: number): void {
        if (width <= 0 || height <= 0) return;
        const dpr = Math.min(
            typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
            this.opts.maxDpr ?? 2,
        );
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        // El transform se fija aquí (no `scale()` acumulativo, que en el original
        // se duplicaba en cada resize y deformaba el trazo).
        this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = width;
        this.height = height;
    }

    /** Limpia el lienzo entero (respetando la transparencia). */
    clear(): void {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    /**
     * Pinta UN fotograma. `params` incluye ya los valores del piloto automático.
     * `metrics` viene del micrófono (o silencio si no hay permiso).
     */
    render(params: VisualizerParams, metrics: AudioMetrics): void {
        const ctx = this.ctx;
        if (!ctx || this.width <= 0 || this.height <= 0) return;

        const p = params;
        const { volume, frequency } = metrics;

        // Suavizado del audio (movimiento orgánico)
        this.smoothedVol += (volume - this.smoothedVol) * 0.05;
        this.smoothedFreq += (frequency - this.smoothedFreq) * 0.05;
        const sVol = this.smoothedVol;
        const sFreq = this.smoothedFreq;

        const width = this.width;
        const height = this.height;
        const cx = width / 2;
        const cy = height / 2;

        // ── AUTO-RESONANCIA (ajustes vivos de la geometría sagrada) ──
        let currentSgSettings = p.sgSettings;
        if (p.autoPilotMode === "genesis" && p.sgAutoResonance) {
            const t = this.time;
            currentSgSettings = { ...p.sgSettings };
            const modes: SacredGeometryMode[] = ["goldenSpiral", "flowerOfLife", "quantumWave", "torus"];

            modes.forEach((mode, i) => {
                const phi = 1.6180339;
                const phase = i * phi * Math.PI;

                const slowOsc = Math.sin(t * 0.02 + phase);
                const midOsc = Math.cos(t * 0.05 + phase * phi);
                const fastOsc = Math.sin(t * 0.1 + phase / phi);

                const complexity = Math.max(2, Math.min(4, Math.floor(3 + slowOsc + sVol * 1.5)));
                const scale = 0.1 + sVol * 0.03 + midOsc * 0.02;

                const activeCount = p.sgResonanceModes?.length || 1;
                const opacityDamping = Math.sqrt(activeCount);

                const lineOpacity = (0.4 + sVol * 0.2 + fastOsc * 0.1) / opacityDamping;
                const bgOpacity = (0.08 + sVol * 0.04 + slowOsc * 0.02) / opacityDamping;
                const thickness = 0.1 + sVol * 0.05 + (sFreq > 0.8 ? 0.05 : 0);
                const flowSpeed = 0.2 + slowOsc * 0.05 + midOsc * 0.05;
                const audioReactivity = 4.0 + sFreq * 2.0;

                currentSgSettings[mode] = {
                    complexity,
                    connectionSpan: Math.floor(100 + slowOsc * 20),
                    scale: Math.max(0.05, scale),
                    lineOpacity: Math.max(0.1, Math.min(1.0, lineOpacity)),
                    bgOpacity: Math.max(0.0, Math.min(1.0, bgOpacity)),
                    thickness: Math.max(0.05, thickness),
                    flowSpeed,
                    audioReactivity,
                } satisfies SacredGeometrySettings;
            });
        }

        // ── ESTELA / LIMPIEZA — aquí vive la transparencia real ──
        if (this.opts.transparent) {
            // BORRA alfa (no pinta negro): lo que queda es transparencia auténtica.
            ctx.globalCompositeOperation = "destination-out";
            ctx.fillStyle = `rgba(0, 0, 0, ${p.trail})`;
            ctx.fillRect(0, 0, width, height);
            ctx.globalCompositeOperation = "source-over";
        } else {
            // Comportamiento ORIGINAL: velo negro (fondo opaco).
            ctx.fillStyle = `rgba(0, 0, 0, ${p.trail})`;
            ctx.fillRect(0, 0, width, height);
        }

        // ── CÁLCULOS DINÁMICOS ──
        const kPulse = p.k - 1 + sVol * 0.005;
        const dynamicK = 1.0 + kPulse;
        const dynamicPsi = p.psi + sFreq * 0.05;

        const minDim = Math.min(width, height);
        const responsiveZoom = p.zoom * minDim;

        const rotReal = Math.cos(dynamicPsi);
        const rotImag = Math.sin(dynamicPsi);

        let zReal = 1.0 + sVol * 0.2;
        let zImag = 0.0;

        const timeSpeed = p.autoPilotMode === "genesis" ? p.hueSpeed * 0.2 : p.hueSpeed;
        this.time += timeSpeed;

        // ── COLOR ──
        let displayBaseHue: number;
        if (p.harmonicColor || p.autoPilotMode !== "drift") {
            let targetHue = p.baseHue;
            if (p.harmonicColor) {
                const logFreq = Math.log2(1 + sFreq * 32) / 5;
                const hueOffset = logFreq * 360 * (p.harmonicSensitivity || 1);
                targetHue = (p.baseHue + hueOffset) % 360;
            }
            this.currentHue = lerpAngleDeg(this.currentHue, targetHue, 0.05);
            displayBaseHue = this.currentHue;
        } else {
            this.currentHue = (p.baseHue + this.time) % 360;
            displayBaseHue = this.currentHue;
        }

        const spiralPoints: { x: number; y: number; mag: number; angle: number }[] = [];

        // ── CAPAS DE GEOMETRÍA SAGRADA (fondo del espiral) ──
        if (p.autoPilotMode === "genesis" && p.geometryData && p.sgDrawMode === "layers") {
            const modes = p.sgResonanceModes || ["flowerOfLife"];
            const activeModes: SacredGeometryMode[] = modes.length > 0 ? modes : ["flowerOfLife"];

            activeModes.forEach((mode, modeIndex) => {
                const settings = currentSgSettings[mode];
                const numLayers = Math.max(1, Math.floor(settings.complexity));
                const baseRadius = Math.min(width, height) * 0.1 * settings.scale;
                const flowSpeed = settings.flowSpeed * 0.5;
                const timeOffset = this.time * flowSpeed;

                const regime = p.geometryData!.regime;
                const baseLightness = regime === "reciprocal" ? p.brightness + 30 : p.brightness + 15;

                for (let i = 0; i < numLayers; i++) {
                    const layerProgress = (i + (timeOffset % 1)) / numLayers;
                    const scale = Math.pow(2, layerProgress * 4) * baseRadius;
                    const radius = scale * (1.0 + sVol * settings.audioReactivity * 0.5);

                    const hueOffset = layerProgress * p.hueRange;
                    const layerHue = (displayBaseHue + hueOffset) % 360;
                    const layerLightness = Math.min(100, baseLightness + sVol * 40 * settings.audioReactivity);

                    let alphaMultiplier = Math.sin(layerProgress * Math.PI);
                    alphaMultiplier *= 0.3 + 0.7 * sVol * settings.audioReactivity;
                    alphaMultiplier = Math.min(1.0, Math.max(0.0, alphaMultiplier));

                    const rotation = this.time * 0.2 * (i % 2 === 0 ? 1 : -1) + layerProgress * Math.PI;

                    if (alphaMultiplier > 0.01) {
                        const modeRotation = rotation + (modeIndex * Math.PI) / activeModes.length;
                        const modeRadius = radius * (1 - modeIndex * 0.05);
                        const modeHue = (layerHue + modeIndex * 30) % 360;

                        const lineOpacity = (settings.lineOpacity * alphaMultiplier) / Math.sqrt(activeModes.length);
                        const bgOpacity = (settings.bgOpacity * alphaMultiplier) / Math.sqrt(activeModes.length);

                        if (mode === "flowerOfLife") {
                            drawSeedOfLife(ctx, cx, cy, modeRadius, modeRotation, lineOpacity, bgOpacity, modeHue, p.saturation, layerLightness, sVol * settings.audioReactivity, settings.thickness);
                        } else if (mode === "torus") {
                            drawTorus(ctx, cx, cy, modeRadius, modeRotation, lineOpacity, bgOpacity, modeHue, p.saturation, layerLightness, this.time, sVol * settings.audioReactivity, settings.thickness);
                        } else if (mode === "quantumWave") {
                            drawQuantumCloud(ctx, cx, cy, modeRadius, this.time, sVol * settings.audioReactivity, lineOpacity, bgOpacity, modeHue, p.saturation, layerLightness, settings.thickness);
                        } else if (mode === "goldenSpiral") {
                            drawGoldenSpiral(ctx, cx, cy, modeRadius, modeRotation, lineOpacity, bgOpacity, modeHue, p.saturation, layerLightness, sVol * settings.audioReactivity, settings.thickness);
                        }
                    }
                }
            });
        }

        // ── BUCLE FRACTAL — la espiral:  Zn+1 = Zn · (k · e^{iψ}) + Z0 ──
        const iterCount = Math.min(p.iter, this.opts.maxIter ?? p.iter);

        ctx.beginPath();
        ctx.moveTo(cx + zReal * responsiveZoom, cy - zImag * responsiveZoom);

        for (let n = 0; n < iterCount; n++) {
            const zrK = zReal * dynamicK;
            const ziK = zImag * dynamicK;

            let nextReal = zrK * rotReal - ziK * rotImag;
            let nextImag = zrK * rotImag + ziK * rotReal;

            nextReal += p.z0_r;
            nextImag += p.z0_i;

            zReal = nextReal;
            zImag = nextImag;

            let px = cx + zReal * responsiveZoom;
            let py = cy - zImag * responsiveZoom;

            // Perturbación metafísica (modo Génesis)
            if (p.autoPilotMode === "genesis") {
                const t = this.time * 0.2;
                const modes = p.sgResonanceModes || ["flowerOfLife"];
                const activeModes: SacredGeometryMode[] = modes.length > 0 ? modes : ["flowerOfLife"];

                let totalOffsetX = 0;
                let totalOffsetY = 0;

                activeModes.forEach((mode) => {
                    const settings = p.sgSettings[mode];
                    const react = settings.audioReactivity;
                    if (mode === "goldenSpiral") {
                        const angle = Math.atan2(py - cy, px - cx);
                        const offset = Math.sin(angle * 1.6180339 - t) * 10 * sVol * react;
                        totalOffsetX += Math.cos(angle) * offset;
                        totalOffsetY += Math.sin(angle) * offset;
                    } else if (mode === "quantumWave") {
                        const wave = Math.sin(n * 0.1 - t) * Math.cos(n * 0.05 + t);
                        totalOffsetX += wave * 15 * sVol * react;
                        totalOffsetY -= wave * 15 * sVol * react;
                    } else if (mode === "flowerOfLife") {
                        const angle = Math.atan2(py - cy, px - cx);
                        const hex = Math.cos(angle * 6 + t) * 12 * sVol * react;
                        totalOffsetX += Math.cos(angle) * hex;
                        totalOffsetY += Math.sin(angle) * hex;
                    } else if (mode === "torus") {
                        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
                        const fold = Math.sin(dist * 0.01 - t * 2) * 10 * sVol * react;
                        const angle = Math.atan2(py - cy, px - cx);
                        totalOffsetX += Math.cos(angle) * fold;
                        totalOffsetY += Math.sin(angle) * fold;
                    }
                });

                px += totalOffsetX / Math.sqrt(activeModes.length);
                py += totalOffsetY / Math.sqrt(activeModes.length);
            }

            ctx.lineTo(px, py);

            if (p.autoPilotMode === "genesis") {
                const mag = Math.sqrt(zReal * zReal + zImag * zImag);
                const angle = Math.atan2(zImag, zReal);
                spiralPoints.push({ x: px, y: py, mag, angle });
            }
        }

        // ── TRAZO ──
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        const intensity = Math.min(sVol * 60, 40);
        const secHue = (displayBaseHue + p.hueRange) % 360;
        const brightnessBoost = p.geometryData?.regime === "reciprocal" ? 30 : 0;

        const col1 = `hsl(${displayBaseHue}, ${p.saturation}%, ${Math.min(100, p.brightness + intensity + brightnessBoost)}%)`;
        const col2 = `hsl(${secHue}, ${p.saturation}%, ${Math.max(0, p.brightness - 20 + intensity)}%)`;

        gradient.addColorStop(0, col1);
        gradient.addColorStop(1, col2);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1 + sVol * 2;
        ctx.lineJoin = "round";

        if (p.brightness > 30) {
            ctx.shadowBlur = sVol * 15;
            ctx.shadowColor = col1;
        }

        ctx.stroke();
        ctx.shadowBlur = 0;

        // ── NODOS DE GEOMETRÍA SAGRADA (modo "nodes") ──
        if (p.autoPilotMode === "genesis" && p.geometryData && spiralPoints.length > 0
            && p.sgDrawMode === "nodes" && p.sgShowNodes) {
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

            const modes = p.sgResonanceModes || ["flowerOfLife"];
            const activeModes: SacredGeometryMode[] = modes.length > 0 ? modes : ["flowerOfLife"];

            activeModes.forEach((mode, modeIndex) => {
                const settings = currentSgSettings[mode];
                const numNodes = Math.max(1, Math.floor(settings.complexity));
                const step = spiralPoints.length / numNodes;

                const flowSpeed = settings.flowSpeed * 15;
                const timeOffset = this.time * flowSpeed;

                for (let i = 0; i < numNodes; i++) {
                    const pt1 = getSpiralPoint(timeOffset + i * step);

                    let radius = Math.pow(pt1.mag, 0.5) * responsiveZoom * 0.05 * settings.scale;
                    radius *= 1.0 + sVol * settings.audioReactivity;

                    const hueOffset = (i / numNodes) * p.hueRange * 0.5;
                    const nodeHue = (displayBaseHue + hueOffset) % 360;

                    const regime = p.geometryData!.regime;
                    const baseLightness = regime === "reciprocal" ? p.brightness + 30 : p.brightness + 15;
                    const nodeLightness = Math.min(100, baseLightness + sVol * 40 * settings.audioReactivity);

                    let alphaMultiplier = 0.15 + 0.85 * sVol * settings.audioReactivity;
                    alphaMultiplier = Math.min(1.0, Math.max(0.02, alphaMultiplier));

                    const rotation = pt1.angle + this.time * 0.1;
                    const modeRotation = rotation + (modeIndex * Math.PI) / activeModes.length;
                    const modeRadius = radius * (1 - modeIndex * 0.05);
                    const modeHueFinal = (nodeHue + modeIndex * 30) % 360;

                    const lineOpacity = (settings.lineOpacity * alphaMultiplier) / Math.sqrt(activeModes.length);
                    const bgOpacity = (settings.bgOpacity * alphaMultiplier) / Math.sqrt(activeModes.length);

                    if (mode === "flowerOfLife") {
                        drawSeedOfLife(ctx, pt1.x, pt1.y, modeRadius, modeRotation, lineOpacity, bgOpacity, modeHueFinal, p.saturation, nodeLightness, sVol * settings.audioReactivity, settings.thickness);
                    } else if (mode === "torus") {
                        drawTorus(ctx, pt1.x, pt1.y, modeRadius, modeRotation, lineOpacity, bgOpacity, modeHueFinal, p.saturation, nodeLightness, this.time, sVol * settings.audioReactivity, settings.thickness);
                    } else if (mode === "quantumWave") {
                        drawQuantumCloud(ctx, pt1.x, pt1.y, modeRadius, this.time, sVol * settings.audioReactivity, lineOpacity, bgOpacity, modeHueFinal, p.saturation, nodeLightness, settings.thickness);
                    } else if (mode === "goldenSpiral") {
                        drawGoldenSpiral(ctx, pt1.x, pt1.y, modeRadius, modeRotation, lineOpacity, bgOpacity, modeHueFinal, p.saturation, nodeLightness, sVol * settings.audioReactivity, settings.thickness);
                    }
                }
            });
        }

        // ── HUD del régimen (solo en la APP; el fondo nunca pinta texto) ──
        if (p.geometryData && p.autoPilotMode !== "drift" && p.showIndicators) {
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.font = "10px monospace";
            ctx.fillText(
                `${p.geometryData.name} [α:${p.geometryData.alpha.toFixed(1)} β:${p.geometryData.beta.toFixed(2)}]`,
                20,
                height - 20,
            );
        }
    }
}
