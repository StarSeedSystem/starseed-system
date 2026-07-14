/**
 * Audiomorphic — PILOTO AUTOMÁTICO (Deriva · Armónico · Génesis)
 * ============================================================================
 * Port del `updateLoop` de `App.tsx` (StarSeedSystem/Audiomorphic-AR-app) a una
 * clase sin React.
 *
 * En el original el piloto vivía dentro de un `useEffect` que hacía
 * `setParams(...)` en CADA fotograma (60 renders de React por segundo). Aquí es
 * un objeto mutable que el bucle de dibujo consulta directamente: mismo
 * resultado visual, sin re-render de React por fotograma. Es lo que permite que
 * la CAPA DE FONDO no cueste nada en la UI del OS.
 *
 * La app sí publica su estado a React, pero **con throttle** (para el HUD), no
 * a 60 fps.
 */

import {
    GENESIS_STAGES,
    calculateHarmonicGeometry,
    genesisStageForEnergy,
    harmonicShapeForInterval,
    lerp,
    lerpAngle,
} from "./harmonic-math";
import type { AudioMetrics, GeometryInfo, VisualizerParams } from "./types";
import { DEFAULT_PARAMS } from "./types";

export class AudiomorphicAutopilot {
    private targetK: number;
    private targetPsi: number;
    private targetZ0r = 0;
    private targetZ0i = 0;
    private targetHue: number;
    private lastBeatTime = 0;
    private genesisTargetStage = 0;

    /** Valores vivos que el renderer lee cada fotograma. */
    public k: number;
    public psi: number;
    public z0_r: number;
    public z0_i: number;
    public baseHue: number;
    public geometryData: GeometryInfo | undefined;

    constructor(params: VisualizerParams) {
        this.k = params.k;
        this.psi = params.psi;
        this.z0_r = params.z0_r;
        this.z0_i = params.z0_i;
        this.baseHue = params.baseHue;
        this.targetK = params.k;
        this.targetPsi = params.psi;
        this.targetHue = params.baseHue;
    }

    /** Un paso del piloto. Muta el estado interno; no toca el DOM. */
    step(params: VisualizerParams, metrics: AudioMetrics): void {
        const { volume, frequency } = metrics;
        const now = Date.now();
        let geometryData: GeometryInfo | undefined;

        if (params.autoPilotMode === "genesis") {
            // ── GÉNESIS: la energía del sonido escala la creación ──
            const stageIdx = genesisStageForEnergy(volume, frequency);
            if (Math.abs(stageIdx - this.genesisTargetStage) > 0.1) {
                this.genesisTargetStage = stageIdx;
            }

            const currentStage = GENESIS_STAGES[this.genesisTargetStage];
            const math = calculateHarmonicGeometry(currentStage.V, currentStage.E);

            // Respiración: la espiral crece con el sonido y se relaja en silencio
            const breathing = 1.0 + volume * 0.015;

            this.targetPsi = math.psi;
            this.targetK = math.k * breathing;
            this.targetZ0r = 0;
            this.targetZ0i = 0;

            if (math.regime === "primary") {
                this.targetHue = 200 - this.genesisTargetStage * 10;   // fríos (estable)
            } else if (math.regime === "reciprocal") {
                this.targetHue = 0 + this.genesisTargetStage * 5;      // cálidos (tensión)
            } else {
                this.targetHue = 240;                                   // el Vacío
            }

            geometryData = {
                V: currentStage.V,
                E: currentStage.E,
                alpha: math.alpha,
                beta: math.beta,
                regime: math.regime,
                name: currentStage.name,
            };
        } else if (params.autoPilotMode === "harmonic") {
            // ── ARMÓNICO: la nota dominante elige el polígono ──
            const rawNote = Math.floor(frequency * 36);
            const noteIndex = rawNote % 12;
            const interval = Math.abs(noteIndex - params.rootNote) % 12;
            const { V, E, name } = harmonicShapeForInterval(interval);

            const math = calculateHarmonicGeometry(V, E);
            const breathing = 1.0 + volume * 0.012;

            this.targetPsi = math.psi;
            this.targetK = math.k * breathing;
            this.targetHue = (noteIndex * 30) % 360; // círculo de quintas (aprox.)

            geometryData = { V, E, alpha: math.alpha, beta: math.beta, regime: math.regime, name };
        } else {
            // ── DERIVA: el golpe cambia el ángulo; la espiral no colapsa ──
            const isBeat = volume > 0.40;
            if (isBeat && now - this.lastBeatTime > 2500) {
                this.lastBeatTime = now;
                this.targetPsi = Math.random() * Math.PI;
            }
            this.targetK = DEFAULT_PARAMS.k;
            this.targetPsi += frequency * 0.0002;
            this.targetHue = (this.baseHue + 0.1) % 360;
        }

        // ── FÍSICA (viscosidad: agua ↔ miel) ──
        const viscosity = params.autoViscosity ?? 0.96;
        let alpha = (1 - viscosity) * 0.05;
        if (volume > 0.3) alpha *= 1.2;
        // `autoSpeed` es la velocidad de la deriva: en el original solo entraba
        // como dependencia del efecto. Aquí escala el avance, que es lo que el
        // control «Velocidad Deriva» promete de verdad.
        alpha *= params.autoSpeed ?? 1;

        this.k = lerp(this.k, this.targetK, alpha);
        this.psi = lerpAngle(this.psi, this.targetPsi, alpha);
        this.z0_r = lerp(this.z0_r, this.targetZ0r, alpha);
        this.z0_i = lerp(this.z0_i, this.targetZ0i, alpha);
        this.baseHue = lerpAngle(this.baseHue, this.targetHue, alpha * 0.5);
        this.geometryData = geometryData;
    }

    /** Fusiona el estado vivo del piloto sobre los parámetros del usuario. */
    apply(params: VisualizerParams): VisualizerParams {
        if (!params.autoPilot) return params;
        return {
            ...params,
            k: this.k,
            psi: this.psi,
            z0_r: this.z0_r,
            z0_i: this.z0_i,
            baseHue: this.baseHue,
            genesisStage: this.genesisTargetStage,
            geometryData: this.geometryData,
        };
    }

    /** Re-sincroniza el piloto tras un cambio manual de parámetros. */
    sync(params: VisualizerParams): void {
        this.k = params.k;
        this.psi = params.psi;
        this.baseHue = params.baseHue;
    }
}
