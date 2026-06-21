'use client';

import { useRef, useState, useEffect } from 'react';
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

export const useAudio = () => {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const masterAnalyserRef = useRef<AnalyserNode | null>(null);

  // New: Combined Bus for "Main Resonance" visualization/binaural calculation
  const combinedGainRef = useRef<GainNode | null>(null);
  const combinedAnalyserRef = useRef<AnalyserNode | null>(null);

  // Map to store audio nodes for each active oscillator
  const nodesRef = useRef<Map<string, AudioNodeRefs>>(new Map());

  const [isPlaying, setIsPlaying] = useState(false);
  const [oscillators, setOscillators] = useState<OscillatorState[]>([]);
  const [masterVolume, setMasterVolume] = useState(1.0);

  // Initialize Audio Context (SSR-safe: solo se llama tras un gesto del usuario)
  const initAudio = () => {
    if (typeof window === 'undefined') return;
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();

      // Sync isPlaying state with context state
      ctx.onstatechange = () => {
        setIsPlaying(ctx.state === 'running');
      };

      // Listener set to center
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

      // Master Output
      const masterGain = ctx.createGain();
      masterGain.gain.value = masterVolume; // Default master volume
      const masterAnalyser = ctx.createAnalyser();
      masterAnalyser.fftSize = 2048;

      // Combined Bus (For binaural resonance calculation)
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

      audioCtxRef.current = ctx;
      masterGainRef.current = masterGain;
      masterAnalyserRef.current = masterAnalyser;
      combinedGainRef.current = combinedGain;
      combinedAnalyserRef.current = combinedAnalyser;

      setIsPlaying(ctx.state === 'running');
    }
  };

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      masterGainRef.current = null;
      masterAnalyserRef.current = null;
      combinedGainRef.current = null;
      combinedAnalyserRef.current = null;
      nodesRef.current.clear();
    };
  }, []);

  const updateMasterVolume = (vol: number) => {
    setMasterVolume(vol);
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
      masterGainRef.current.gain.setTargetAtTime(vol, audioCtxRef.current.currentTime, 0.02);
    }
  };

  const toggleMasterPlay = async () => {
    initAudio();
    if (!audioCtxRef.current) return;

    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    } else if (audioCtxRef.current.state === 'running') {
      await audioCtxRef.current.suspend();
    }
  };

  const addOscillator = (initialState?: Partial<OscillatorState>) => {
    initAudio();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
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
    };

    setOscillators((prev) => [...prev, newOsc]);
    createOscillatorNodes(newOsc);
  };

  const removeOscillator = (id: string) => {
    setOscillators((prev) => prev.filter((o) => o.id !== id));
    destroyOscillatorNodes(id);
  };

  const updateOscillator = (id: string, changes: Partial<OscillatorState>) => {
    initAudio();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    setOscillators((prev) =>
      prev.map((o) => {
        if (o.id === id) {
          const updated = { ...o, ...changes };
          updateOscillatorNodes(updated);
          return updated;
        }
        return o;
      }),
    );
  };

  // --- Internal Audio Node Management ---

  const createOscillatorNodes = (oscState: OscillatorState) => {
    if (!audioCtxRef.current || !masterGainRef.current || !combinedGainRef.current) return;
    const ctx = audioCtxRef.current;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();
    const mainGain = ctx.createGain();

    // PannerNode: Equal Power for Hard Panning capability
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

    // Set 3D Position
    if (panner.positionX) {
      panner.positionX.setValueAtTime(oscState.panX * SPATIAL_SCALE, ctx.currentTime);
      panner.positionY.setValueAtTime(oscState.panY * SPATIAL_SCALE, ctx.currentTime);
      panner.positionZ.setValueAtTime(oscState.panZ * -SPATIAL_SCALE, ctx.currentTime);
    }

    // Graph Connection
    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(mainGain);
    gain2.connect(mainGain);
    mainGain.connect(panner);
    panner.connect(analyser);

    // Routing Logic: Independent vs Combined
    if (oscState.isIndependent) {
      analyser.connect(masterGainRef.current); // Direct to Master
    } else {
      analyser.connect(combinedGainRef.current); // To Combined Bus
    }

    osc1.start();
    osc2.start();

    nodesRef.current.set(oscState.id, { osc1, osc2, gain1, gain2, mainGain, panner, analyser });
  };

  const destroyOscillatorNodes = (id: string) => {
    const nodes = nodesRef.current.get(id);
    if (nodes) {
      try {
        if (audioCtxRef.current) {
          nodes.mainGain.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.01);
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

      nodesRef.current.delete(id);
    }
  };

  const updateOscillatorNodes = (oscState: OscillatorState) => {
    const nodes = nodesRef.current.get(oscState.id);
    if (!nodes || !audioCtxRef.current || !masterGainRef.current || !combinedGainRef.current) return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    // Type
    if (nodes.osc1.type !== oscState.type) nodes.osc1.type = oscState.type;
    if (nodes.osc2.type !== (oscState.type2 || oscState.type)) nodes.osc2.type = oscState.type2 || oscState.type;

    // Crossfade Mix (Equal Power)
    const mix = oscState.typeMix || 0;
    const gain1Value = Math.cos(mix * 0.5 * Math.PI);
    const gain2Value = Math.sin(mix * 0.5 * Math.PI);

    nodes.gain1.gain.setTargetAtTime(gain1Value, now, 0.02);
    nodes.gain2.gain.setTargetAtTime(gain2Value, now, 0.02);

    // Freq & Vol
    nodes.osc1.frequency.setTargetAtTime(oscState.frequency, now, 0.02);
    nodes.osc2.frequency.setTargetAtTime(oscState.frequency, now, 0.02);

    nodes.mainGain.gain.setTargetAtTime(oscState.isPlaying ? oscState.volume : 0, now, 0.02);

    // 3D Position
    if (nodes.panner.positionX) {
      nodes.panner.positionX.setTargetAtTime(oscState.panX * SPATIAL_SCALE, now, 0.02);
      nodes.panner.positionY.setTargetAtTime(oscState.panY * SPATIAL_SCALE, now, 0.02);
      nodes.panner.positionZ.setTargetAtTime(oscState.panZ * -SPATIAL_SCALE, now, 0.02);
    }

    // Routing update
    // We disconnect and reconnect to switch buses
    try {
      nodes.analyser.disconnect();
      if (oscState.isIndependent) {
        nodes.analyser.connect(masterGainRef.current);
      } else {
        nodes.analyser.connect(combinedGainRef.current);
      }
    } catch (e) {
      console.error('Routing update error', e);
    }
  };

  const getMasterAnalyser = () => masterAnalyserRef.current;
  const getCombinedAnalyser = () => combinedAnalyserRef.current;
  const getOscillatorAnalyser = (id: string) => nodesRef.current.get(id)?.analyser;

  // Global Adjustments
  const setGlobalVolume = (vol: number) => {
    setOscillators((prev) =>
      prev.map((o) => {
        const updated = { ...o, volume: vol };
        updateOscillatorNodes(updated);
        return updated;
      }),
    );
  };

  const centerAllPositions = () => {
    setOscillators((prev) =>
      prev.map((o) => {
        const updated = { ...o, panX: 0, panY: 0, panZ: 0 };
        updateOscillatorNodes(updated);
        return updated;
      }),
    );
  };

  const setGlobalWaveType = (type: WaveType) => {
    setOscillators((prev) =>
      prev.map((o) => {
        const updated = { ...o, type };
        updateOscillatorNodes(updated);
        return updated;
      }),
    );
  };

  // --- Transition Loop ---
  const lastTimeRef = useRef<number>(0);
  const reqFrameRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const loop = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const dt = (time - lastTimeRef.current) / 1000; // in seconds
      lastTimeRef.current = time;

      setOscillators((prev) => {
        let hasChanges = false;
        const next = prev.map((osc) => {
          if (!osc.transition || !osc.transition.enabled || !osc.transition.isPlaying) {
            return osc;
          }

          const t = osc.transition;
          const step = dt / Math.max(t.duration, 0.1); // avoid division by zero
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

            const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

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

            updateOscillatorNodes(updatedOsc);
            return updatedOsc;
          }

          return osc;
        });

        return hasChanges ? next : prev;
      });

      reqFrameRef.current = requestAnimationFrame(loop);
    };

    reqFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(reqFrameRef.current);
  }, []);

  return {
    isPlaying,
    oscillators,
    masterVolume,
    updateMasterVolume,
    toggleMasterPlay,
    addOscillator,
    removeOscillator,
    updateOscillator,
    getMasterAnalyser,
    getCombinedAnalyser,
    getOscillatorAnalyser,
    setGlobalVolume,
    centerAllPositions,
    setGlobalWaveType,
  };
};
