'use client';

// ════════════════════════════════════════════════════════════════
// useAudio — Motor WebAudio COMPARTIDO (singleton a nivel de módulo)
// ----------------------------------------------------------------
// Antes, este hook creaba un AudioContext + grafo + estado PROPIOS por cada
// componente que lo usaba (App, GlobalPlayer, widget), de modo que el audio
// NO estaba sincronizado entre el widget, la app completa y el mini-dock
// (dos AudioContext, dos listas de osciladores, dos master gain).
//
// Ahora hay UNA sola instancia global (`engine`) que posee:
//   • UN único AudioContext (creado perezosamente en el navegador, tras un
//     gesto del usuario; en SSR no se toca nada).
//   • UN único master gain + analyser y UN único combined bus + analyser.
//   • UNA única lista de osciladores (`OscillatorState[]`) y su Map de nodos.
//   • UN único bucle de transiciones (requestAnimationFrame) global.
//
// El hook `useAudio()` se convierte en una vista delgada del singleton: se
// suscribe vía `useSyncExternalStore` (con `getServerSnapshot` estable para
// SSR) y devuelve EXACTAMENTE la misma API pública de antes (mismos nombres
// y firmas), por lo que todos los consumidores quedan auto-sincronizados sin
// reescribir sus call-sites: lo que suena/edita en uno se refleja al instante
// en los demás (misma fuente de verdad).
//
// El AudioContext NUNCA se cierra al desmontar un componente (el singleton
// persiste mientras viva la página); solo se liberan los nodos de cada
// oscilador cuando se elimina. Se conserva intacta toda la lógica de paneo
// 3D, binaural, crossfade de ondas, transiciones, sinergias y presets.
// ════════════════════════════════════════════════════════════════

import { useSyncExternalStore } from 'react';
import { OscillatorState, WaveType } from '../types';

interface AudioNodeRefs {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  gain1: GainNode;
  gain2: GainNode;
  mainGain: GainNode;
  panner: PannerNode;
  analyser: AnalyserNode;
}

// Factor de escala para el espacio 3D.
const SPATIAL_SCALE = 10.0;

// Snapshot inmutable que consume React. Se reemplaza por referencia en cada
// cambio para que useSyncExternalStore detecte la actualización.
interface AudioSnapshot {
  isPlaying: boolean;
  oscillators: OscillatorState[];
  masterVolume: number;
}

// Snapshot inicial: idéntico en server y primer render del cliente para evitar
// mismatches de hidratación. Estable (misma referencia) → seguro para SSR.
const INITIAL_SNAPSHOT: AudioSnapshot = {
  isPlaying: false,
  oscillators: [],
  masterVolume: 1.0,
};

class OmniAudioEngine {
  // ── Grafo WebAudio (único, perezoso) ───────────────────────────
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private combinedGain: GainNode | null = null;
  private combinedAnalyser: AnalyserNode | null = null;

  // Nodos por oscilador activo.
  private nodes = new Map<string, AudioNodeRefs>();

  // ── Estado reactivo (snapshot inmutable) ───────────────────────
  private snapshot: AudioSnapshot = INITIAL_SNAPSHOT;

  // ── Suscriptores (useSyncExternalStore) ────────────────────────
  private listeners = new Set<() => void>();

  // ── Bucle de transiciones global ───────────────────────────────
  private rafId = 0;
  private lastTime = 0;
  private loopRunning = false;

  // ────────────────────────────────────────────────────────────────
  // Suscripción / snapshot (API de useSyncExternalStore)
  // ────────────────────────────────────────────────────────────────
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    // Arranca el bucle de transiciones en la primera suscripción del cliente.
    this.startLoop();
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): AudioSnapshot => this.snapshot;

  getServerSnapshot = (): AudioSnapshot => INITIAL_SNAPSHOT;

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  /** Reemplaza el snapshot por referencia y notifica a los suscriptores. */
  private setSnapshot(patch: Partial<AudioSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  /** Actualiza la lista de osciladores (siempre crea un array nuevo). */
  private setOscillators(
    updater: (prev: OscillatorState[]) => OscillatorState[],
  ): void {
    const next = updater(this.snapshot.oscillators);
    if (next !== this.snapshot.oscillators) {
      this.snapshot = { ...this.snapshot, oscillators: next };
      this.emit();
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Inicialización del AudioContext (SSR-safe: solo tras gesto, en cliente)
  // ────────────────────────────────────────────────────────────────
  private initAudio(): void {
    if (typeof window === 'undefined') return;
    if (this.ctx) return;

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();

    // Sincroniza isPlaying con el estado real del contexto.
    ctx.onstatechange = () => {
      this.setSnapshot({ isPlaying: ctx.state === 'running' });
    };

    // Listener centrado.
    const listener = ctx.listener;
    if (listener.positionX) {
      listener.positionX.value = 0;
      listener.positionY.value = 0;
      listener.positionZ.value = 0;
      listener.forwardX.value = 0;
      listener.forwardY.value = 0;
      listener.forwardZ.value = -1;
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    }

    // Master Output.
    const masterGain = ctx.createGain();
    masterGain.gain.value = this.snapshot.masterVolume;
    const masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 2048;

    // Combined Bus (para el cálculo de resonancia binaural).
    const combinedGain = ctx.createGain();
    const combinedAnalyser = ctx.createAnalyser();
    combinedAnalyser.fftSize = 2048;

    // Routing:
    // 1. Combined Bus -> Master
    combinedGain.connect(combinedAnalyser);
    combinedAnalyser.connect(masterGain);
    // 2. Master -> Speaker
    masterGain.connect(masterAnalyser);
    masterAnalyser.connect(ctx.destination);

    this.ctx = ctx;
    this.masterGain = masterGain;
    this.masterAnalyser = masterAnalyser;
    this.combinedGain = combinedGain;
    this.combinedAnalyser = combinedAnalyser;

    this.setSnapshot({ isPlaying: ctx.state === 'running' });
  }

  // ────────────────────────────────────────────────────────────────
  // Acciones públicas (mismas firmas que la API original del hook)
  // ────────────────────────────────────────────────────────────────
  updateMasterVolume = (vol: number): void => {
    this.setSnapshot({ masterVolume: vol });
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.02);
    }
  };

  toggleMasterPlay = async (): Promise<void> => {
    this.initAudio();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    } else if (this.ctx.state === 'running') {
      await this.ctx.suspend();
    }
  };

  addOscillator = (initialState?: Partial<OscillatorState>): void => {
    this.initAudio();
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const newOsc: OscillatorState = {
      id: crypto.randomUUID(),
      frequency: initialState?.frequency || 432,
      type: initialState?.type || 'sine',
      volume: initialState?.volume !== undefined ? initialState.volume : 0.5,
      // 3D defaults
      panX: initialState?.panX !== undefined ? initialState.panX : 0,
      panY: initialState?.panY !== undefined ? initialState.panY : 0,
      panZ: initialState?.panZ !== undefined ? initialState.panZ : 0,

      isPlaying: true,
      name: initialState?.name || 'Oscilador',
      isIndependent: initialState?.isIndependent ?? false,
      color: initialState?.color || '#38bdf8',

      // Conserva crossfade/transición si vienen en el preset/sinergia.
      type2: initialState?.type2,
      typeMix: initialState?.typeMix,
      transition: initialState?.transition,
    };

    this.setOscillators((prev) => [...prev, newOsc]);
    this.createOscillatorNodes(newOsc);
  };

  removeOscillator = (id: string): void => {
    this.setOscillators((prev) => prev.filter((o) => o.id !== id));
    this.destroyOscillatorNodes(id);
  };

  updateOscillator = (id: string, changes: Partial<OscillatorState>): void => {
    this.initAudio();
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.setOscillators((prev) =>
      prev.map((o) => {
        if (o.id === id) {
          const updated = { ...o, ...changes };
          this.updateOscillatorNodes(updated);
          return updated;
        }
        return o;
      }),
    );
  };

  // ── Ajustes globales ────────────────────────────────────────────
  setGlobalVolume = (vol: number): void => {
    this.setOscillators((prev) =>
      prev.map((o) => {
        const updated = { ...o, volume: vol };
        this.updateOscillatorNodes(updated);
        return updated;
      }),
    );
  };

  centerAllPositions = (): void => {
    this.setOscillators((prev) =>
      prev.map((o) => {
        const updated = { ...o, panX: 0, panY: 0, panZ: 0 };
        this.updateOscillatorNodes(updated);
        return updated;
      }),
    );
  };

  setGlobalWaveType = (type: WaveType): void => {
    this.setOscillators((prev) =>
      prev.map((o) => {
        const updated = { ...o, type };
        this.updateOscillatorNodes(updated);
        return updated;
      }),
    );
  };

  // ── Getters de analizadores ─────────────────────────────────────
  getMasterAnalyser = (): AnalyserNode | null => this.masterAnalyser;
  getCombinedAnalyser = (): AnalyserNode | null => this.combinedAnalyser;
  getOscillatorAnalyser = (id: string): AnalyserNode | undefined =>
    this.nodes.get(id)?.analyser;

  // ────────────────────────────────────────────────────────────────
  // Gestión interna de nodos de audio
  // ────────────────────────────────────────────────────────────────
  private createOscillatorNodes(oscState: OscillatorState): void {
    if (!this.ctx || !this.masterGain || !this.combinedGain) return;
    const ctx = this.ctx;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();
    const mainGain = ctx.createGain();

    // PannerNode: Equal Power para hard panning.
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.rolloffFactor = 0;
    panner.refDistance = 1;
    panner.maxDistance = 10000;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;

    osc1.type = oscState.type;
    osc2.type = oscState.type2 || oscState.type;

    osc1.frequency.setValueAtTime(oscState.frequency, ctx.currentTime);
    osc2.frequency.setValueAtTime(oscState.frequency, ctx.currentTime);

    const mix = oscState.typeMix || 0;
    gain1.gain.setValueAtTime(1 - mix, ctx.currentTime);
    gain2.gain.setValueAtTime(mix, ctx.currentTime);

    mainGain.gain.setValueAtTime(oscState.volume, ctx.currentTime);

    // Posición 3D.
    if (panner.positionX) {
      panner.positionX.setValueAtTime(oscState.panX * SPATIAL_SCALE, ctx.currentTime);
      panner.positionY.setValueAtTime(oscState.panY * SPATIAL_SCALE, ctx.currentTime);
      panner.positionZ.setValueAtTime(oscState.panZ * -SPATIAL_SCALE, ctx.currentTime);
    }

    // Conexión del grafo.
    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(mainGain);
    gain2.connect(mainGain);
    mainGain.connect(panner);
    panner.connect(analyser);

    // Routing: Independiente vs Combinado.
    if (oscState.isIndependent) {
      analyser.connect(this.masterGain); // Directo a Master
    } else {
      analyser.connect(this.combinedGain); // Al Combined Bus
    }

    osc1.start();
    osc2.start();

    this.nodes.set(oscState.id, { osc1, osc2, gain1, gain2, mainGain, panner, analyser });
  }

  private destroyOscillatorNodes(id: string): void {
    const nodes = this.nodes.get(id);
    if (!nodes) return;

    try {
      if (this.ctx) {
        nodes.mainGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      }
      setTimeout(() => {
        nodes.osc1.stop();
        nodes.osc2.stop();
        nodes.osc1.disconnect();
        nodes.osc2.disconnect();
        nodes.gain1.disconnect();
        nodes.gain2.disconnect();
        nodes.mainGain.disconnect();
        nodes.panner.disconnect();
        nodes.analyser.disconnect();
      }, 50);
    } catch (e) {
      console.error('Error disconnecting node', e);
    }

    this.nodes.delete(id);
  }

  private updateOscillatorNodes(oscState: OscillatorState): void {
    const nodes = this.nodes.get(oscState.id);
    if (!nodes || !this.ctx || !this.masterGain || !this.combinedGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Tipo.
    if (nodes.osc1.type !== oscState.type) nodes.osc1.type = oscState.type;
    if (nodes.osc2.type !== (oscState.type2 || oscState.type))
      nodes.osc2.type = oscState.type2 || oscState.type;

    // Crossfade de mezcla (Equal Power).
    const mix = oscState.typeMix || 0;
    const gain1Value = Math.cos(mix * 0.5 * Math.PI);
    const gain2Value = Math.sin(mix * 0.5 * Math.PI);

    nodes.gain1.gain.setTargetAtTime(gain1Value, now, 0.02);
    nodes.gain2.gain.setTargetAtTime(gain2Value, now, 0.02);

    // Frecuencia y volumen.
    nodes.osc1.frequency.setTargetAtTime(oscState.frequency, now, 0.02);
    nodes.osc2.frequency.setTargetAtTime(oscState.frequency, now, 0.02);

    nodes.mainGain.gain.setTargetAtTime(oscState.isPlaying ? oscState.volume : 0, now, 0.02);

    // Posición 3D.
    if (nodes.panner.positionX) {
      nodes.panner.positionX.setTargetAtTime(oscState.panX * SPATIAL_SCALE, now, 0.02);
      nodes.panner.positionY.setTargetAtTime(oscState.panY * SPATIAL_SCALE, now, 0.02);
      nodes.panner.positionZ.setTargetAtTime(oscState.panZ * -SPATIAL_SCALE, now, 0.02);
    }

    // Actualización de routing: desconectar y reconectar para cambiar de bus.
    try {
      nodes.analyser.disconnect();
      if (oscState.isIndependent) {
        nodes.analyser.connect(this.masterGain);
      } else {
        nodes.analyser.connect(this.combinedGain);
      }
    } catch (e) {
      console.error('Routing update error', e);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Bucle de transiciones (único, global)
  // ────────────────────────────────────────────────────────────────
  private startLoop(): void {
    if (this.loopRunning || typeof window === 'undefined') return;
    this.loopRunning = true;

    const loop = (time: number): void => {
      if (!this.lastTime) this.lastTime = time;
      const dt = (time - this.lastTime) / 1000; // en segundos
      this.lastTime = time;

      this.setOscillators((prev) => {
        let hasChanges = false;
        const next = prev.map((osc) => {
          if (!osc.transition || !osc.transition.enabled || !osc.transition.isPlaying) {
            return osc;
          }

          const t = osc.transition;
          const step = dt / Math.max(t.duration, 0.1); // evita división por cero
          let newProgress = t.progress + (t.direction === 'forward' ? step : -step);
          let newDirection = t.direction;
          let newLoop = t.currentLoop;
          let isPlaying = t.isPlaying;

          if (newProgress >= 1) {
            newProgress = 1;
            if (t.loopCount === 'infinite' || newLoop < t.loopCount) {
              newDirection = 'backward';
              newLoop++;
            } else {
              isPlaying = false;
            }
          } else if (newProgress <= 0) {
            newProgress = 0;
            if (t.loopCount === 'infinite' || newLoop < t.loopCount) {
              newDirection = 'forward';
              newLoop++;
            } else {
              isPlaying = false;
            }
          }

          if (
            newProgress !== t.progress ||
            newDirection !== t.direction ||
            newLoop !== t.currentLoop ||
            isPlaying !== t.isPlaying
          ) {
            hasChanges = true;

            const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

            const updatedOsc: OscillatorState = {
              ...osc,
              frequency: lerp(t.start.frequency, t.end.frequency, newProgress),
              volume: lerp(t.start.volume, t.end.volume, newProgress),
              panX: lerp(t.start.panX, t.end.panX, newProgress),
              panY: lerp(t.start.panY, t.end.panY, newProgress),
              panZ: lerp(t.start.panZ, t.end.panZ, newProgress),
              type: t.start.type,
              type2: t.end.type,
              typeMix: newProgress,
              transition: {
                ...t,
                progress: newProgress,
                direction: newDirection,
                currentLoop: newLoop,
                isPlaying,
              },
            };

            this.updateOscillatorNodes(updatedOsc);
            return updatedOsc;
          }

          return osc;
        });

        return hasChanges ? next : prev;
      });

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }
}

// ── Singleton a nivel de módulo: UNA sola instancia para toda la app ──
const engine = new OmniAudioEngine();

/**
 * Hook de acceso al motor de audio COMPARTIDO. Devuelve la misma API pública
 * de siempre (mismos nombres/firmas); el estado (`isPlaying`, `oscillators`,
 * `masterVolume`) proviene del singleton vía useSyncExternalStore, así que
 * todos los consumidores (widget, app completa, mini-dock) quedan
 * sincronizados en vivo automáticamente.
 */
export const useAudio = () => {
  const { isPlaying, oscillators, masterVolume } = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getServerSnapshot,
  );

  return {
    isPlaying,
    oscillators,
    masterVolume,
    updateMasterVolume: engine.updateMasterVolume,
    toggleMasterPlay: engine.toggleMasterPlay,
    addOscillator: engine.addOscillator,
    removeOscillator: engine.removeOscillator,
    updateOscillator: engine.updateOscillator,
    getMasterAnalyser: engine.getMasterAnalyser,
    getCombinedAnalyser: engine.getCombinedAnalyser,
    getOscillatorAnalyser: engine.getOscillatorAnalyser,
    setGlobalVolume: engine.setGlobalVolume,
    centerAllPositions: engine.centerAllPositions,
    setGlobalWaveType: engine.setGlobalWaveType,
  };
};
