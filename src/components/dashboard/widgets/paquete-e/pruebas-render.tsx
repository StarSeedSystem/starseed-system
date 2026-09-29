/**
 * Ayudas de las pruebas de render del paquete E (no es un test: lo importan los *.test.tsx).
 * Fuerza la clase de tamaño con el mismo contexto que publica el MarcoUnificado.
 */
import * as React from "react";
import { render } from "@testing-library/react";
import { ContextoMarco, type ContextoMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

export function marcoDe(clase: ClaseTamano, acento = "#94a3b8"): ContextoMarcoUnificado {
    const base = clase === "panoramico" || clase === "torre" ? "m" : clase;
    return { acento, acento2: "#23d5ab", clase, base, horizontal: clase === "panoramico", espaciado: ESPACIADO_MARCO[base] };
}

export function montarEn(clase: ClaseTamano, nodo: React.ReactElement, acento?: string) {
    return render(<ContextoMarco.Provider value={marcoDe(clase, acento)}>{nodo}</ContextoMarco.Provider>);
}

export function entornoNavegador() {
    const g = globalThis as any;
    g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.load = function () {};
    HTMLCanvasElement.prototype.getContext = (() => null) as any;
    class Nodo { connect() {} disconnect() {} }
    const parametro = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
    class ContextoAudio {
        state = "running"; currentTime = 0; sampleRate = 44100; destination = new Nodo(); listener = { positionX: parametro(), positionY: parametro(), positionZ: parametro() };
        createGain() { return Object.assign(new Nodo(), { gain: parametro() }); }
        createOscillator() { return Object.assign(new Nodo(), { frequency: parametro(), detune: parametro(), type: "sine", start() {}, stop() {} }); }
        createAnalyser() { return Object.assign(new Nodo(), { fftSize: 256, frequencyBinCount: 128, getByteFrequencyData() {}, getByteTimeDomainData() {}, getFloatTimeDomainData() {} }); }
        createPanner() { return Object.assign(new Nodo(), { positionX: parametro(), positionY: parametro(), positionZ: parametro(), panningModel: "", distanceModel: "", setPosition() {} }); }
        createStereoPanner() { return Object.assign(new Nodo(), { pan: parametro() }); }
        createChannelMerger() { return new Nodo(); }
        createBiquadFilter() { return Object.assign(new Nodo(), { frequency: parametro(), Q: parametro() }); }
        createDynamicsCompressor() { return Object.assign(new Nodo(), { threshold: parametro(), knee: parametro(), ratio: parametro(), attack: parametro(), release: parametro() }); }
        resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); }
    }
    g.AudioContext = ContextoAudio; g.webkitAudioContext = ContextoAudio;
    g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number;
    g.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

export const TODAS: ClaseTamano[] = ["micro", "s", "m", "l", "xl", "panoramico", "torre"];
