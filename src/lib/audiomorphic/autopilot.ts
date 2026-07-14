/**
 * Audiomorphic — PILOTO AUTOMÁTICO COMPLETO (Adenda 69 · K)
 * ============================================================================
 * Port del `updateLoop` de `App.tsx` de la repo CORRECTA
 * (github.com/alexbordongarrigos/audiomorphic-ar) a una clase sin React.
 *
 * ⚠️ El piloto de la Adenda 68·E venía de la repo equivocada y era un muñón:
 * 3 modos con una física de juguete. El REAL tiene además:
 *   · **8 parámetros** pilotados (k · ψ · z0r · z0i · tono · zoom · distancia ·
 *     grosor), no 5.
 *   · **Bandas de audio** (graves/medios/agudos) ⇒ detección de golpe y caja.
 *   · **Modos de aleatorización** con física propia: sagrado · rítmico ·
 *     inteligente/DJ/arcoíris/astral/deriva.
 *   · **Autorregeneración**: instantánea / suave / a medida, con retardo, búfer
 *     de resonancia y *nivelador de proporción*.
 *   · **Relación** con la música: empática · técnica · rítmica.
 *   · **Bloqueo por parámetro** (`lockedParams`): lo que el usuario fija, el
 *     piloto NO lo toca. Nunca.
 *
 * ── Diferencia deliberada con el original ───────────────────────────────────
 * Allí el piloto hacía `setParams()` en CADA fotograma (60 renders de React por
 * segundo). Aquí es un objeto mutable que el bucle de dibujo consulta: mismo
 * resultado visual, sin re-render por fotograma. Es lo que permite que la CAPA
 * DE FONDO no cueste nada en la UI del OS.
 *
 * Como el estado vivo NO vuelve a React, la detección de "el usuario ha movido
 * un deslizador" no puede hacerse comparando con lo emitido (allí sí volvía).
 * Aquí se compara con la ÚLTIMA FOTO de los parámetros del usuario (`seen`):
 * si un valor cambia por fuera del piloto, es que lo ha tocado él ⇒ se re-ancla.
 */

import {
    GENESIS_STAGES,
    calculateHarmonicGeometry,
    harmonicShapeForInterval,
    lerp,
    lerpAngle,
} from "./harmonic-math";
import type { AudioMetrics, GeometryInfo, VisualizerParams } from "./types";
import { DEFAULT_PARAMS } from "./types";

/** Interpolación de ángulos en GRADOS por el camino más corto (tono). */
const lerpAngleDegrees = (start: number, end: number, amt: number): number => {
    const d = end - start;
    const delta = ((((d + 180) % 360) + 360) % 360) - 180;
    return start + delta * amt;
};

const rnd = () => Math.random();
const coin = () => (Math.random() > 0.5 ? 1 : -1);

export class AudiomorphicAutopilot {
    /* Objetivos */
    private targetK: number;
    private targetPsi: number;
    private targetZ0r: number;
    private targetZ0i: number;
    private targetHue: number;
    private targetZoom: number;
    private targetDistanceZoom: number;
    private targetSpiralThickness: number;

    /* Valores base (antes de los pulsos del fotograma) */
    private curK: number;
    private curPsi: number;
    private curZ0r: number;
    private curZ0i: number;
    private curHue: number;
    private curZoom: number;
    private curDistanceZoom: number;
    private curSpiralThickness: number;

    /* Última foto de los parámetros del usuario (para detectar cambios manuales) */
    private seen: Partial<VisualizerParams> = {};

    private lastBeatTime = 0;
    private genesisTargetStage = 0;

    /** Valores VIVOS que el renderer lee cada fotograma. */
    public k: number;
    public psi: number;
    public z0_r: number;
    public z0_i: number;
    public baseHue: number;
    public zoom: number;
    public distanceZoom: number;
    public spiralThickness: number;
    public geometryData: GeometryInfo | undefined;

    constructor(p: VisualizerParams) {
        this.curK = this.targetK = this.k = p.k;
        this.curPsi = this.targetPsi = this.psi = p.psi;
        this.curZ0r = this.targetZ0r = this.z0_r = p.z0_r;
        this.curZ0i = this.targetZ0i = this.z0_i = p.z0_i;
        this.curHue = this.targetHue = this.baseHue = p.baseHue;
        this.curZoom = this.targetZoom = this.zoom = p.zoom;
        this.curDistanceZoom = this.targetDistanceZoom = this.distanceZoom = p.distanceZoom;
        this.curSpiralThickness = this.targetSpiralThickness = this.spiralThickness = p.spiralThickness;
        this.snapshot(p);
    }

    private snapshot(p: VisualizerParams): void {
        this.seen = {
            k: p.k, psi: p.psi, z0_r: p.z0_r, z0_i: p.z0_i, baseHue: p.baseHue,
            zoom: p.zoom, distanceZoom: p.distanceZoom, spiralThickness: p.spiralThickness,
            targetK: p.targetK, targetPsi: p.targetPsi, targetZ0_r: p.targetZ0_r,
            targetZ0_i: p.targetZ0_i, targetBaseHue: p.targetBaseHue,
            targetZoom: p.targetZoom, targetDistanceZoom: p.targetDistanceZoom,
            targetSpiralThickness: p.targetSpiralThickness,
        };
    }

    /**
     * ¿El usuario ha movido algo a mano? Entonces el piloto se re-ancla ahí.
     * (En el original esto se detectaba comparando con lo emitido; aquí el
     * estado vivo no vuelve a React, así que se compara con la foto anterior.)
     */
    private absorbManual(p: VisualizerParams): void {
        const s = this.seen;
        const moved = (a: number | undefined, b: number, eps = 1e-6) => a === undefined || Math.abs(a - b) > eps;

        if (moved(s.k, p.k)) { this.targetK = p.k; this.curK = p.k; }
        if (moved(s.psi, p.psi)) { this.targetPsi = p.psi; this.curPsi = p.psi; }
        if (moved(s.z0_r, p.z0_r)) { this.targetZ0r = p.z0_r; this.curZ0r = p.z0_r; }
        if (moved(s.z0_i, p.z0_i)) { this.targetZ0i = p.z0_i; this.curZ0i = p.z0_i; }
        if (moved(s.baseHue, p.baseHue)) { this.targetHue = p.baseHue; this.curHue = p.baseHue; }
        if (moved(s.zoom, p.zoom)) { this.targetZoom = p.zoom; this.curZoom = p.zoom; }
        if (moved(s.distanceZoom, p.distanceZoom)) { this.targetDistanceZoom = p.distanceZoom; this.curDistanceZoom = p.distanceZoom; }
        if (moved(s.spiralThickness, p.spiralThickness)) { this.targetSpiralThickness = p.spiralThickness; this.curSpiralThickness = p.spiralThickness; }

        // Objetivos que escribe el panel (aleatorizador / presets con transición).
        if (p.targetK !== undefined && p.targetK !== s.targetK) this.targetK = p.targetK;
        if (p.targetPsi !== undefined && p.targetPsi !== s.targetPsi) this.targetPsi = p.targetPsi;
        if (p.targetZ0_r !== undefined && p.targetZ0_r !== s.targetZ0_r) this.targetZ0r = p.targetZ0_r;
        if (p.targetZ0_i !== undefined && p.targetZ0_i !== s.targetZ0_i) this.targetZ0i = p.targetZ0_i;
        if (p.targetBaseHue !== undefined && p.targetBaseHue !== s.targetBaseHue) this.targetHue = p.targetBaseHue;
        if (p.targetZoom !== undefined && p.targetZoom !== s.targetZoom) this.targetZoom = p.targetZoom;
        if (p.targetDistanceZoom !== undefined && p.targetDistanceZoom !== s.targetDistanceZoom) this.targetDistanceZoom = p.targetDistanceZoom;
        if (p.targetSpiralThickness !== undefined && p.targetSpiralThickness !== s.targetSpiralThickness) this.targetSpiralThickness = p.targetSpiralThickness;

        this.snapshot(p);
    }

    /** Un paso del piloto. Muta el estado interno; no toca el DOM ni React. */
    step(p: VisualizerParams, metrics: AudioMetrics, viewport?: { width: number; height: number }): void {
        this.absorbManual(p);

        const { volume, frequency, bass, mid, treble } = metrics;
        const now = Date.now();
        const locked = (key: string) => p.lockedParams?.includes(key) === true;

        // Normalización de proporciones en móvil (el original la calcula igual).
        const w = viewport?.width ?? (typeof window !== "undefined" ? window.innerWidth : 1280);
        const h = viewport?.height ?? (typeof window !== "undefined" ? window.innerHeight : 720);
        const minDim = Math.min(w, h);
        const scaleFactor = minDim < 640 ? minDim / 800 : 1.0;

        let geometryData: GeometryInfo | undefined;

        let pulseK = 0, pulsePsi = 0, pulseZ0r = 0, pulseZ0i = 0;
        let pulseHue = 0, pulseZoom = 0, pulseDistanceZoom = 0, pulseSpiralThickness = 0;

        const speed = p.autoSpeed ?? 1.0;

        if (p.autoPilotMode === "genesis") {
            /* ── GÉNESIS: la energía del sonido escala la creación ─────────── */
            const emotionSens = p.autoEmotionSensitivity ?? 0.5;
            const energy = (volume + bass * 0.3 + mid * 0.2 + treble * 0.1) * (0.5 + emotionSens);

            let stageIdx = 0;
            if (energy < 0.05) stageIdx = 0;        // Vacío
            else if (energy < 0.15) stageIdx = 1;   // Vesica
            else if (energy < 0.30) stageIdx = 2;   // Semilla
            else if (energy < 0.45) stageIdx = 3;   // Huevo
            else if (energy < 0.60) stageIdx = 4;   // Flor
            else if (energy < 0.75) stageIdx = 5;   // Fruto
            else stageIdx = 6;                      // Metatrón

            if (Math.abs(stageIdx - this.genesisTargetStage) > 0.1) this.genesisTargetStage = stageIdx;

            const stage = GENESIS_STAGES[this.genesisTargetStage];
            const math = calculateHarmonicGeometry(stage.V, stage.E);
            const breathing = 1.0 + volume * 0.015 * (emotionSens * 2);

            this.targetPsi = math.psi;
            this.targetK = math.k * breathing;
            this.targetZ0r = 0;
            this.targetZ0i = 0;

            if (math.regime === "primary") this.targetHue = 200 - this.genesisTargetStage * 10;
            else if (math.regime === "reciprocal") this.targetHue = 0 + this.genesisTargetStage * 5;
            else this.targetHue = 240;

            geometryData = {
                V: stage.V, E: stage.E, alpha: math.alpha, beta: math.beta,
                regime: math.regime, name: stage.name,
            };

            pulseZoom += volume * 0.0002;
            pulseDistanceZoom += volume * 0.05 * scaleFactor;
            pulseSpiralThickness += bass * 0.04 * scaleFactor;
            pulseK += bass * 0.005;
            pulseZ0r += coin() * (mid * 0.01);
            pulseZ0i += coin() * (treble * 0.01);
            pulsePsi += mid * 0.0005 * speed;
            pulseHue += volume * 0.5 * speed;
        } else if (p.autoPilotMode === "harmonic") {
            /* ── ARMÓNICO: la nota dominante elige el polígono ─────────────── */
            const emotionSens = p.autoEmotionSensitivity ?? 0.5;
            const noteIndex = Math.floor(frequency * 36) % 12;
            const interval = Math.abs(noteIndex - p.rootNote) % 12;
            const { V, E, name } = harmonicShapeForInterval(interval);

            const math = calculateHarmonicGeometry(V, E);
            const breathing = 1.0 + volume * 0.012 * (emotionSens * 2);

            this.targetPsi = math.psi;
            this.targetK = math.k * breathing;
            this.targetHue = (noteIndex * 30) % 360;
            this.targetZ0r = 0;
            this.targetZ0i = 0;

            geometryData = { V, E, alpha: math.alpha, beta: math.beta, regime: math.regime, name };

            pulseZoom += volume * 0.0002;
            pulseDistanceZoom += volume * 0.05 * scaleFactor;
            pulseSpiralThickness += bass * 0.04 * scaleFactor;
            pulseK += bass * 0.005;
            pulseZ0r += coin() * (mid * 0.01);
            pulseZ0i += coin() * (treble * 0.01);
            pulsePsi += mid * 0.0005 * speed;
            pulseHue += volume * 0.5 * speed;
        } else {
            /* ── DERIVA + MODOS DE ALEATORIZACIÓN ──────────────────────────── */
            const empathetic = p.autoRelationshipMode === "empathetic";
            const emotionSens = empathetic ? (p.autoEmotionSensitivity ?? 0.5) : 0.5;
            const fluidity = empathetic ? (p.autoStyleFluidity ?? 0.5) : 0.5;

            // Retardo entre disparos (instantáneo / a medida / inteligente)
            let beatCooldown = 0;
            if (p.autoTimeDelayMode === "custom") beatCooldown = p.autoTimeDelay * 1000;
            else if (p.autoTimeDelayMode === "smart") beatCooldown = (3000 - fluidity * 2000) / Math.max(0.1, speed);

            if (p.autoRandomMode === "sacred") {
                const isHarmonic = mid > 0.4 && treble < 0.8 && volume > 0.2;
                const isDeepResonance = bass > 0.6 && volume > 0.4;

                if ((isHarmonic || isDeepResonance) && now - this.lastBeatTime > beatCooldown) {
                    this.lastBeatTime = now;
                    this.targetPsi += (Math.PI / 4) * (isDeepResonance ? 0.5 : 1.0);
                    this.targetK += (rnd() - 0.5) * 0.01 * emotionSens;
                    this.targetZoom += (rnd() - 0.5) * 0.001 * emotionSens;
                    this.targetDistanceZoom += (rnd() - 0.5) * 0.5 * emotionSens;
                    this.targetSpiralThickness += (rnd() - 0.5) * 0.2 * emotionSens;
                }
                pulsePsi += mid * 0.0002 * (0.5 + emotionSens) * speed;
                pulseHue += (0.1 + fluidity * 0.2) * speed;
                pulseZoom += volume * 0.0002;
                pulseDistanceZoom += volume * 0.05;
                pulseSpiralThickness += bass * 0.05;
                pulseK += bass * 0.003;
                pulseZ0r += coin() * (mid * 0.005);
                pulseZ0i += coin() * (treble * 0.005);
            } else if (p.autoRandomMode === "rhythmic") {
                const isBeat = bass > 0.6;
                const isSnare = treble > 0.6 && mid > 0.5;

                if ((isBeat || isSnare) && now - this.lastBeatTime > beatCooldown) {
                    this.lastBeatTime = now;
                    this.targetPsi += (Math.PI / 2) * (isBeat ? 1 : -1);
                    this.targetK += coin() * (volume * 0.04);
                    this.targetZoom += coin() * (volume * 0.0015);
                    this.targetDistanceZoom += coin() * (volume * 0.8);
                    this.targetSpiralThickness += coin() * (volume * 0.5);
                    if (isSnare) {
                        this.targetZ0r += (rnd() - 0.5) * 0.5 * emotionSens;
                        this.targetZ0i += (rnd() - 0.5) * 0.5 * emotionSens;
                    }
                }
                pulsePsi += mid * 0.002 * speed;
                pulseHue += volume * 3.0 * speed;
                pulseZoom += volume * 0.0005;
                pulseDistanceZoom += volume * 0.1;
                pulseSpiralThickness += bass * 0.1;
                pulseK += bass * 0.01;
                pulseZ0r += coin() * (mid * 0.02);
                pulseZ0i += coin() * (treble * 0.02);
            } else {
                // Deriva / Inteligente / DJ / Arcoíris / Astral
                const technical = p.autoRelationshipMode === "technical";
                const isBeat = empathetic
                    ? bass > 0.6 - emotionSens * 0.4 || volume > 0.7 - emotionSens * 0.3
                    : bass > 0.6 || volume > 0.7;

                if (isBeat && now - this.lastBeatTime > beatCooldown) {
                    this.lastBeatTime = now;
                    this.targetPsi += rnd() * Math.PI * 0.5;
                    this.targetZoom += (rnd() * 0.002 - 0.001) * emotionSens;
                    this.targetDistanceZoom += (rnd() * 1.0 - 0.5) * emotionSens;
                    this.targetSpiralThickness += (rnd() * 0.5 - 0.25) * emotionSens;

                    if (technical) {
                        this.targetK += coin() * (volume * 0.02);
                        this.targetZ0r += coin() * (frequency * 0.2);
                        this.targetZ0i += coin() * (volume * 0.2);
                    } else {
                        if (rnd() < fluidity) this.targetK += (rnd() * 0.02 - 0.01) * emotionSens;
                        if (rnd() < fluidity * 0.5) {
                            this.targetZ0r += (rnd() * 0.2 - 0.1) * emotionSens;
                            this.targetZ0i += (rnd() * 0.2 - 0.1) * emotionSens;
                        }
                    }
                }

                if (technical) {
                    pulsePsi += mid * 0.001 * speed;
                    pulseHue += volume * 2.0 * speed;
                    pulseZoom += volume * 0.0005;
                    pulseDistanceZoom += volume * 0.1;
                    pulseSpiralThickness += bass * 0.05;
                    pulseK += bass * 0.005;
                    pulseZ0r += coin() * (mid * 0.01);
                    pulseZ0i += coin() * (treble * 0.01);
                } else {
                    pulsePsi += mid * 0.0005 * (0.5 + emotionSens) * speed;
                    pulseHue += (0.2 + fluidity * 0.5) * (0.5 + emotionSens) * speed;
                    pulseZoom += volume * 0.0002;
                    pulseDistanceZoom += volume * 0.05;
                    pulseSpiralThickness += bass * 0.02;
                    pulseK += bass * 0.002;
                    pulseZ0r += coin() * (mid * 0.005);
                    pulseZ0i += coin() * (treble * 0.005);
                }
            }
        }

        /* ── FÍSICA Y REGENERACIÓN ─────────────────────────────────────────── */
        let alpha: number;
        if (p.autoParamRegenMode === "custom") {
            const delayFrames = Math.max(1, p.autoParamRegenDelay * 60);
            const bufferFactor = 1.0 + volume * (p.autoParamRegenBuffer / 100);
            alpha = Math.min(1.0, (1.0 / delayFrames) * bufferFactor);
        } else if (p.autoParamRegenMode === "instant") {
            alpha = 1.0;
        } else {
            const viscosity = p.autoViscosity ?? 0.96;
            const fluidity = p.autoStyleFluidity ?? 0.5;
            const emotionSens = p.autoEmotionSensitivity ?? 0.5;
            alpha = (1 - viscosity) * 0.05 * (0.5 + fluidity * 1.5);
            if (volume > 0.3) alpha *= 1.0 + emotionSens;
        }

        const ratioLeveler = (p.autoParamRatioLeveler ?? 50) / 100;
        const adjustedAlpha = alpha * (1.0 - ratioLeveler);

        // Fuerza suave de centrado: impide quedarse clavado en los extremos.
        if (p.autoPilotMode === "drift") {
            this.targetK += (DEFAULT_PARAMS.k - this.targetK) * 0.005;
            this.targetZ0r += (0 - this.targetZ0r) * 0.005;
            this.targetZ0i += (0 - this.targetZ0i) * 0.005;
            this.targetZoom += (DEFAULT_PARAMS.zoom - this.targetZoom) * 0.005;
            this.targetDistanceZoom += (DEFAULT_PARAMS.distanceZoom - this.targetDistanceZoom) * 0.005;
            this.targetSpiralThickness += (DEFAULT_PARAMS.spiralThickness - this.targetSpiralThickness) * 0.005;
        } else {
            this.targetZoom += (DEFAULT_PARAMS.zoom - this.targetZoom) * 0.002;
            this.targetDistanceZoom += (DEFAULT_PARAMS.distanceZoom - this.targetDistanceZoom) * 0.002;
            this.targetSpiralThickness += (DEFAULT_PARAMS.spiralThickness - this.targetSpiralThickness) * 0.002;
        }

        // Topes: que los objetivos no se vayan a los extremos.
        this.targetK = Math.max(0.985, Math.min(1.015, this.targetK));
        this.targetZ0r = Math.max(-1.5, Math.min(1.5, this.targetZ0r));
        this.targetZ0i = Math.max(-1.5, Math.min(1.5, this.targetZ0i));
        this.targetZoom = Math.max(0.0005, Math.min(0.005, this.targetZoom));
        this.targetDistanceZoom = Math.max(0.1, Math.min(3.0, this.targetDistanceZoom));
        this.targetSpiralThickness = Math.max(0.1, Math.min(5.0, this.targetSpiralThickness));

        // Interpolación hacia los objetivos (respetando los bloqueos del usuario).
        if (!locked("k")) this.curK = lerp(this.curK, this.targetK, adjustedAlpha);
        if (!locked("psi")) this.curPsi = lerpAngle(this.curPsi, this.targetPsi, adjustedAlpha);
        if (!locked("z0_r")) this.curZ0r = lerp(this.curZ0r, this.targetZ0r, adjustedAlpha);
        if (!locked("z0_i")) this.curZ0i = lerp(this.curZ0i, this.targetZ0i, adjustedAlpha);
        if (!locked("baseHue")) this.curHue = lerpAngleDegrees(this.curHue, this.targetHue, adjustedAlpha * 0.5);
        if (!locked("zoom")) this.curZoom = lerp(this.curZoom, this.targetZoom, adjustedAlpha * 0.5);
        if (!locked("distanceZoom")) this.curDistanceZoom = lerp(this.curDistanceZoom, this.targetDistanceZoom, adjustedAlpha * 0.5);
        if (!locked("spiralThickness")) this.curSpiralThickness = lerp(this.curSpiralThickness, this.targetSpiralThickness, adjustedAlpha);

        // Pulsos del fotograma sobre el valor base (lo que hace latir la espiral).
        this.k = this.curK + (locked("k") ? 0 : pulseK);
        this.psi = this.curPsi + (locked("psi") ? 0 : pulsePsi);
        this.z0_r = this.curZ0r + (locked("z0_r") ? 0 : pulseZ0r);
        this.z0_i = this.curZ0i + (locked("z0_i") ? 0 : pulseZ0i);
        this.baseHue = (((this.curHue + (locked("baseHue") ? 0 : pulseHue)) % 360) + 360) % 360;
        this.zoom = Math.max(0.0001, this.curZoom + (locked("zoom") ? 0 : pulseZoom));
        this.distanceZoom = Math.max(0.01, this.curDistanceZoom + (locked("distanceZoom") ? 0 : pulseDistanceZoom));
        this.spiralThickness = Math.max(0.01, this.curSpiralThickness + (locked("spiralThickness") ? 0 : pulseSpiralThickness));

        this.geometryData = geometryData;
    }

    /** Fusiona el estado vivo del piloto sobre los parámetros del usuario. */
    apply(p: VisualizerParams): VisualizerParams {
        if (!p.autoPilot) return p;
        const locked = (key: string) => p.lockedParams?.includes(key) === true;
        return {
            ...p,
            k: locked("k") ? p.k : this.k,
            psi: locked("psi") ? p.psi : this.psi,
            z0_r: locked("z0_r") ? p.z0_r : this.z0_r,
            z0_i: locked("z0_i") ? p.z0_i : this.z0_i,
            baseHue: locked("baseHue") ? p.baseHue : this.baseHue,
            zoom: locked("zoom") ? p.zoom : this.zoom,
            distanceZoom: locked("distanceZoom") ? p.distanceZoom : this.distanceZoom,
            spiralThickness: locked("spiralThickness") ? p.spiralThickness : this.spiralThickness,
            genesisStage: this.genesisTargetStage,
            geometryData: this.geometryData,
        };
    }

    /** Re-ancla el piloto a unos parámetros dados (p. ej. al restaurar un preset). */
    sync(p: VisualizerParams): void {
        this.curK = this.targetK = this.k = p.k;
        this.curPsi = this.targetPsi = this.psi = p.psi;
        this.curZ0r = this.targetZ0r = this.z0_r = p.z0_r;
        this.curZ0i = this.targetZ0i = this.z0_i = p.z0_i;
        this.curHue = this.targetHue = this.baseHue = p.baseHue;
        this.curZoom = this.targetZoom = this.zoom = p.zoom;
        this.curDistanceZoom = this.targetDistanceZoom = this.distanceZoom = p.distanceZoom;
        this.curSpiralThickness = this.targetSpiralThickness = this.spiralThickness = p.spiralThickness;
        this.snapshot(p);
    }
}
