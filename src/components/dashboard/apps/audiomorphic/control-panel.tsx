"use client";

/**
 * Audiomorphic — PANEL DE CONTROL COMPLETO (Adenda 69 · K)
 * ============================================================================
 * Port de `components/ControlPanel.tsx` de la repo CORRECTA del usuario
 * (github.com/alexbordongarrigos/audiomorphic-ar) — **3.589 líneas**, no las 829
 * del port anterior, que venía de la repo equivocada
 * (`StarSeedSystem/Audiomorphic-AR-app`). De ahí que faltaran "muchas opciones
 * del menú de ajustes": faltaban CASI TODAS.
 *
 * ── QUÉ SE QUITA (y por qué NO se pierde nada) ──────────────────────────────
 *  · `useAuth` / Firebase / Firestore / Stripe / `ProfileMenu` /
 *    `SubscriptionScreen`. En el OS **no hay login ni planes**.
 *  · **LOS BLOQUEOS SON REALES EN LA APP ORIGINAL** (aquí no había "teatro de
 *    UI", al revés de lo que se creyó en la Adenda 68·E leyendo la repo mala):
 *    `isLocked = !isPremium` cerraba de verdad la Deriva, los modos de
 *    aleatorización (Inteligente · DJ · Sagrado · Rítmico · Arcoíris · Astral),
 *    la detección de emoción/ritmo, la autorregeneración avanzada, la capa de
 *    geometría sagrada, los temas, los aleatorizadores, el VR/AR y el guardado
 *    de presets. **Aquí TODO eso está abierto**: `isLocked` es `false` y punto.
 *  · Los presets ya no van a Firestore: van a `localStorage` (ilimitados, sin
 *    cuenta). Ver `use-local-presets.ts`.
 *
 * ── QUÉ NO ES PORTABLE (y no se finge) ──────────────────────────────────────
 *  · **VR / AR / Portal AR**: su motor es `VisualizerVR` (R3F v9 +
 *    @react-three/xr v6 + postprocessing v3), que **exige React 19**. El OS va
 *    con **React 18 + R3F v8**. No se puede montar sin subir medio OS de versión.
 *    En vez de simular botones muertos, la sección lo DICE y enlaza a la app
 *    original. Los parámetros VR/AR siguen existiendo (para no romper presets).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { VisualizerParams, SacredGeometryMode, SacredGeometrySettings, DEFAULT_PARAMS, AutoPilotMode, BackgroundMode, GeometryInfo } from '@/lib/audiomorphic/types';
import { Activity, Zap, Maximize, Minimize, RotateCw, Palette, Target, Music, BrainCircuit, Wind, Droplets, Waves, Shuffle, Sprout, Glasses, Download, X, RotateCcw, Save, Upload, Heart, Lock, Unlock, Star, Cloud, Trash2, ExternalLink } from 'lucide-react';
import { useLocalPresets, type Preset } from './use-local-presets';
import LiquidSelect from './liquid-select';
import LiquidSlider from './liquid-slider';

/** Claves numéricas de `SacredGeometrySettings` (todas menos `colored`). */
type SgNumericKey = {
  [K in keyof SacredGeometrySettings]: SacredGeometrySettings[K] extends number ? K : never;
}[keyof SacredGeometrySettings];

interface ControlPanelProps {
  params: VisualizerParams;
  setParams: React.Dispatch<React.SetStateAction<VisualizerParams>>;
  audioActive: boolean;
  toggleAudio: () => void;
  onClose?: () => void;
  getAudioMetrics: (sensitivity: number, freqRange: number) => { volume: number; frequency: number; bass: number; mid: number; treble: number };
  audioDevices?: MediaDeviceInfo[];
  selectedAudioDeviceId?: string;
  onAudioDeviceChange?: (deviceId: string) => void;
  /**
   * `background` = el panel está configurando una CAPA DE FONDO del OS (no la
   * app). Se ocultan las cosas que allí no tienen sentido: el fondo propio del
   * visualizador (lo pone el OS), la pantalla completa y la instalación PWA.
   */
  context?: 'app' | 'background';
}

const SACRED_GEOMETRY_OPTIONS = [
  { id: 'goldenSpiral', label: 'Espiral Áurea' },
  { id: 'flowerOfLife', label: 'Flor de la Vida' },
  { id: 'quantumWave', label: 'Onda Cuántica' },
  { id: 'torus', label: 'Toroide' },
  { id: 'metatron', label: 'Cubo de Metatrón' },
  { id: 'merkaba', label: 'Merkaba' },
  { id: 'platonicSolids', label: 'Sólidos Platónicos' },
  { id: 'sriYantra', label: 'Sri Yantra' },
  { id: 'cymatics', label: 'Cimática' },
  { id: 'vectorEquilibrium', label: 'Equilibrio Vectorial' },
  { id: 'treeOfLife', label: 'Árbol de la Vida' },
  { id: 'yinYang', label: 'Yin Yang' },
  { id: 'mandala1', label: 'Mandala 1 (Externo)' },
  { id: 'mandala2', label: 'Mandala 2 (Interno)' },
  { id: 'mandala3', label: 'Mandala 3 (Secreto)' },
  { id: 'holographicFractal', label: 'Fractal Holográfico' },
  { id: 'chakras', label: 'Chakras' },
  { id: 'om', label: 'Om' },
  { id: 'lotus', label: 'Flor de Loto' },
  { id: 'dharmaChakra', label: 'Dharma Chakra' }
];

const ControlPanel: React.FC<ControlPanelProps> = ({
  params,
  setParams,
  audioActive,
  toggleAudio,
  onClose,
  getAudioMetrics,
  audioDevices = [],
  selectedAudioDeviceId = '',
  onAudioDeviceChange,
  context = 'app'
}) => {
  const isBackground = context === 'background';
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedSgEditMode, setSelectedSgEditMode] = useState<SacredGeometryMode>('flowerOfLife');
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showRandomizerMenu, setShowRandomizerMenu] = useState(false);
  const [autoRandomInterval, setAutoRandomInterval] = useState<number>(10);
  const [autoRandomOnEmotionChange, setAutoRandomOnEmotionChange] = useState<boolean>(true);
  const [autoEmotionSensitivity, setAutoEmotionSensitivity] = useState<number>(50);
  const [autoBeatSensitivity, setAutoBeatSensitivity] = useState<number>(50);
  const [autoStyleFluidity, setAutoStyleFluidity] = useState<number>(50);

  // ── DESBLOQUEO TOTAL (petición del usuario) ──────────────────────────────
  // En la app original esto era `!isPremium` y cerraba de verdad media app.
  // En el OS **no hay planes ni login**: todo abierto desde el primer segundo.
  const isPremium = true;
  const isLocked = false;
  const isGenesisLocked = false;
  const isAutoPilotLocked = false;
  const isReactivityLocked = false;
  const isVRARLocked = false;
  const onShowSubscription = () => { /* no hay suscripciones en el OS */ };
  const [autoRandomReactivitySpeed, setAutoRandomReactivitySpeed] = useState<number>(50);
  const [autoTransitionSmoothness, setAutoTransitionSmoothness] = useState<number>(50);
  const lastMetricsRef = useRef({ volume: 0, frequency: 0, bass: 0, mid: 0, treble: 0, time: 0, longTermVolume: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const paramsRef = useRef(params);
  const tweenAnimRef = useRef<number>(0);

  useEffect(() => {
    if (params.autoRandomOnBeat && autoRandomOnEmotionChange) {
      setAutoEmotionSensitivity(80);
      setAutoBeatSensitivity(75);
      setAutoStyleFluidity(70);
      setAutoRandomReactivitySpeed(80);
      setParams(prev => ({
        ...prev,
        autoTimeDelay: 2,
        autoParamRegenDelay: 1,
        autoParamRegenBuffer: 50,
        autoOptionSaturation: 60,
        autoParamRatioLeveler: 60
      }));
    } else if (params.autoRandomOnBeat) {
      setAutoEmotionSensitivity(60);
      setAutoBeatSensitivity(85);
      setAutoStyleFluidity(80);
      setAutoRandomReactivitySpeed(90);
      setParams(prev => ({
        ...prev,
        autoTimeDelay: 1,
        autoParamRegenDelay: 0.5,
        autoParamRegenBuffer: 30,
        autoOptionSaturation: 80,
        autoParamRatioLeveler: 40
      }));
    } else if (autoRandomOnEmotionChange) {
      setAutoEmotionSensitivity(70);
      setAutoBeatSensitivity(50);
      setAutoStyleFluidity(60);
      setAutoRandomReactivitySpeed(60);
      setParams(prev => ({
        ...prev,
        autoTimeDelay: 4,
        autoParamRegenDelay: 2,
        autoParamRegenBuffer: 70,
        autoOptionSaturation: 50,
        autoParamRatioLeveler: 70
      }));
    }
  }, [params.autoRandomOnBeat, autoRandomOnEmotionChange, setParams]);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const handleAutoRandomModeChange = (mode: VisualizerParams['autoRandomMode']) => {
    if (mode !== 'none') {
      setAutoRandomOnEmotionChange(true);
      
      // Balance advanced parameters when starting auto-regeneration
      setParams(prev => ({
        ...prev,
        autoRandomMode: mode,
        autoTimeDelayMode: (mode === 'rhythmic' || mode === 'astral') ? 'smart' : (Math.random() > 0.5 ? 'smart' : 'custom'),
        autoTimeDelay: 1 + Math.random() * 4, // 1-5 seconds
        autoParamRegenMode: 'smooth', // Always smooth by default so viscosity works
        autoParamRegenDelay: Math.random() * 3, // 0-3 seconds
        autoParamRegenBuffer: 20 + Math.random() * 60, // 20-80%
        autoOptionSaturationAuto: true,
        autoOptionSaturation: 40 + Math.random() * 40, // 40-80
        autoRelationshipMode: (mode === 'sacred' || mode === 'astral') ? 'empathetic' : (mode === 'rhythmic' ? 'technical' : (Math.random() > 0.5 ? 'empathetic' : 'technical')),
        autoParamRatioLeveler: (mode === 'sacred' || mode === 'astral') ? 90 : (mode === 'rhythmic' ? 30 : 50),
        autoOffscreenFade: mode !== 'astral' // Mostly true, false for astral
      }));
      
      // Generate initial parameters immediately for immediate feedback
      generateRandomParams(mode as any, false);
    } else {
      setParams(prev => ({
        ...prev,
        autoRandomMode: 'none',
        sgAutoHarmonic: false,
        sgAutoResonance: false
      }));
    }
  };

  const tweenParams = useCallback((targetParams: Partial<VisualizerParams>, duration: number = 2000, smoothness: number = 0.5) => {
    if (tweenAnimRef.current) cancelAnimationFrame(tweenAnimRef.current);
    
    const startTime = Date.now();
    const startParams = { ...paramsRef.current };
    
    const animate = () => {
      const now = Date.now();
      let progress = (now - startTime) / duration;
      if (progress > 1) progress = 1;
      
      let easeProgress;
      if (smoothness >= 0.8) {
        // Very smooth, progressive but constant (linear)
        easeProgress = progress;
      } else if (smoothness <= 0.2) {
        // Instant/immediate resonant change (ease-out cubic)
        easeProgress = 1 - Math.pow(1 - progress, 3);
      } else {
        // Standard smooth (ease-in-out sine)
        easeProgress = -(Math.cos(Math.PI * progress) - 1) / 2;
      }
      
      setParams(prev => {
        const next = { ...prev };
        for (const key in targetParams) {
          const k = key as keyof VisualizerParams;
          
          // Skip if parameter is locked
          if (prev.lockedParams?.includes(k)) {
            continue;
          }

          // Geometry parameters are handled by App.tsx for continuous audio reactivity.
          // We set their target values instantly, and App.tsx will lerp them smoothly.
          if (k === 'k' || k === 'psi' || k === 'z0_r' || k === 'z0_i' || k === 'baseHue') {
            // Set the target continuously so it's always up-to-date, App.tsx will lerp towards it.
            if (k === 'k') next.targetK = targetParams[k] as number;
            if (k === 'psi') next.targetPsi = targetParams[k] as number;
            if (k === 'z0_r') next.targetZ0_r = targetParams[k] as number;
            if (k === 'z0_i') next.targetZ0_i = targetParams[k] as number;
            if (k === 'baseHue') next.targetBaseHue = targetParams[k] as number;
            continue;
          }
          
          const targetVal = targetParams[k];
          const startVal = startParams[k];
          
          if (typeof targetVal === 'number' && typeof startVal === 'number') {
            (next as any)[k] = (startVal as number) + ((targetVal as number) - (startVal as number)) * easeProgress;
          } else if (typeof targetVal === 'string' && targetVal.startsWith('#') && typeof startVal === 'string' && startVal.startsWith('#')) {
            if (progress === 1) {
              (next as any)[k] = targetVal;
            } else {
              const r1 = parseInt(startVal.slice(1, 3), 16);
              const g1 = parseInt(startVal.slice(3, 5), 16);
              const b1 = parseInt(startVal.slice(5, 7), 16);
              const r2 = parseInt(targetVal.slice(1, 3), 16);
              const g2 = parseInt(targetVal.slice(3, 5), 16);
              const b2 = parseInt(targetVal.slice(5, 7), 16);
              
              const r = Math.round(r1 + (r2 - r1) * easeProgress);
              const g = Math.round(g1 + (g2 - g1) * easeProgress);
              const b = Math.round(b1 + (b2 - b1) * easeProgress);
              
              (next as any)[k] = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            }
          } else if (Array.isArray(targetVal) && Array.isArray(startVal)) {
            if (progress === 1) {
              (next as any)[k] = targetVal;
            } else {
              const newArray = [];
              const maxLen = Math.max(targetVal.length, startVal.length);
              for (let i = 0; i < maxLen; i++) {
                const tv = targetVal[i] || targetVal[targetVal.length - 1] || '#000000';
                const sv = startVal[i] || startVal[startVal.length - 1] || '#000000';
                if (typeof tv === 'string' && tv.startsWith('#') && typeof sv === 'string' && sv.startsWith('#')) {
                  const r1 = parseInt(sv.slice(1, 3), 16) || 0;
                  const g1 = parseInt(sv.slice(3, 5), 16) || 0;
                  const b1 = parseInt(sv.slice(5, 7), 16) || 0;
                  const r2 = parseInt(tv.slice(1, 3), 16) || 0;
                  const g2 = parseInt(tv.slice(3, 5), 16) || 0;
                  const b2 = parseInt(tv.slice(5, 7), 16) || 0;
                  const r = Math.round(r1 + (r2 - r1) * easeProgress);
                  const g = Math.round(g1 + (g2 - g1) * easeProgress);
                  const b = Math.round(b1 + (b2 - b1) * easeProgress);
                  newArray.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
                } else {
                  newArray.push(tv);
                }
              }
              // Deduplicate non-color arrays (like sacredGeometryModes)
              if (newArray.length > 0 && typeof newArray[0] === 'string' && !newArray[0].startsWith('#')) {
                (next as any)[k] = [...new Set(newArray)];
              } else {
                (next as any)[k] = newArray;
              }
            }
          } else {
            if (progress > 0.5) {
              (next as any)[k] = targetVal;
            }
          }
        }
        return next;
      });
      
      if (progress < 1) {
        tweenAnimRef.current = requestAnimationFrame(animate);
      }
    };
    
    tweenAnimRef.current = requestAnimationFrame(animate);
  }, [setParams]);

  const generateRandomParams = useCallback((mode: 'random' | 'smart' | 'dj' | 'sacred' | 'rhythmic' | 'rainbow' | 'astral', partial: boolean = false) => {
    const prev = paramsRef.current;
    const targetParams: Partial<VisualizerParams> = {};
    
    const metrics = getAudioMetrics(prev.sensitivity, prev.freqRange);
    const hasAudio = audioActive && metrics.volume > 0.01;
    
    // Detect song part based on long-term volume
    const longTermVol = lastMetricsRef.current.longTermVolume;
    let songPart: 'intro/bridge' | 'verse' | 'chorus' = 'verse';
    if (hasAudio) {
      if (metrics.volume > longTermVol * 1.3 && metrics.volume > 0.5) {
        songPart = 'chorus';
      } else if (metrics.volume < longTermVol * 0.7 || metrics.volume < 0.2) {
        songPart = 'intro/bridge';
      }
    }
    
    let mood = 'balanced';
    if ((mode === 'smart' || mode === 'dj' || mode === 'sacred' || mode === 'rhythmic' || mode === 'astral') && hasAudio) {
      if (metrics.frequency < 0.3) mood = 'bass';
      else if (metrics.frequency > 0.6) mood = 'treble';
      else mood = 'mid';
    } else {
      const rand = Math.random();
      if (rand < 0.33) mood = 'bass';
      else if (rand < 0.66) mood = 'treble';
      else mood = 'mid';
    }

    const isDJ = mode === 'dj';

    const genGeometry = () => {
      if (mode === 'random') {
        targetParams.k = 0.98 + Math.random() * 0.04;
        targetParams.psi = Math.random() * Math.PI * 2;
        targetParams.z0_r = (Math.random() - 0.5) * 2;
        targetParams.z0_i = (Math.random() - 0.5) * 2;
        targetParams.iter = Math.floor(500 + Math.random() * 1500);
        targetParams.zoom = 0.0001 + Math.random() * 0.0099;
        targetParams.distanceZoom = 0.1 + Math.random() * 4.9;
        targetParams.spiralThickness = 0.1 + Math.random() * 4.9;
        
        // Randomize advanced auto-regeneration settings
        targetParams.autoTimeDelayMode = Math.random() > 0.5 ? 'smart' : 'custom';
        targetParams.autoTimeDelay = 1 + Math.random() * 4;
        targetParams.autoParamRegenMode = Math.random() > 0.5 ? 'instant' : 'custom';
        targetParams.autoParamRegenDelay = Math.random() * 3;
        targetParams.autoParamRegenBuffer = 20 + Math.random() * 60;
        targetParams.autoOptionSaturationAuto = Math.random() > 0.5;
        targetParams.autoOptionSaturation = 20 + Math.random() * 60;
        targetParams.autoRelationshipMode = Math.random() > 0.5 ? 'empathetic' : 'technical';
        targetParams.autoParamRatioLeveler = Math.random() * 100;
        targetParams.autoOffscreenFade = Math.random() > 0.3;
      } else if (mode === 'sacred') {
        targetParams.k = 1.0 + (Math.random() - 0.5) * 0.02; // Very close to 1
        targetParams.psi = Math.random() * Math.PI * 2;
        targetParams.z0_r = 0; // Centered
        targetParams.z0_i = 0;
        targetParams.iter = 1200 + Math.random() * 800;
        targetParams.zoom = 0.0005 + Math.random() * 0.0005;
        targetParams.distanceZoom = 1.0 + Math.random() * 1.0;
        targetParams.spiralThickness = 0.5 + Math.random() * 1.0;
        
        targetParams.autoTimeDelayMode = 'smart';
        targetParams.autoParamRegenMode = 'instant';
        targetParams.autoOptionSaturationAuto = true;
        targetParams.autoRelationshipMode = 'empathetic';
        targetParams.autoParamRatioLeveler = 80 + Math.random() * 20; // High balance for sacred
        targetParams.autoOffscreenFade = true;
      } else if (mode === 'rhythmic') {
        // Intelligent Rhythmic Geometry
        // Bass drives complexity (k) and zoom stability
        // Mid drives iteration count (detail)
        // Treble drives spiral thickness
        
        const baseK = 0.98;
        const kVariation = metrics.bass * 0.019; // 0.98 to 0.999 (keeps it stable but reactive)
        targetParams.k = baseK + kVariation;
        
        // Smooth rotation based on mid frequencies
        targetParams.psi = prev.psi + (metrics.mid * Math.PI / 4);
        
        // Keep strictly centered to avoid disappearing
        targetParams.z0_r = Math.sin(Date.now() / 3000) * 0.01;
        targetParams.z0_i = Math.cos(Date.now() / 3000) * 0.01;
        
        // Iterations based on overall volume, mid, and song part
        let baseIter = 800;
        if (songPart === 'chorus') baseIter = 1200;
        else if (songPart === 'intro/bridge') baseIter = 500;
        targetParams.iter = baseIter + Math.floor(metrics.volume * 600) + Math.floor(metrics.mid * 400);
        
        // Zoom should be very stable, slightly pulsing with bass
        targetParams.zoom = 0.0008 - (metrics.bass * 0.0003); // 0.0005 to 0.0008
        
        // Distance zoom (camera distance) pulses with bass, pulls back during chorus
        targetParams.distanceZoom = (songPart === 'chorus' ? 1.5 : 1.2) - (metrics.bass * 0.3); // 0.9 to 1.5
        
        // Thickness based on treble (crisp highs = thicker/sharper lines)
        targetParams.spiralThickness = 0.8 + (metrics.treble * 1.5); // 0.8 to 2.3

        targetParams.autoTimeDelayMode = 'smart';
        targetParams.autoParamRegenMode = 'instant';
        targetParams.autoOptionSaturationAuto = true;
        targetParams.autoRelationshipMode = 'technical';
        targetParams.autoParamRatioLeveler = 30 + (metrics.volume * 40); // 30 to 70
        targetParams.autoOffscreenFade = true;
      } else if (mode === 'rainbow') {
        // Rainbow mode: vibrant, fluid, highly reactive to all frequencies
        targetParams.k = 0.98 + (metrics.mid * 0.04); // Mid frequencies drive the tightness
        targetParams.psi = prev.psi + (metrics.treble * Math.PI); // Treble drives rotation
        
        // Z0 perturbation based on volume
        targetParams.z0_r = (Math.random() - 0.5) * (metrics.volume * 0.1);
        targetParams.z0_i = (Math.random() - 0.5) * (metrics.volume * 0.1);
        
        targetParams.iter = 1500 + Math.floor(metrics.volume * 1000);
        targetParams.zoom = 0.0002 + (metrics.bass * 0.0008);
        targetParams.distanceZoom = 0.5 + (metrics.treble * 2.0);
        targetParams.spiralThickness = 1.5 + (metrics.bass * 1.5);

        targetParams.autoTimeDelayMode = 'smart';
        targetParams.autoParamRegenMode = 'instant';
        targetParams.autoOptionSaturationAuto = true;
        targetParams.autoRelationshipMode = 'empathetic';
        targetParams.autoParamRatioLeveler = 50 + Math.random() * 50;
        targetParams.autoOffscreenFade = true;
      } else if (mode === 'astral') {
        // Astral mode: deep, trippy, drifting, metamorphic
        targetParams.k = 0.98 + (metrics.bass * 0.03); // Bass drives the core shape
        targetParams.psi = prev.psi + (metrics.volume * Math.PI); // Hyperfluid rotation
        
        // Slow astral drifting, perturbed by mid frequencies
        targetParams.z0_r = Math.sin(Date.now() / 5000) * 0.05 * (1 + metrics.mid);
        targetParams.z0_i = Math.cos(Date.now() / 5000) * 0.05 * (1 + metrics.mid);
        
        targetParams.iter = 1000 + Math.floor(metrics.mid * 1000); // High detail
        targetParams.zoom = 0.0002 + (metrics.treble * 0.0006); // Deep zoom
        targetParams.distanceZoom = 0.5 + (metrics.bass * 3.0); // Trippy depth
        targetParams.spiralThickness = 1.0 + (metrics.volume * 2.0);

        targetParams.autoTimeDelayMode = 'smart';
        targetParams.autoParamRegenMode = 'smooth'; // Liquid transitions
        targetParams.autoOptionSaturationAuto = true;
        targetParams.autoRelationshipMode = 'empathetic';
        targetParams.autoParamRatioLeveler = 80 + Math.random() * 20; // High harmony
        targetParams.autoOffscreenFade = false; // Let it fill the screen
      } else {
        // Smart / DJ / Default modes
        // Intelligent Geometry based on audio metrics, mood, and song part
        
        // K value (spiral tightness): Bass makes it tighter, treble makes it looser
        const baseK = 1.0;
        const kVariation = (metrics.bass * 0.02) - (metrics.treble * 0.01);
        targetParams.k = baseK + kVariation;
        
        // Psi (rotation): Mid frequencies drive the rotation target
        targetParams.psi = prev.psi + (metrics.mid * Math.PI / 2);
        
        // Z0 (center perturbation): Bass causes slight off-center shifts, treble keeps it centered
        if (metrics.bass > 0.6) {
           targetParams.z0_r = (Math.random() - 0.5) * (metrics.bass * 0.15);
           targetParams.z0_i = (Math.random() - 0.5) * (metrics.bass * 0.15);
        } else {
           targetParams.z0_r = Math.sin(Date.now() / 4000) * 0.02;
           targetParams.z0_i = Math.cos(Date.now() / 4000) * 0.02;
        }
        
        // Balance advanced auto-regeneration settings
        targetParams.autoTimeDelayMode = 'smart';
        targetParams.autoTimeDelay = 2 + Math.random() * 2;
        targetParams.autoParamRegenMode = 'custom';
        targetParams.autoParamRegenDelay = 1 + Math.random() * 1.5;
        targetParams.autoParamRegenBuffer = 40 + Math.random() * 20;
        targetParams.autoOptionSaturationAuto = true;
        targetParams.autoOptionSaturation = 50 + Math.random() * 30;
        targetParams.autoRelationshipMode = 'empathetic';
        targetParams.autoParamRatioLeveler = 40 + Math.random() * 40; // Balanced
        targetParams.autoOffscreenFade = true;
        
        if (mood === 'bass') {
          targetParams.iter = isDJ ? 1500 + Math.floor(metrics.bass * 1000) : 800 + Math.floor(metrics.bass * 500);
          targetParams.zoom = isDJ ? 0.0008 + (metrics.bass * 0.0005) : 0.001 + (metrics.bass * 0.001);
          targetParams.distanceZoom = 1.5 + (metrics.bass * 1.0);
          targetParams.spiralThickness = 1.5 + (metrics.bass * 1.5);
        } else if (mood === 'treble') {
          targetParams.iter = isDJ ? 2500 + Math.floor(metrics.treble * 1500) : 1500 + Math.floor(metrics.treble * 1000);
          targetParams.zoom = isDJ ? 0.0002 + (metrics.treble * 0.0003) : 0.0005 + (metrics.treble * 0.0005);
          targetParams.distanceZoom = 0.5 + (metrics.treble * 0.5);
          targetParams.spiralThickness = 0.2 + (metrics.treble * 0.4);
        } else {
          targetParams.iter = isDJ ? 2000 + Math.floor(metrics.mid * 1000) : 1000 + Math.floor(metrics.mid * 800);
          targetParams.zoom = 0.0008 + (metrics.mid * 0.001);
          targetParams.distanceZoom = 0.8 + (metrics.mid * 0.4);
          targetParams.spiralThickness = 0.8 + (metrics.mid * 0.6);
        }
      }
    };

    const genColors = () => {
      if (mode === 'random') {
        targetParams.harmonicColor = Math.random() > 0.5;
        targetParams.baseHue = Math.random() * 360;
        targetParams.hueRange = Math.random() * 720;
        targetParams.saturation = Math.random() * 100;
        targetParams.brightness = Math.random() * 100;
        targetParams.hueSpeed = Math.random() * 5;
        if (!isLocked) {
          targetParams.trail = Math.random();
        }
      } else if (mode === 'sacred') {
        targetParams.harmonicColor = true;
        targetParams.baseHue = Math.random() * 360;
        targetParams.hueRange = 60 + Math.random() * 60;
        
        // Tonal geometry (light and dark)
        const isDark = Math.random() > 0.5;
        targetParams.brightness = isDark ? 10 + Math.random() * 20 : 70 + Math.random() * 30;
        targetParams.saturation = 40 + Math.random() * 40;
        
        targetParams.hueSpeed = 0.1 + Math.random() * 0.3;
        targetParams.trail = 0.8 + Math.random() * 0.15;
      } else if (mode === 'rhythmic') {
        targetParams.harmonicColor = true;
        
        // Base hue shifts slowly, but jumps on strong treble or bass
        if (metrics.treble > 0.7 || metrics.bass > 0.8) {
          targetParams.baseHue = (prev.baseHue + 60 + Math.random() * 60) % 360;
        } else {
          targetParams.baseHue = (prev.baseHue + 10) % 360;
        }
        
        // Hue range expands with mid/treble and song part
        let baseHueRange = 60;
        if (songPart === 'chorus') baseHueRange = 180;
        else if (songPart === 'intro/bridge') baseHueRange = 30;
        targetParams.hueRange = baseHueRange + (metrics.mid * 120); 
        
        // Brightness and saturation
        targetParams.brightness = (songPart === 'chorus' ? 50 : 30) + (metrics.volume * 40);
        targetParams.saturation = (songPart === 'intro/bridge' ? 40 : 60) + (metrics.bass * 40);
        
        targetParams.hueSpeed = (songPart === 'chorus' ? 0.5 : 0.2) + (metrics.treble * 1.5);
        targetParams.trail = (songPart === 'intro/bridge' ? 0.9 : 0.8) - (metrics.bass * 0.4); // Less trail on heavy bass for punchy look
      } else if (mode === 'rainbow') {
        targetParams.harmonicColor = Math.random() > 0.5;
        targetParams.baseHue = Math.random() * 360;
        targetParams.hueRange = 360; // Full rainbow
        
        targetParams.brightness = 50 + Math.random() * 50;
        targetParams.saturation = 80 + Math.random() * 20;
        
        targetParams.hueSpeed = 1.0 + Math.random() * 2.0; // Fast color cycling
        targetParams.trail = 0.5 + Math.random() * 0.4;
      } else if (mode === 'astral') {
        targetParams.harmonicColor = true;
        targetParams.baseHue = (prev.baseHue + 5 + (metrics.treble * 20)) % 360; // Continuous shifting
        targetParams.hueRange = 180 + Math.random() * 180; // Wide, psychedelic range
        targetParams.brightness = 60 + (metrics.volume * 40); // Luminous
        targetParams.saturation = 80 + (metrics.mid * 20); // Vibrant
        targetParams.hueSpeed = 0.5 + (metrics.treble * 2.0); // Liquid color flow
        targetParams.trail = 0.8 + (metrics.bass * 0.15); // Hypnotic trails
      } else {
        targetParams.harmonicColor = mode === 'smart' ? true : Math.random() > 0.3;
        if (mood === 'bass') {
          targetParams.baseHue = (Math.random() * 60 + 200) % 360; // Blues/Purples
          targetParams.hueRange = 40 + Math.random() * 40; // Tight range
          targetParams.saturation = isDJ ? 90 + Math.random() * 10 : 70 + Math.random() * 20;
          targetParams.brightness = isDJ ? 20 + Math.random() * 15 : 10 + Math.random() * 10;
          targetParams.hueSpeed = isDJ ? 0.8 + Math.random() * 0.5 : 0.1 + Math.random() * 0.2;
          targetParams.trail = isDJ ? 0.85 + Math.random() * 0.1 : 0.7 + Math.random() * 0.2;
        } else if (mood === 'treble') {
          targetParams.baseHue = (Math.random() * 60 + 0) % 360; // Reds/Oranges/Yellows
          targetParams.hueRange = isDJ ? 180 + Math.random() * 180 : 120 + Math.random() * 120; // Wide range
          targetParams.saturation = isDJ ? 95 + Math.random() * 5 : 85 + Math.random() * 15;
          targetParams.brightness = isDJ ? 40 + Math.random() * 30 : 25 + Math.random() * 20;
          targetParams.hueSpeed = isDJ ? 2.0 + Math.random() * 1.5 : 0.8 + Math.random() * 1.0;
          targetParams.trail = isDJ ? 0.1 + Math.random() * 0.1 : 0.3 + Math.random() * 0.2;
        } else {
          targetParams.baseHue = (Math.random() * 120 + 80) % 360; // Greens/Cyans
          targetParams.hueRange = 90 + Math.random() * 90;
          targetParams.saturation = 75 + Math.random() * 20;
          targetParams.brightness = 15 + Math.random() * 15;
          targetParams.hueSpeed = 0.3 + Math.random() * 0.5;
          targetParams.trail = 0.5 + Math.random() * 0.2;
        }
      }
    };

    const genSG = () => {
      const allSgModes = SACRED_GEOMETRY_OPTIONS.map(o => o.id as SacredGeometryMode);

      const selectModes = (options: SacredGeometryMode[], maxPossible: number) => {
        const count = Math.max(1, Math.floor(saturationFactor * maxPossible));
        
        // Intelligent selection based on audio metrics
        const bassModes = options.filter(m => ['torus', 'sriYantra', 'mandala1', 'cymatics', 'vectorEquilibrium', 'metatron'].includes(m));
        const midModes = options.filter(m => ['flowerOfLife', 'treeOfLife', 'mandala2', 'lotus', 'yinYang', 'goldenSpiral', 'dharmaChakra'].includes(m));
        const trebleModes = options.filter(m => ['chakras', 'om', 'mandala3', 'quantumWave', 'holographicFractal', 'merkaba', 'platonicSolids'].includes(m));
        
        let available: SacredGeometryMode[] = [];
        
        // Empathic mixing based on audio characteristics
        if (metrics.bass > 0.3) available.push(...bassModes);
        if (metrics.mid > 0.2) available.push(...midModes);
        if (metrics.treble > 0.3) available.push(...trebleModes);
        
        // If no audio or very low volume, use all options
        if (available.length === 0) {
          available = [...options];
        }
        
        // Ensure we only pick from the provided options
        available = available.filter(m => options.includes(m));
        
        // Remove duplicates
        available = [...new Set(available)];
        
        // If still empty, fallback to options
        if (available.length === 0) {
          available = [...options];
        }

        // Shuffle
        const shuffled = available.sort(() => 0.5 - Math.random());
        
        // If we don't have enough, fill with remaining options
        if (shuffled.length < count) {
          const remaining = options.filter(m => !shuffled.includes(m)).sort(() => 0.5 - Math.random());
          shuffled.push(...remaining);
        }
        
        return shuffled.slice(0, count);
      };

      if (mode === 'random') {
        targetParams.sacredGeometryEnabled = Math.random() > 0.5;
        
        if (!isLocked) {
          targetParams.sgTheme = Math.random() > 0.5 ? 'light' : 'dark';
          
          if (!partial) {
            targetParams.sgAutoHarmonic = Math.random() > 0.5;
            targetParams.sgAutoResonance = Math.random() > 0.5;
          }
          const drawModes = ['layers', 'nodes', 'both'] as const;
          targetParams.sgDrawMode = drawModes[Math.floor(Math.random() * drawModes.length)];
          targetParams.sgShowNodes = Math.random() > 0.5;
        }
        
        targetParams.sgGlobalOpacity = Math.random() * 3;
        targetParams.sgGlobalFlowSpeed = (Math.random() - 0.5) * 6;
        targetParams.sgGlobalAudioReactivity = Math.random() * 5;
        targetParams.sgGlobalViscosity = Math.random() * 3;
        
        if (!partial) {
          if (prev.sgAutoHarmonic || targetParams.sgAutoHarmonic) {
            targetParams.sacredGeometryModes = selectModes(allSgModes, 5);
          }
          if (prev.sgAutoResonance || targetParams.sgAutoResonance) {
            targetParams.spiralResonanceModes = selectModes(allSgModes, 4);
          }
        }
      } else if (mode === 'sacred') {
        targetParams.sacredGeometryEnabled = true;
        targetParams.sgTheme = Math.random() > 0.5 ? 'light' : 'dark';
        
        if (!partial) {
          targetParams.sgAutoHarmonic = true;
          targetParams.sgAutoResonance = true;
        }
        
        if (!partial) {
          if (prev.sgAutoHarmonic || targetParams.sgAutoHarmonic) {
            targetParams.sacredGeometryModes = selectModes(allSgModes, 5);
          }
        }
        
        targetParams.sgDrawMode = Math.random() > 0.7 ? 'layers' : 'both'; // Favor both in sacred mode
        targetParams.sgShowNodes = Math.random() > 0.5;
        targetParams.sgGlobalOpacity = 1.5 + Math.random() * 1.5;
        targetParams.sgGlobalFlowSpeed = (Math.random() - 0.5) * 2;
        targetParams.sgGlobalAudioReactivity = 1.0 + Math.random() * 2.0;
        targetParams.sgGlobalViscosity = 1.5 + Math.random() * 1.5;
        
        if (!partial) {
          if (prev.sgAutoResonance || targetParams.sgAutoResonance) {
            targetParams.spiralResonanceModes = selectModes(allSgModes, 4);
          }
        }
      } else if (mode === 'rhythmic') {
        targetParams.sacredGeometryEnabled = true;
        targetParams.sgTheme = metrics.bass > 0.6 ? 'dark' : 'light';
        
        if (!partial) {
          targetParams.sgAutoHarmonic = true;
          targetParams.sgAutoResonance = true;
        }
        
        if (!partial) {
          const selectedModes = selectModes(allSgModes, 4);
          if (prev.sgAutoHarmonic || targetParams.sgAutoHarmonic) targetParams.sacredGeometryModes = selectedModes;
          if (prev.sgAutoResonance || targetParams.sgAutoResonance) targetParams.spiralResonanceModes = selectedModes;
        }
        
        // Prefer 'both' for higher energy parts of the song
        targetParams.sgDrawMode = (songPart === 'chorus' || metrics.treble > 0.5 || metrics.volume > 0.6) ? 'both' : (Math.random() > 0.5 ? 'both' : 'nodes');
        targetParams.sgShowNodes = true;
        targetParams.sgGlobalOpacity = (songPart === 'intro/bridge' ? 0.3 : 0.5) + (metrics.volume * 0.5);
        targetParams.sgGlobalFlowSpeed = (metrics.mid * (songPart === 'chorus' ? 5 : 3)) * (Math.random() > 0.5 ? 1 : -1);
        targetParams.sgGlobalAudioReactivity = (songPart === 'intro/bridge' ? 0.5 : 1.0) + (metrics.bass * 3.0);
        targetParams.sgGlobalViscosity = (songPart === 'chorus' ? 0.5 : 0.8) - (metrics.treble * 0.5);
      } else if (mode === 'rainbow') {
        targetParams.sacredGeometryEnabled = true;
        targetParams.sgTheme = 'light';
        
        if (!partial) {
          targetParams.sgAutoHarmonic = true;
          targetParams.sgAutoResonance = true;
        }
        
        if (!partial) {
          if (prev.sgAutoHarmonic || targetParams.sgAutoHarmonic) {
            targetParams.sacredGeometryModes = selectModes(allSgModes, 6);
          }
        }
        
        targetParams.sgDrawMode = 'both';
        targetParams.sgShowNodes = true;
        targetParams.sgGlobalOpacity = 2.0 + Math.random() * 1.0;
        targetParams.sgGlobalFlowSpeed = (Math.random() - 0.5) * 6;
        targetParams.sgGlobalAudioReactivity = 2.5 + Math.random() * 2.5;
        targetParams.sgGlobalViscosity = 1.0 + Math.random() * 2.0;
        
        if (!partial) {
          if (prev.sgAutoResonance || targetParams.sgAutoResonance) {
            targetParams.spiralResonanceModes = selectModes(allSgModes, 4);
          }
        }
      } else if (mode === 'astral') {
        targetParams.sacredGeometryEnabled = true;
        targetParams.sgTheme = 'light'; // Christic luminosity
        
        if (!partial) {
          targetParams.sgAutoHarmonic = true;
          targetParams.sgAutoResonance = true;
        }
        
        if (!partial) {
          if (prev.sgAutoHarmonic || targetParams.sgAutoHarmonic) {
            targetParams.sacredGeometryModes = selectModes(allSgModes, 6);
          }
        }
        
        targetParams.sgDrawMode = 'both';
        targetParams.sgShowNodes = true;
        targetParams.sgGlobalOpacity = 0.6 + (metrics.volume * 0.4);
        targetParams.sgGlobalFlowSpeed = (metrics.mid * 4) * (Math.random() > 0.5 ? 1 : -1);
        targetParams.sgGlobalAudioReactivity = 2.0 + (metrics.bass * 2.0);
        targetParams.sgGlobalViscosity = 1.0 + (metrics.treble * 1.0); // Hyperfluid
        
        if (!partial) {
          if (prev.sgAutoResonance || targetParams.sgAutoResonance) {
            targetParams.spiralResonanceModes = selectModes(allSgModes, 5);
          }
        }
      } else {
        targetParams.sacredGeometryEnabled = isDJ ? true : Math.random() > 0.2;
        targetParams.sgTheme = mood === 'bass' ? 'dark' : (mood === 'treble' ? 'light' : (Math.random() > 0.5 ? 'light' : 'dark'));
        
        if (!partial) {
          targetParams.sgAutoHarmonic = mode === 'smart' ? true : Math.random() > 0.3;
          targetParams.sgAutoResonance = mode === 'smart' ? true : Math.random() > 0.3;
        }
        
        targetParams.sgGlobalOpacity = isDJ ? 0.7 + Math.random() * 0.3 : 0.4 + Math.random() * 0.6;
        targetParams.sgGlobalFlowSpeed = isDJ ? 1.5 + Math.random() * 2.0 : 0.5 + Math.random() * 1.5;
        targetParams.sgGlobalAudioReactivity = isDJ ? 2.0 + Math.random() * 4.0 : 0.5 + Math.random() * 2;
        targetParams.sgGlobalViscosity = Math.random();
        
        // Favorite 'both' (60% probability) or vary according to energy
        const rand = Math.random();
        targetParams.sgDrawMode = (mode === 'smart' || isDJ || metrics.volume > 0.6) ? 'both' : (rand > 0.4 ? 'both' : (rand > 0.2 ? 'layers' : 'nodes'));
        
        if (hasAudio && !isDJ && mode !== 'smart') {
           if (metrics.bass > 0.8) targetParams.sgDrawMode = 'nodes';
           else if (metrics.treble > 0.8) targetParams.sgDrawMode = 'layers';
        }
        
        targetParams.sgShowNodes = isDJ ? true : Math.random() > 0.3;
        
        const maxSg = isDJ ? 6 : 4;
        const maxSpiral = isDJ ? 5 : 3;
        
        if (!partial) {
          if (prev.sgAutoHarmonic || targetParams.sgAutoHarmonic) {
            targetParams.sacredGeometryModes = selectModes(allSgModes, maxSg);
          }
          if (prev.sgAutoResonance || targetParams.sgAutoResonance) {
            targetParams.spiralResonanceModes = selectModes(allSgModes, maxSpiral);
          }
        }
      }
    };

    const genReact = () => {
      const apModes: AutoPilotMode[] = isLocked ? ['harmonic', 'genesis'] : ['drift', 'harmonic', 'genesis'];
      if (mode === 'random') {
        if (!isLocked) {
          targetParams.sensitivity = Math.random() * 5;
          targetParams.freqRange = 0.1 + Math.random() * 0.9;
          targetParams.autoSpeed = Math.random() * 2;
          targetParams.autoViscosity = Math.random();
        }
        targetParams.autoPilot = isLocked ? true : Math.random() > 0.5;
        targetParams.autoPilotMode = apModes[Math.floor(Math.random() * apModes.length)];
        targetParams.rootNote = Math.floor(Math.random() * 12);
      } else if (mode === 'sacred') {
        targetParams.sensitivity = 0.5 + Math.random() * 1.0;
        targetParams.freqRange = 0.2 + Math.random() * 0.6;
        targetParams.autoPilot = true;
        targetParams.autoPilotMode = 'harmonic';
        targetParams.rootNote = Math.floor(Math.random() * 12);
        targetParams.autoSpeed = 0.2 + Math.random() * 0.4;
        targetParams.autoViscosity = 0.7 + Math.random() * 0.3;
      } else if (mode === 'rhythmic') {
        targetParams.sensitivity = (songPart === 'chorus' ? 3.0 : 2.0) + (metrics.volume * 2.0);
        targetParams.freqRange = (songPart === 'intro/bridge' ? 0.3 : 0.5) + (metrics.mid * 0.4);
        targetParams.autoPilot = true;
        targetParams.autoPilotMode = (songPart === 'chorus' || metrics.bass > 0.7) ? 'genesis' : 'harmonic';
        
        // Root note based on baseHue to keep it harmonic
        targetParams.rootNote = Math.floor((targetParams.baseHue || prev.baseHue) / 30) % 12;
        
        targetParams.autoSpeed = (songPart === 'chorus' ? 0.5 : 0.2) + (metrics.mid * 1.5);
        targetParams.autoViscosity = (songPart === 'intro/bridge' ? 0.9 : 0.7) - (metrics.bass * 0.4);
      } else if (mode === 'rainbow') {
        targetParams.sensitivity = 3.0 + Math.random() * 2.0;
        targetParams.freqRange = 0.8 + Math.random() * 0.2;
        targetParams.autoPilot = true;
        targetParams.autoPilotMode = 'genesis';
        targetParams.rootNote = Math.floor(Math.random() * 12);
        targetParams.autoSpeed = 1.0 + Math.random() * 2.0;
        targetParams.autoViscosity = 0.8 + Math.random() * 0.2; // Viscous
      } else if (mode === 'astral') {
        targetParams.sensitivity = 3.0 + (metrics.volume * 3.0);
        targetParams.freqRange = 0.6 + (metrics.mid * 0.4);
        targetParams.autoPilot = true;
        targetParams.autoPilotMode = 'genesis'; // Transcendental
        targetParams.rootNote = Math.floor((targetParams.baseHue || prev.baseHue) / 30) % 12;
        targetParams.autoSpeed = 0.5 + (metrics.mid * 1.5);
        targetParams.autoViscosity = 0.8 + (metrics.bass * 0.2); // Smooth, liquid
      } else {
        targetParams.sensitivity = isDJ ? 6 + Math.random() * 4 : 3 + Math.random() * 5;
        targetParams.freqRange = 0.5 + Math.random() * 1.0;
        targetParams.autoPilot = isLocked ? true : (isDJ ? true : Math.random() > 0.1);
        targetParams.autoPilotMode = mode === 'smart' ? 'harmonic' : apModes[Math.floor(Math.random() * apModes.length)];
        targetParams.rootNote = Math.floor(Math.random() * 12);
        
        if (mood === 'bass') {
          targetParams.autoSpeed = 0.2 + Math.random() * 0.5;
          targetParams.autoViscosity = 0.8 + Math.random() * 0.2;
        } else if (mood === 'treble') {
          targetParams.autoSpeed = isDJ ? 2.0 + Math.random() * 2.0 : 1.5 + Math.random() * 1.5;
          targetParams.autoViscosity = 0.1 + Math.random() * 0.3;
        } else {
          targetParams.autoSpeed = 0.7 + Math.random() * 0.8;
          targetParams.autoViscosity = 0.4 + Math.random() * 0.4;
        }
      }
    };

    const genBg = () => {
      const bgModes: BackgroundMode[] = ['solid', 'gradient', 'liquid-rainbow', 'crystal-bubbles', 'organic-fade', 'morphing-colors'];
      
      const generateHarmonicColors = (baseHue: number, count: number, isDark: boolean) => {
        const colors = [];
        for (let i = 0; i < count; i++) {
          const hue = (baseHue + i * (360 / count)) % 360;
          const sat = 40 + Math.random() * 40;
          const light = isDark ? 5 + Math.random() * 15 : 70 + Math.random() * 20;
          
          // Convert HSL to Hex
          const s = sat / 100;
          const l = light / 100;
          const k = (n: number) => (n + hue / 30) % 12;
          const a = s * Math.min(l, 1 - l);
          const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
          
          const r = Math.round(255 * f(0)).toString(16).padStart(2, '0');
          const g = Math.round(255 * f(8)).toString(16).padStart(2, '0');
          const b = Math.round(255 * f(4)).toString(16).padStart(2, '0');
          
          colors.push(`#${r}${g}${b}`);
        }
        return colors;
      };

      if (mode === 'random') {
        targetParams.bgMode = bgModes[Math.floor(Math.random() * bgModes.length)];
        const numColors = 2 + Math.floor(Math.random() * 3);
        targetParams.bgColors = generateHarmonicColors(Math.random() * 360, numColors, Math.random() > 0.5);
        targetParams.bgSpeed = Math.random() * 2;
        targetParams.bgVignetteIntensity = Math.random();
      } else if (mode === 'sacred') {
        const sacredBgModes: BackgroundMode[] = ['gradient', 'organic-fade', 'morphing-colors'];
        targetParams.bgMode = sacredBgModes[Math.floor(Math.random() * sacredBgModes.length)];
        
        const isDark = Math.random() > 0.5; // Tonal geometry
        const baseHue = Math.random() * 360;
        targetParams.bgColors = generateHarmonicColors(baseHue, 3, isDark);
        
        targetParams.bgSpeed = 0.1 + Math.random() * 0.3;
        targetParams.bgVignetteIntensity = 0.6 + Math.random() * 0.4;
      } else if (mode === 'rhythmic') {
        if (songPart === 'chorus' || metrics.bass > 0.8) targetParams.bgMode = 'morphing-colors';
        else if (metrics.treble > 0.7) targetParams.bgMode = 'gradient';
        else targetParams.bgMode = 'organic-fade';
        
        const isDark = metrics.bass > 0.5 || songPart === 'intro/bridge';
        targetParams.bgColors = generateHarmonicColors(targetParams.baseHue || prev.baseHue, (songPart === 'chorus' || metrics.volume > 0.6) ? 4 : 2, isDark);
        
        targetParams.bgSpeed = (songPart === 'chorus' ? 0.5 : 0.1) + (metrics.mid * 1.8);
        targetParams.bgVignetteIntensity = (songPart === 'intro/bridge' ? 0.6 : 0.3) + (metrics.bass * 0.5);
      } else if (mode === 'rainbow') {
        const rainbowBgModes: BackgroundMode[] = ['morphing-colors', 'organic-fade', 'gradient'];
        targetParams.bgMode = rainbowBgModes[Math.floor(Math.random() * rainbowBgModes.length)];
        
        const baseHue = Math.random() * 360;
        targetParams.bgColors = generateHarmonicColors(baseHue, 5, false); // Bright, many colors
        
        targetParams.bgSpeed = 1.0 + Math.random() * 2.0;
        targetParams.bgVignetteIntensity = 0.2 + Math.random() * 0.6;
      } else if (mode === 'astral') {
        targetParams.bgMode = 'organic-fade'; // Liquid transitions
        targetParams.bgColors = generateHarmonicColors(targetParams.baseHue || prev.baseHue, 5, false); // Many balanced colors
        targetParams.bgSpeed = 0.3 + (metrics.mid * 1.5);
        targetParams.bgVignetteIntensity = 0.2 + (metrics.bass * 0.3); // Bright, luminous
      } else {
        targetParams.bgMode = isDJ ? 'morphing-colors' : bgModes[Math.floor(Math.random() * bgModes.length)];
        const isDark = mood === 'bass' ? true : (mood === 'treble' ? false : Math.random() > 0.5);
        const baseHue = Math.random() * 360;
        const numColors = isDJ ? 4 : 2 + Math.floor(Math.random() * 2);
        targetParams.bgColors = generateHarmonicColors(baseHue, numColors, isDark);
        
        targetParams.bgSpeed = isDJ ? 1.5 + Math.random() * 1.5 : 0.5 + Math.random() * 1.0;
        targetParams.bgVignetteIntensity = isDJ ? 0.8 + Math.random() * 0.2 : 0.4 + Math.random() * 0.4;
      }
    };

    const fluidityFactor = autoStyleFluidity / 100;
    const reactivityFactor = autoRandomReactivitySpeed / 100;

    let currentSaturation = prev.autoOptionSaturation;
    if (prev.autoOptionSaturationAuto && hasAudio) {
      // Adapt intelligently to audio
      currentSaturation = 20 + (metrics.volume * 40) + (metrics.bass * 20) + (metrics.treble * 20);
      currentSaturation = Math.min(100, Math.max(0, currentSaturation));
    }
    const saturationFactor = currentSaturation / 100;

    if (partial) {
      const categories = [genGeometry, genColors, genSG, genReact, genBg];
      categories.sort(() => Math.random() - 0.5);
      
      // Saturation determines how many categories update during a partial change
      const maxUpdates = isDJ ? 5 : 4;
      const minUpdates = 1;
      const numToUpdate = Math.max(minUpdates, Math.floor(saturationFactor * maxUpdates));
      
      for (let i = 0; i < numToUpdate; i++) {
        categories[i]();
      }
    } else {
      genGeometry();
      genColors();
      genSG();
      genReact();
      genBg();
    }

    // Blend targetParams with current params based on fluidity for numeric values
    // 100% fluidity = use targetParams entirely
    // 0% fluidity = keep current params (no change)
    if (fluidityFactor < 1.0) {
      for (const key in targetParams) {
        const k = key as keyof VisualizerParams;
        if (typeof targetParams[k] === 'number' && typeof prev[k] === 'number') {
          (targetParams as any)[k] = (prev as any)[k] + ((targetParams as any)[k] - (prev as any)[k]) * fluidityFactor;
        }
      }
    }
    
    // Base duration depends on partial update and mood
    let baseDuration = partial ? 3000 : 1500;
    if (mood === 'bass') baseDuration *= 1.5; // Slower, heavier transitions for bass
    else if (mood === 'treble') baseDuration *= 0.7; // Faster, snappier transitions for treble
    
    // Calculate final duration using reactivity speed and transition smoothness
    // 0% reactivity = very slow (e.g. up to 8000ms)
    // 100% reactivity = very fast (e.g. 100ms)
    let tweenDuration = 100 + (baseDuration * 3 * (1 - reactivityFactor));
    
    // Apply transition smoothness
    // If emotional detection is on, automatically seek more smoothness
    let finalSmoothness = autoTransitionSmoothness / 100;
    if (autoRandomOnEmotionChange) {
      finalSmoothness = Math.min(1.0, finalSmoothness + 0.2); // Boost smoothness automatically
    }
    
    // Smoothness also affects duration: smoother = longer duration
    tweenDuration = tweenDuration * (0.5 + finalSmoothness);

    // Remove locked params
    if (prev.lockedParams && prev.lockedParams.length > 0) {
      for (const key of prev.lockedParams) {
        if (key in targetParams) {
          delete (targetParams as any)[key];
        }
      }
      
      // Handle individual array locks
      if (targetParams.sacredGeometryModes) {
        const currentSgModes = prev.sacredGeometryModes || [];
        const newSgModes: SacredGeometryMode[] = [];
        const allModes = SACRED_GEOMETRY_OPTIONS.map(o => o.id as SacredGeometryMode);
        
        allModes.forEach(mode => {
          const isLocked = prev.lockedParams?.includes(`sacredMode_${mode}`);
          if (isLocked) {
            if (currentSgModes.includes(mode)) newSgModes.push(mode);
          } else {
            if (targetParams.sacredGeometryModes?.includes(mode)) newSgModes.push(mode);
          }
        });
        targetParams.sacredGeometryModes = newSgModes;
      }

      if (targetParams.spiralResonanceModes) {
        const currentResModes = prev.spiralResonanceModes || [];
        const newResModes: SacredGeometryMode[] = [];
        const allModes = SACRED_GEOMETRY_OPTIONS.map(o => o.id as SacredGeometryMode);
        
        allModes.forEach(mode => {
          const isLocked = prev.lockedParams?.includes(`spiralMode_${mode}`);
          if (isLocked) {
            if (currentResModes.includes(mode)) newResModes.push(mode);
          } else {
            if (targetParams.spiralResonanceModes?.includes(mode)) newResModes.push(mode);
          }
        });
        targetParams.spiralResonanceModes = newResModes;
      }
    }

    tweenParams(targetParams, tweenDuration, finalSmoothness);
  }, [tweenParams, getAudioMetrics, audioActive, autoStyleFluidity, autoRandomReactivitySpeed, autoTransitionSmoothness, autoRandomOnEmotionChange]);

  useEffect(() => {
    let intervalId: any;
    
    // Run interval if emotion change is disabled OR if audio is not active (fallback)
    if (params.autoRandomMode !== 'none' && (!autoRandomOnEmotionChange || !audioActive)) {
      intervalId = setInterval(() => {
        // Pass false so that structural changes (like sacred geometry modes) also update
        generateRandomParams(params.autoRandomMode as any, false);
      }, autoRandomInterval * 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [params.autoRandomMode, autoRandomInterval, autoRandomOnEmotionChange, audioActive, generateRandomParams]);

  useEffect(() => {
    let animationFrameId: number;
    let beatCooldown = 0;
    
    const checkEmotion = () => {
      if (params.autoRandomMode !== 'none' && (autoRandomOnEmotionChange || params.autoRandomOnBeat) && audioActive) {
        const now = Date.now();
        const metrics = getAudioMetrics(params.sensitivity, params.freqRange);
        const last = lastMetricsRef.current;
        
        const deltaV = metrics.volume - last.volume;
        const deltaF = Math.abs(metrics.frequency - last.frequency);
        const deltaBass = metrics.bass - last.bass;
        
        const sensitivityFactor = autoEmotionSensitivity / 100;
        const beatSensitivityFactor = autoBeatSensitivity / 100;
        
        const thresholdV = 0.8 - (0.7 * sensitivityFactor);
        const thresholdF = 0.5 - (0.45 * sensitivityFactor);
        const cooldown = 4000 - (3500 * sensitivityFactor);
        const maxWaitTime = 15000 - (10000 * sensitivityFactor); // 5-15 seconds fallback
        
        // Emotion/Style Detection (Slow, structural changes)
        if (autoRandomOnEmotionChange) {
          if (now - last.time > cooldown) {
            if (deltaV > thresholdV) {
              generateRandomParams(params.autoRandomMode as any, false);
              lastMetricsRef.current = { ...metrics, time: now, longTermVolume: last.longTermVolume };
            } else if (deltaF > thresholdF) {
              generateRandomParams(params.autoRandomMode as any, true);
              lastMetricsRef.current = { ...metrics, time: now, longTermVolume: last.longTermVolume };
            } else if (now - last.time > maxWaitTime) {
              // Fallback if no significant emotion change detected for a while
              generateRandomParams(params.autoRandomMode as any, true);
              lastMetricsRef.current = { ...metrics, time: now, longTermVolume: last.longTermVolume };
            }
          }
        }

        // Beat Detection (Fast, reactive changes)
        if (params.autoRandomOnBeat) {
          const beatThreshold = 0.7 - (0.5 * beatSensitivityFactor); // 0.2 to 0.7
          const minCooldown = 1000 - (700 * beatSensitivityFactor); // 300ms to 1000ms cooldown
          
          if (now - beatCooldown > minCooldown) { 
            // Detect beat primarily from bass, fallback to volume
            const isBeat = (deltaBass > beatThreshold && metrics.bass > 0.45) || 
                           (deltaV > beatThreshold && metrics.volume > 0.55);
                           
            if (isBeat) {
              generateRandomParams(params.autoRandomMode as any, true); // Partial update on beat
              beatCooldown = now;
            }
          }
        }
        
        lastMetricsRef.current.volume = last.volume * 0.95 + metrics.volume * 0.05;
        lastMetricsRef.current.frequency = last.frequency * 0.95 + metrics.frequency * 0.05;
        lastMetricsRef.current.bass = last.bass * 0.95 + metrics.bass * 0.05;
        lastMetricsRef.current.mid = last.mid * 0.95 + metrics.mid * 0.05;
        lastMetricsRef.current.treble = last.treble * 0.95 + metrics.treble * 0.05;
        lastMetricsRef.current.longTermVolume = last.longTermVolume * 0.995 + metrics.volume * 0.005; // Very slow moving average for song parts
      }
      
      animationFrameId = requestAnimationFrame(checkEmotion);
    };
    
    checkEmotion();
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [params.autoRandomMode, autoRandomOnEmotionChange, params.autoRandomOnBeat, audioActive, params.sensitivity, params.freqRange, generateRandomParams, getAudioMetrics, autoEmotionSensitivity, autoBeatSensitivity]);

  const prevAutoRandomModeRef = useRef(params.autoRandomMode);
  useEffect(() => {
    if (params.autoRandomMode !== prevAutoRandomModeRef.current) {
      if (params.autoRandomMode !== 'none') {
        generateRandomParams(params.autoRandomMode as any, false);
      }
      prevAutoRandomModeRef.current = params.autoRandomMode;
    }
  }, [params.autoRandomMode, generateRandomParams]);

  const handleInstallClick = () => {
    window.open("https://drive.google.com/drive/folders/1bZ8yvbWr7r3eJUdKIQCSSuu-p398mAkn?usp=sharing", "_blank");
  };

  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    const handleFullScreenChange = async () => {
      const isFull = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFull);
      
      if (isFull) {
        try {
          if ('wakeLock' in navigator) {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          }
        } catch (err: any) {
          if (err.name !== 'NotAllowedError') {
            console.warn(`Wake Lock error: ${err.message}`);
          }
        }
      } else {
        if (wakeLockRef.current) {
          wakeLockRef.current.release().then(() => {
            wakeLockRef.current = null;
          }).catch((err: any) => console.error(err));
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
      if (wakeLockRef.current) {
         wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullScreen = async () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && electronAPI.toggleFullscreen) {
      electronAPI.toggleFullscreen();
      setIsFullscreen(!isFullscreen);
      return;
    }

    const doc = document as any;
    const docEl = document.documentElement as any;
    const Capacitor = (window as any).Capacitor;

    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen().catch((err: any) => console.error(err));
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      } else if (Capacitor && Capacitor.isNative) {
        // Fallback for Capacitor/Android if web APIs fail
        const StatusBar = Capacitor.Plugins?.StatusBar;
        if (StatusBar) {
           await StatusBar.hide().catch(() => {});
        }
        setIsFullscreen(true);
      }
    } else {
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      } else if (Capacitor && Capacitor.isNative) {
        const StatusBar = Capacitor.Plugins?.StatusBar;
        if (StatusBar) {
           await StatusBar.show().catch(() => {});
        }
        setIsFullscreen(false);
      }
    }
  };
  
  const handleChange = (key: keyof VisualizerParams, value: number | boolean | string | string[]) => {
    if (typeof value === 'number' && isNaN(value)) return;
    
    if (key === 'autoPilot' && value === true) {
      setParams(prev => ({ 
        ...prev, 
        [key]: value,
        autoTimeDelayMode: Math.random() > 0.5 ? 'smart' : 'custom',
        autoTimeDelay: 1 + Math.random() * 4, // 1-5 seconds
        autoParamRegenMode: 'smooth',
        autoParamRegenDelay: Math.random() * 3, // 0-3 seconds
        autoParamRegenBuffer: 20 + Math.random() * 60, // 20-80%
        autoOptionSaturationAuto: Math.random() > 0.5,
        autoOptionSaturation: 40 + Math.random() * 40, // 40-80
        autoRelationshipMode: Math.random() > 0.5 ? 'empathetic' : 'technical',
        autoOffscreenFade: Math.random() > 0.3 // Mostly true
      }));
    } else {
      setParams(prev => ({ ...prev, [key]: value }));
    }
  };

  const randomizeSection = (section: string) => {
    if (isLocked) {
      onShowSubscription();
      return;
    }
    setParams(prev => {
      const next = { ...prev };
      const isLocked = (key: keyof VisualizerParams) => prev.lockedParams?.includes(key);

      switch (section) {
        case 'background':
          const modes: any[] = ['solid', 'gradient', 'liquid-rainbow', 'crystal-bubbles', 'organic-fade', 'morphing-colors'];
          if (!isLocked('bgMode')) next.bgMode = modes[Math.floor(Math.random() * modes.length)];
          if (!isLocked('bgColors')) next.bgColors = [
            `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`,
            `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`
          ];
          if (!isLocked('bgSpeed')) next.bgSpeed = Math.random() * 2;
          if (!isLocked('bgVignetteIntensity')) next.bgVignetteIntensity = Math.random();
          break;
        case 'baseGeometry':
          if (!isLocked('k')) next.k = 0.9 + Math.random() * 0.2;
          if (!isLocked('iter')) next.iter = Math.floor(500 + Math.random() * 1500);
          if (!isLocked('zoom')) next.zoom = 0.0001 + Math.random() * 0.0099;
          if (!isLocked('distanceZoom')) next.distanceZoom = 0.1 + Math.random() * 4.9;
          if (!isLocked('spiralThickness')) next.spiralThickness = 0.1 + Math.random() * 4.9;
          break;
        case 'transformation':
          if (!isLocked('psi')) next.psi = Math.random() * Math.PI * 2;
          if (!isLocked('z0_r')) next.z0_r = (Math.random() - 0.5) * 2;
          if (!isLocked('z0_i')) next.z0_i = (Math.random() - 0.5) * 2;
          break;
        case 'color':
          if (!isLocked('baseHue')) next.baseHue = Math.random() * 360;
          if (!isLocked('hueSpeed')) next.hueSpeed = Math.random() * 2;
          if (!isLocked('hueRange')) next.hueRange = Math.random() * 720;
          if (!isLocked('saturation')) next.saturation = 50 + Math.random() * 50;
          if (!isLocked('brightness')) next.brightness = Math.random() * 100;
          if (!isLocked('harmonicSensitivity')) next.harmonicSensitivity = Math.random() * 5;
          if (!isLocked('harmonicDepth')) next.harmonicDepth = Math.random() * 360;
          break;
        case 'reactivity':
          if (!isLocked('sensitivity')) next.sensitivity = Math.random() * 5;
          if (!isLocked('freqRange')) next.freqRange = 0.1 + Math.random() * 0.9;
          if (!isLocked('trail')) next.trail = Math.random();
          break;
        case 'spiralResonance':
          const resModes: SacredGeometryMode[] = ['goldenSpiral', 'flowerOfLife', 'quantumWave', 'torus', 'metatron', 'merkaba', 'platonicSolids', 'sriYantra', 'cymatics', 'vectorEquilibrium', 'treeOfLife', 'yinYang', 'mandala1', 'mandala2', 'mandala3', 'holographicFractal', 'chakras', 'om', 'lotus', 'dharmaChakra'];
          const currentResModes = prev.spiralResonanceModes || [];
          const newResModes: SacredGeometryMode[] = [];
          resModes.forEach(mode => {
            const isModeLocked = prev.lockedParams?.includes(`spiralMode_${mode}`);
            if (isModeLocked) {
              if (currentResModes.includes(mode)) newResModes.push(mode);
            } else {
              if (Math.random() > 0.7) newResModes.push(mode);
            }
          });
          if (newResModes.length === 0 && !prev.lockedParams?.some(k => k.startsWith('spiralMode_'))) {
             newResModes.push(resModes[Math.floor(Math.random() * resModes.length)]);
          }
          next.spiralResonanceModes = newResModes;
          break;
        case 'sacredGeometry':
          const sgModes: SacredGeometryMode[] = ['goldenSpiral', 'flowerOfLife', 'quantumWave', 'torus', 'metatron', 'merkaba', 'platonicSolids', 'sriYantra', 'cymatics', 'vectorEquilibrium', 'treeOfLife', 'yinYang', 'mandala1', 'mandala2', 'mandala3', 'holographicFractal', 'chakras', 'om', 'lotus', 'dharmaChakra'];
          const currentSgModes = prev.sacredGeometryModes || [];
          const newSgModes: SacredGeometryMode[] = [];
          sgModes.forEach(mode => {
            const isModeLocked = prev.lockedParams?.includes(`sacredMode_${mode}`);
            if (isModeLocked) {
              if (currentSgModes.includes(mode)) newSgModes.push(mode);
            } else {
              if (Math.random() > 0.7) newSgModes.push(mode);
            }
          });
          if (newSgModes.length === 0 && !prev.lockedParams?.some(k => k.startsWith('sacredMode_'))) {
             newSgModes.push(sgModes[Math.floor(Math.random() * sgModes.length)]);
          }
          next.sacredGeometryModes = newSgModes;
          if (!isLocked('sgGlobalOpacity')) next.sgGlobalOpacity = Math.random() * 3;
          if (!isLocked('sgGlobalFlowSpeed')) next.sgGlobalFlowSpeed = (Math.random() - 0.5) * 6;
          if (!isLocked('sgGlobalAudioReactivity')) next.sgGlobalAudioReactivity = Math.random() * 5;
          if (!isLocked('sgGlobalViscosity')) next.sgGlobalViscosity = Math.random() * 3;
          if (!isLocked('sgDrawMode')) next.sgDrawMode = 'both';
          break;
        case 'vrAr':
          if (!isLocked('vrDepth')) next.vrDepth = 1 + Math.random() * 99;
          if (!isLocked('vrRadius')) next.vrRadius = Math.random() * 20;
          if (!isLocked('vrThickness')) next.vrThickness = 0.1 + Math.random() * 9.9;
          if (!isLocked('vrDistance')) next.vrDistance = (Math.random() - 0.5) * 40;
          if (!isLocked('arIntensity')) next.arIntensity = Math.random();
          if (!isLocked('arPortalScale')) next.arPortalScale = 0.1 + Math.random() * 19.9;
          if (!isLocked('arPortalPerspectiveIntensity')) next.arPortalPerspectiveIntensity = Math.random() * 5;
          if (!isLocked('arPortalVanishingRadius')) next.arPortalVanishingRadius = Math.random() * 10;
          if (!isLocked('arPortalFade')) next.arPortalFade = Math.random() * 5;
          if (!isLocked('arPortalBending')) next.arPortalBending = Math.random();
          break;
      }
      return next;
    });
  };

  const centerSpiral = () => setParams(prev => ({ ...prev, z0_r: 0, z0_i: 0 }));

  const [presetCategories, setPresetCategories] = useState({
    baseGeometry: true,
    colors: true,
    sacredGeometry: true,
    vrAr: true,
    reactivity: true
  });
  // Presets LOCALES (sin nube, sin cuenta, ilimitados). Ver `use-local-presets.ts`.
  const { cloudPresets, savePreset, deletePreset: deleteCloudPresetFromServer } = useLocalPresets();
  const [presetName, setPresetName] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);


  const getExportData = () => {
    const exportData: Partial<VisualizerParams> = {};
    if (presetCategories.baseGeometry) {
      exportData.k = params.k; exportData.iter = params.iter; exportData.zoom = params.zoom;
      exportData.distanceZoom = params.distanceZoom; exportData.psi = params.psi;
      exportData.z0_r = params.z0_r; exportData.z0_i = params.z0_i; exportData.spiralThickness = params.spiralThickness;
    }
    if (presetCategories.colors) {
      exportData.baseHue = params.baseHue; exportData.hueSpeed = params.hueSpeed;
      exportData.hueRange = params.hueRange; exportData.saturation = params.saturation;
      exportData.brightness = params.brightness; exportData.trail = params.trail;
    }
    if (presetCategories.sacredGeometry) {
      exportData.sacredGeometryEnabled = params.sacredGeometryEnabled; exportData.sgTheme = params.sgTheme;
      exportData.sgAutoHarmonic = params.sgAutoHarmonic; exportData.sgAutoResonance = params.sgAutoResonance;
      exportData.sgGlobalOpacity = params.sgGlobalOpacity; exportData.sgGlobalFlowSpeed = params.sgGlobalFlowSpeed;
      exportData.sgGlobalAudioReactivity = params.sgGlobalAudioReactivity; exportData.sgGlobalViscosity = params.sgGlobalViscosity;
      exportData.sgSettings = params.sgSettings; exportData.spiralResonanceModes = params.spiralResonanceModes;
    }
    if (presetCategories.vrAr) {
      exportData.vrMode = params.vrMode; exportData.vrDepth = params.vrDepth; exportData.vrRadius = params.vrRadius;
      exportData.vrThickness = params.vrThickness; exportData.vrDistance = params.vrDistance;
      exportData.arMode = params.arMode; exportData.arPortalMode = params.arPortalMode;
      exportData.arPortalScale = params.arPortalScale; exportData.arPortalPerspectiveIntensity = params.arPortalPerspectiveIntensity;
      exportData.arPortalVanishingRadius = params.arPortalVanishingRadius; exportData.arPortalFade = params.arPortalFade;
      exportData.arPortalBending = params.arPortalBending;
    }
    if (presetCategories.reactivity) {
      exportData.sensitivity = params.sensitivity; exportData.freqRange = params.freqRange;
    }
    return exportData;
  };

  const handleSaveCloudPreset = async () => {
    if (!presetName.trim()) return;
    if (isLocked) {
      onShowSubscription();
      return;
    }
    
    setIsSavingPreset(true);
    try {
      const exportData = getExportData();
      await savePreset(presetName, { ...params, ...exportData });
      setPresetName('');
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleDeleteCloudPreset = async (id: string) => {
    await deleteCloudPresetFromServer(id);
  };

  const applyPresetData = (json: Partial<VisualizerParams>) => {
    const importData: Partial<VisualizerParams> = {};
    
    if (presetCategories.baseGeometry) {
      if (json.k !== undefined) importData.k = json.k;
      if (json.iter !== undefined) importData.iter = json.iter;
      if (json.zoom !== undefined) importData.zoom = json.zoom;
      if (json.distanceZoom !== undefined) importData.distanceZoom = json.distanceZoom;
      if (json.psi !== undefined) importData.psi = json.psi;
      if (json.z0_r !== undefined) importData.z0_r = json.z0_r;
      if (json.z0_i !== undefined) importData.z0_i = json.z0_i;
      if (json.spiralThickness !== undefined) importData.spiralThickness = json.spiralThickness;
    }
    if (presetCategories.colors) {
      if (json.baseHue !== undefined) importData.baseHue = json.baseHue;
      if (json.hueSpeed !== undefined) importData.hueSpeed = json.hueSpeed;
      if (json.hueRange !== undefined) importData.hueRange = json.hueRange;
      if (json.saturation !== undefined) importData.saturation = json.saturation;
      if (json.brightness !== undefined) importData.brightness = json.brightness;
      if (json.trail !== undefined) importData.trail = json.trail;
    }
    if (presetCategories.sacredGeometry) {
      if (json.sacredGeometryEnabled !== undefined) importData.sacredGeometryEnabled = json.sacredGeometryEnabled;
      if (json.sgTheme !== undefined) importData.sgTheme = json.sgTheme;
      if (json.sgAutoHarmonic !== undefined) importData.sgAutoHarmonic = json.sgAutoHarmonic;
      if (json.sgAutoResonance !== undefined) importData.sgAutoResonance = json.sgAutoResonance;
      if (json.sgGlobalOpacity !== undefined) importData.sgGlobalOpacity = json.sgGlobalOpacity;
      if (json.sgGlobalFlowSpeed !== undefined) importData.sgGlobalFlowSpeed = json.sgGlobalFlowSpeed;
      if (json.sgGlobalAudioReactivity !== undefined) importData.sgGlobalAudioReactivity = json.sgGlobalAudioReactivity;
      if (json.sgGlobalViscosity !== undefined) importData.sgGlobalViscosity = json.sgGlobalViscosity;
      if (json.sgSettings !== undefined) {
        importData.sgSettings = { ...DEFAULT_PARAMS.sgSettings };
        for (const key in json.sgSettings) {
          const mode = key as SacredGeometryMode;
          if (importData.sgSettings[mode]) {
            importData.sgSettings[mode] = { ...importData.sgSettings[mode], ...json.sgSettings[mode] };
          }
        }
      }
      if (json.spiralResonanceModes !== undefined) importData.spiralResonanceModes = json.spiralResonanceModes;
    }
    if (presetCategories.vrAr) {
      if (json.vrMode !== undefined) importData.vrMode = json.vrMode;
      if (json.vrDepth !== undefined) importData.vrDepth = json.vrDepth;
      if (json.vrRadius !== undefined) importData.vrRadius = json.vrRadius;
      if (json.vrThickness !== undefined) importData.vrThickness = json.vrThickness;
      if (json.vrDistance !== undefined) importData.vrDistance = json.vrDistance;
      if (json.arMode !== undefined) importData.arMode = json.arMode;
      if (json.arPortalMode !== undefined) importData.arPortalMode = json.arPortalMode;
      if (json.arPortalScale !== undefined) importData.arPortalScale = json.arPortalScale;
      if (json.arPortalPerspectiveIntensity !== undefined) importData.arPortalPerspectiveIntensity = json.arPortalPerspectiveIntensity;
      if (json.arPortalVanishingRadius !== undefined) importData.arPortalVanishingRadius = json.arPortalVanishingRadius;
      if (json.arPortalFade !== undefined) importData.arPortalFade = json.arPortalFade;
      if (json.arPortalBending !== undefined) importData.arPortalBending = json.arPortalBending;
    }
    if (presetCategories.reactivity) {
      if (json.sensitivity !== undefined) importData.sensitivity = json.sensitivity;
      if (json.freqRange !== undefined) importData.freqRange = json.freqRange;
    }

    setParams(prev => ({ ...prev, ...importData }));
    setShowPresetModal(false);
  };

  const handleLoadCloudPreset = (preset: Preset) => {
    try {
      const json = JSON.parse(preset.params) as Partial<VisualizerParams>;
      applyPresetData(json);
    } catch (err) {
      console.error("Error loading cloud preset", err);
    }
  };

  const handleExportPreset = () => {
    const exportData = getExportData();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "audiomorphic_preset.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    setShowPresetModal(false);
  };

  const handleImportPreset = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as Partial<VisualizerParams>;
        applyPresetData(json);
      } catch (err) {
        alert("Error al cargar el preset. Archivo inválido.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const renderSaturationLeveler = () => (
    <div className={`bg-black/30 p-2 rounded-lg border border-white/5 space-y-1.5 mb-3 ${isLocked ? 'opacity-50 cursor-pointer' : ''}`} onClick={() => { if (isLocked) onShowSubscription(); }}>
      <div className="flex justify-between items-center">
        <label className="text-[10px] text-gray-300 font-semibold flex items-center gap-1">
          <Activity size={12} className="text-purple-400" /> Nivelador de Saturación {isLocked && <Lock size={10} className="text-yellow-500" />}
        </label>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-gray-400">Auto</span>
          <input 
            type="checkbox" 
            checked={params.autoOptionSaturationAuto}
            onChange={(e) => {
              if (isLocked) {
                onShowSubscription();
                return;
              }
              handleChange('autoOptionSaturationAuto', e.target.checked);
            }}
            className={`accent-purple-500 w-3 h-3 ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          />
        </div>
      </div>
      {!params.autoOptionSaturationAuto && (
        <div className="pt-1">
          {renderControl("Cantidad (%)", "autoOptionSaturation", 0, 100, 1)}
        </div>
      )}
    </div>
  );

  const renderControl = (
    label: string, 
    key: keyof VisualizerParams, 
    min: number, 
    max: number, 
    step: number,
    icon?: React.ReactNode,
    isAutoControlled: boolean = false,
    needsPremium: boolean = true 
  ) => {
    const isParamLocked = params.lockedParams?.includes(key);
    const isAutoActive = isAutoControlled && params.autoPilot && !isParamLocked;
    const isPremiumLocked = needsPremium && isLocked;

    const handleManualChange = (val: number) => {
      if (isPremiumLocked) {
        onShowSubscription();
        return;
      }
      if (isAutoControlled && params.autoPilot && !isParamLocked) {
        setParams(p => ({ ...p, [key]: val, lockedParams: [...(p.lockedParams || []), key] }));
      } else {
        handleChange(key, val);
      }
    };

    const toggleLock = () => {
      if (isPremiumLocked) {
        onShowSubscription();
        return;
      }
      setParams(p => {
        const newLocked = p.lockedParams?.includes(key) 
          ? p.lockedParams.filter(k => k !== key)
          : [...(p.lockedParams || []), key];
        return { ...p, lockedParams: newLocked };
      });
    };

    return (
      <div className={`mb-3 transition-all duration-500 ${isParamLocked ? 'bg-indigo-900/40 border border-indigo-500/50 p-2 rounded-lg' : ''} ${isAutoActive ? 'opacity-70' : 'opacity-100'} ${isPremiumLocked ? 'opacity-80' : 'opacity-100'}`}>
        <div className="flex justify-between items-center mb-1.5 gap-2">
          <label className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-300 flex items-center gap-1 sm:gap-2 font-semibold truncate flex-1 cursor-pointer">
            {icon && <span className="text-cyan-300 drop-shadow-[0_0_5px_rgba(0,242,254,0.8)] shrink-0">{icon}</span>}
            <span className="truncate flex items-center gap-2">
              {label}
              {isPremiumLocked && <Star size={12} className="text-yellow-500 shrink-0 fill-current" />}
            </span>
          </label>
          <div className="flex items-center gap-2">
            {isAutoControlled && params.autoPilot && (
              <button onClick={toggleLock} className="text-gray-400 hover:text-white transition-colors" title={isParamLocked ? "Desbloquear autoregeneración" : "Bloquear autoregeneración"}>
                {isParamLocked ? <Lock size = {14} className="text-indigo-400" /> : <Unlock size={14} className="opacity-30" />}
              </button>
            )}
            <input
              type="number"
              step="any"
              value={typeof params[key] === 'number' ? Number(params[key]).toFixed(3) : params[key] as unknown as number}
              onChange={(e) => handleManualChange(parseFloat(e.target.value))}
              className="font-mono text-xs text-cyan-200 bg-black/30 border border-white/10 rounded-lg px-2 py-1 focus:border-cyan-400 outline-none text-right w-16 sm:w-20 hover:border-white/30 transition-all shadow-inner shrink-0"
              readOnly={isPremiumLocked}
              onClick={isPremiumLocked ? onShowSubscription : undefined}
            />
          </div>
        </div>
        <div onClick={isPremiumLocked ? onShowSubscription : undefined} className={isPremiumLocked ? "cursor-pointer" : ""}>
          <LiquidSlider
            value={params[key] as number}
            onChange={handleManualChange}
            min={min}
            max={max}
            step={step}
            className={isParamLocked ? 'locked' : ''}
            disabled={isPremiumLocked}
          />
        </div>
      </div>
    );
  };

  const renderSgControl = (
    label: string,
    // Solo las claves NUMÉRICAS de los ajustes de geometría (`colored` es booleano
    // y tiene su propio interruptor): sin esto, `value` sería `number | boolean`.
    key: SgNumericKey,
    min: number,
    max: number,
    step: number,
    needsPremium: boolean = true
  ) => {
    const value: number = params.sgSettings[selectedSgEditMode][key];
    const isPremiumLocked = needsPremium && isLocked;
    return (
      <div className={`mb-3 transition-all duration-500 ${isPremiumLocked ? 'opacity-60' : 'opacity-100'}`}>
        <div className="flex justify-between items-center mb-1.5 gap-2">
          <label className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-300 flex items-center gap-1 sm:gap-2 font-semibold truncate flex-1">
            <span className="truncate flex items-center gap-1">
              {label}
              {isPremiumLocked && <Star size={12} className="text-yellow-500 cursor-pointer fill-current" onClick={onShowSubscription} />}
            </span>
          </label>
          <input
            type="number"
            step="any"
            value={Number(value).toFixed(3)}
            onChange={(e) => {
              if (isPremiumLocked) {
                onShowSubscription();
                return;
              }
              const val = parseFloat(e.target.value);
              if (isNaN(val)) return;
              setParams(prev => ({
                ...prev,
                sgSettings: {
                  ...prev.sgSettings,
                  [selectedSgEditMode]: {
                    ...prev.sgSettings[selectedSgEditMode],
                    [key]: val
                  }
                }
              }));
            }}
            className="font-mono text-xs text-emerald-200 bg-black/30 border border-white/10 rounded-lg px-2 py-1 focus:border-emerald-400 outline-none text-right w-16 sm:w-20 hover:border-white/30 transition-all shadow-inner shrink-0"
            readOnly={isPremiumLocked}
            onClick={isPremiumLocked ? onShowSubscription : undefined}
          />
        </div>
        <div onClick={isPremiumLocked ? onShowSubscription : undefined} className={isPremiumLocked ? "cursor-pointer" : ""}>
          <LiquidSlider
            value={value}
            onChange={(val) => {
              if (isPremiumLocked) {
                onShowSubscription();
                return;
              }
              setParams(prev => ({
                ...prev,
                sgSettings: {
                  ...prev.sgSettings,
                  [selectedSgEditMode]: {
                    ...prev.sgSettings[selectedSgEditMode],
                    [key]: val
                  }
                }
              }));
            }}
            min={min}
            max={max}
            step={step}
            className="liquid-slider-emerald"
            disabled={isPremiumLocked}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="neon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f2fe" />
            <stop offset="100%" stopColor="#4facfe" />
          </linearGradient>
          <linearGradient id="emerald-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0ba360" />
            <stop offset="100%" stopColor="#3cba92" />
          </linearGradient>
          <linearGradient id="pink-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff0844" />
            <stop offset="100%" stopColor="#ffb199" />
          </linearGradient>
          <linearGradient id="indigo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
      </svg>
      <style>{`
        .liquid-panel {
          background: rgba(20, 25, 30, calc(${params.menuTransparency} * 0.2));
          backdrop-filter: blur(calc(${params.menuTransparency} * 20px)) saturate(150%) contrast(110%);
          -webkit-backdrop-filter: blur(calc(${params.menuTransparency} * 20px)) saturate(150%) contrast(110%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 
            0 40px 100px rgba(0, 0, 0, 0.6),
            inset 0 2px 4px rgba(255, 255, 255, 0.2),
            inset 0 -10px 40px rgba(255, 255, 255, 0.05),
            inset 0 20px 60px rgba(255, 255, 255, 0.02);
          border-radius: 32px;
          overflow: hidden;
          position: relative;
        }
        @media (min-width: 768px) {
          .liquid-panel {
            border-radius: 48px;
          }
        }

        .liquid-panel::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.1) 100%);
          pointer-events: none;
          z-index: -1;
        }

        .liquid-bubble {
          background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%);
          backdrop-filter: blur(16px) saturate(150%);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-top: 1px solid rgba(255, 255, 255, 0.4);
          border-bottom: 1px solid rgba(0, 0, 0, 0.2);
          box-shadow: 
            0 8px 32px 0 rgba(0, 0, 0, 0.3),
            inset 0 2px 4px rgba(255, 255, 255, 0.3),
            inset 0 -2px 4px rgba(0, 0, 0, 0.2);
          border-radius: 9999px;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          position: relative;
          overflow: hidden;
        }

        .liquid-bubble::before {
          content: '';
          position: absolute;
          top: 5%; left: 10%; right: 10%; height: 40%;
          background: linear-gradient(to bottom, rgba(255,255,255,0.6), transparent);
          border-radius: 50%;
          pointer-events: none;
          filter: blur(2px);
        }

        .liquid-bubble:hover {
          transform: translateY(-2px);
          background: linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%);
          border-top: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 
            0 12px 40px 0 rgba(0, 0, 0, 0.4),
            inset 0 2px 4px rgba(255, 255, 255, 0.4),
            inset 0 -2px 4px rgba(0, 0, 0, 0.2);
        }

        .liquid-bubble:active {
          transform: translateY(1px);
          box-shadow: 
            0 4px 16px 0 rgba(0, 0, 0, 0.3),
            inset 0 2px 4px rgba(255, 255, 255, 0.1),
            inset 0 -2px 4px rgba(0, 0, 0, 0.3);
        }

        .icon-neon {
          filter: drop-shadow(0 0 8px rgba(0, 242, 254, 0.8)) drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
          stroke: url(#neon-gradient);
          stroke-width: 2.5;
        }
        .icon-neon-emerald {
          filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.8)) drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
          stroke: url(#emerald-gradient);
          stroke-width: 2.5;
        }
        .icon-neon-pink {
          filter: drop-shadow(0 0 8px rgba(255, 8, 68, 0.8)) drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
          stroke: url(#pink-gradient);
          stroke-width: 2.5;
        }
        .icon-neon-indigo {
          filter: drop-shadow(0 0 8px rgba(99, 102, 241, 0.8)) drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
          stroke: url(#indigo-gradient);
          stroke-width: 2.5;
        }

        .liquid-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 14px;
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.4);
          box-shadow: inset 0 2px 6px rgba(0,0,0,0.6), 0 1px 1px rgba(255,255,255,0.15);
          outline: none;
          position: relative;
        }

        .liquid-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 26px;
          height: 26px;
          border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,1), rgba(100,200,255,0.8));
          box-shadow: 
            0 4px 12px rgba(0,0,0,0.5), 
            inset 0 2px 5px rgba(255,255,255,1),
            inset 0 -2px 5px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          border: 1px solid rgba(255,255,255,0.6);
        }

        .liquid-slider::-webkit-slider-thumb:hover {
          transform: scale(1.25);
          border-radius: 50% 50% 40% 60% / 60% 40% 50% 50%;
          box-shadow: 
            0 8px 20px rgba(0,242,254,0.6), 
            inset 0 2px 5px rgba(255,255,255,1);
        }

        .liquid-slider-emerald::-webkit-slider-thumb {
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,1), rgba(16,185,129,0.8));
        }
        .liquid-slider-emerald::-webkit-slider-thumb:hover {
          box-shadow: 0 8px 20px rgba(16,185,129,0.6), inset 0 2px 5px rgba(255,255,255,1);
        }

        .neon-text {
          background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 20px rgba(0, 242, 254, 0.8);
        }

        .neon-text-pink {
          background: linear-gradient(135deg, #ff0844 0%, #ffb199 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 20px rgba(255, 8, 68, 0.8);
        }

        .neon-text-emerald {
          background: linear-gradient(135deg, #0ba360 0%, #3cba92 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 20px rgba(11, 163, 96, 0.8);
        }

        .liquid-switch {
          width: 56px;
          height: 30px;
          border-radius: 30px;
          background: rgba(0,0,0,0.5);
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.7), 0 1px 2px rgba(255,255,255,0.15);
          position: relative;
          cursor: pointer;
          border: 1px solid rgba(255,255,255,0.15);
          transition: all 0.4s ease;
          overflow: hidden;
        }

        .liquid-switch::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 100%);
          pointer-events: none;
        }

        .liquid-switch-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 24px;
          height: 24px;
          border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,1), rgba(200,200,200,0.6));
          box-shadow: 0 2px 6px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,1);
          transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .liquid-switch.active {
          background: rgba(0, 242, 254, 0.25);
          border-color: rgba(0, 242, 254, 0.5);
          box-shadow: inset 0 2px 8px rgba(0,242,254,0.3), 0 0 15px rgba(0,242,254,0.2);
        }

        .liquid-switch.active .liquid-switch-thumb {
          left: 28px;
          border-radius: 50% 50% 40% 60% / 60% 40% 50% 50%;
          background: radial-gradient(circle at 30% 30%, #fff, #00f2fe);
          box-shadow: 0 0 20px #00f2fe, inset 0 2px 3px rgba(255,255,255,1);
        }

        .liquid-switch.active-emerald {
          background: rgba(16, 185, 129, 0.25);
          border-color: rgba(16, 185, 129, 0.5);
          box-shadow: inset 0 2px 8px rgba(16,185,129,0.3), 0 0 15px rgba(16,185,129,0.2);
        }
        .liquid-switch.active-emerald .liquid-switch-thumb {
          left: 28px;
          border-radius: 50% 50% 40% 60% / 60% 40% 50% 50%;
          background: radial-gradient(circle at 30% 30%, #fff, #10b981);
          box-shadow: 0 0 20px #10b981, inset 0 2px 3px rgba(255,255,255,1);
        }

        .liquid-switch.active-purple {
          background: rgba(168, 85, 247, 0.25);
          border-color: rgba(168, 85, 247, 0.5);
          box-shadow: inset 0 2px 8px rgba(168,85,247,0.3), 0 0 15px rgba(168,85,247,0.2);
        }
        .liquid-switch.active-purple .liquid-switch-thumb {
          left: 28px;
          border-radius: 50% 50% 40% 60% / 60% 40% 50% 50%;
          background: radial-gradient(circle at 30% 30%, #fff, #a855f7);
          box-shadow: 0 0 20px #a855f7, inset 0 2px 3px rgba(255,255,255,1);
        }

        .liquid-switch.active-pink {
          background: rgba(236, 72, 153, 0.25);
          border-color: rgba(236, 72, 153, 0.5);
          box-shadow: inset 0 2px 8px rgba(236,72,153,0.3), 0 0 15px rgba(236,72,153,0.2);
        }
        .liquid-switch.active-pink .liquid-switch-thumb {
          left: 28px;
          border-radius: 50% 50% 40% 60% / 60% 40% 50% 50%;
          background: radial-gradient(circle at 30% 30%, #fff, #ec4899);
          box-shadow: 0 0 20px #ec4899, inset 0 2px 3px rgba(255,255,255,1);
        }

        .liquid-section {
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-top: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 24px;
          box-shadow: 
            inset 0 0 30px rgba(255, 255, 255, 0.05), 
            0 15px 35px rgba(0,0,0,0.2),
            inset 0 2px 4px rgba(255,255,255,0.1);
          position: relative;
          overflow: hidden;
          padding: 0.75rem;
          margin-bottom: 1rem;
        }
        @media (min-width: 768px) {
          .liquid-section {
            border-radius: 32px;
            padding: 1rem;
          }
        }

        .liquid-section::before {
          content: '';
          position: absolute;
          top: -50%; left: -50%; width: 200%; height: 200%;
          background: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.15), transparent 50%);
          pointer-events: none;
        }

        .neon-metal-text {
          background: linear-gradient(
            270deg,
            #ff007f,
            #7f00ff,
            #00ffff,
            #00ff7f,
            #ffff00,
            #ff007f
          );
          background-size: 400% 400%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: morphing-colors 8s ease infinite;
          text-shadow: 
            0px 2px 2px rgba(255,255,255,0.5),
            0px 4px 4px rgba(0,0,0,0.5),
            0 0 10px rgba(255,255,255,0.2),
            0 0 20px rgba(0, 255, 255, 0.5);
        }
        @keyframes morphing-colors {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .liquid-scroll::-webkit-scrollbar {
          width: 10px;
        }
        .liquid-scroll::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.3);
          border-radius: 10px;
          margin: 10px 0;
        }
        .liquid-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.25);
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.15);
        }
        .liquid-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.4);
        }
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>

      <div className="liquid-panel w-full h-full flex-1 flex flex-col relative z-10">
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/10 flex flex-col md:flex-row justify-between items-center bg-white/5 gap-3 md:gap-0 shrink-0">
          <div className="text-center md:text-left flex flex-col items-center md:items-start w-full md:w-auto">
            <h1 className="text-2xl md:text-3xl font-bold neon-metal-text flex items-center justify-center md:justify-start gap-2 tracking-wider">
              <Activity className="w-6 h-6 md:w-8 md:h-8 icon-neon" />
              Audiomorphic AR
            </h1>
            <p className="text-[10px] md:text-xs text-cyan-100/70 mt-1 font-medium tracking-wide">Recurrencia Compleja Sonora</p>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-2 md:gap-3 w-full md:w-auto">
            {/* Insignia honesta: aquí es COMPLETO y GRATIS. Ni corona, ni planes,
                ni menú de perfil (no hay cuentas en esta app dentro del OS). */}
            <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-400/40 bg-emerald-400/10 text-emerald-200 text-[10px] font-extrabold uppercase tracking-wider">
              <Sprout size={14} /> Completo · sin cuenta
            </span>
            <button
              onClick={() => setParams(DEFAULT_PARAMS)}
              className="liquid-bubble p-2 md:p-3 text-red-400 hover:text-red-300"
              title="Restaurar Valores por Defecto"
            >
              <RotateCcw size={20} className="icon-neon" />
            </button>
            <button
              onClick={() => setShowPresetModal(true)}
              className="liquid-bubble p-2 md:p-3 text-yellow-300 hover:text-yellow-200"
              title="Guardar/Cargar Ajustes"
            >
              <Save size={20} className="icon-neon" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex bg-black/40 rounded-full p-1 border border-white/10">
                <button
                  onClick={() => handleChange('audioSource', 'microphone')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all ${params.audioSource === 'microphone' ? 'bg-cyan-500/30 text-cyan-300' : 'text-gray-400'}`}
                >
                  Mic
                </button>
                <button
                  onClick={() => handleChange('audioSource', 'system')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all ${params.audioSource === 'system' ? 'bg-cyan-500/30 text-cyan-300' : 'text-gray-400'}`}
                >
                  Dispositivo
                </button>
              </div>
              
              {params.audioSource === 'microphone' && audioDevices.length > 0 && (
                <div className="max-w-[150px]">
                  <LiquidSelect
                    value={selectedAudioDeviceId}
                    onChange={(val) => onAudioDeviceChange?.(val)}
                    options={audioDevices.map(device => ({
                      value: device.deviceId,
                      label: device.label || `Entrada ${device.deviceId.slice(0, 5)}`
                    }))}
                  />
                </div>
              )}
            </div>
            <button
              onClick={toggleAudio}
              className={`liquid-bubble px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-bold flex items-center gap-2 ${
                audioActive ? 'text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'text-cyan-300'
              }`}
            >
              <span className="hidden sm:inline">{audioActive ? 'Detener Audio' : 'Iniciar Audio'}</span>
              <span className="sm:hidden">{audioActive ? 'Detener' : 'Iniciar'}</span>
            </button>
            {/* Pantalla completa e instalación: no aplican a una CAPA DE FONDO
                (el fondo YA ocupa toda la pantalla, y el OS ya es la app). */}
            {!isBackground && (
              <>
                <button
                  onClick={toggleFullScreen}
                  className="liquid-bubble px-3 py-2 md:py-3 text-sm md:text-base font-bold flex items-center gap-2 text-purple-300 cursor-pointer"
                  title="Pantalla Completa"
                >
                  {isFullscreen ? <Minimize className="w-5 h-5 icon-neon" /> : <Maximize className="w-5 h-5 icon-neon" />}
                  <span className="hidden sm:inline">Pantalla Completa</span>
                </button>
                <button
                  onClick={handleInstallClick}
                  className="liquid-bubble px-3 py-2 md:py-3 text-sm md:text-base font-bold flex items-center gap-2 text-emerald-300 cursor-pointer"
                  title="Instalar"
                >
                  <Download className="w-5 h-5 icon-neon" />
                  <span className="hidden sm:inline">Descargar App</span>
                </button>
              </>
            )}

            {onClose && (
              <button
                onClick={onClose}
                className="liquid-bubble px-3 py-2 md:py-3 text-sm md:text-base font-bold flex items-center gap-2 text-red-400 ml-auto"
                title="Cerrar Menú"
              >
                <X className="w-5 h-5 icon-neon" />
              </button>
            )}
          </div>
        </div>

        <div className="p-2 md:p-4 overflow-y-auto flex-1 min-h-0 liquid-scroll">
          <div className="columns-1 lg:columns-2 gap-2 md:gap-4">
            
            {/* Ajustes Automáticos Section */}
            <div className="liquid-section break-inside-avoid">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-lg font-bold neon-text flex items-center gap-2">
                  <Shuffle className="w-5 h-5 icon-neon" /> 
                  Ajustes Automáticos
                </h3>
               </div>
               
               <div className="space-y-4">
                 <div className="flex items-center gap-2 mb-4">
                   <div className="flex-1 bg-black/40 border border-white/10 rounded-xl p-1 flex items-center">
                     <BrainCircuit className="w-4 h-4 text-purple-400 ml-2 mr-1" />
                     <LiquidSelect
                        value={params.autoRandomMode}
                        onChange={(val) => {
                          if (isLocked && val !== 'none' && val !== 'random') {
                            onShowSubscription();
                            return;
                          }
                          handleAutoRandomModeChange(val as any);
                        }}
                        options={[
                          { value: 'none', label: 'Apagado' },
                          { value: 'random', label: 'Aleatorio Total' },
                          { value: 'smart', label: 'Modo Inteligente', locked: isLocked },
                          { value: 'dj', label: 'Modo DJ', locked: isLocked },
                          { value: 'sacred', label: 'Resonancias Sagradas', locked: isLocked },
                          { value: 'rhythmic', label: 'Ritmos Musicales', locked: isLocked },
                          { value: 'rainbow', label: 'Sinfonía Arcoíris', locked: isLocked },
                          { value: 'astral', label: 'Astromorphociberpsicodélico', locked: isLocked }
                        ]}
                      />
                   </div>
                   <button
                     onClick={() => {
                       if (params.autoRandomMode !== 'none') {
                         generateRandomParams(params.autoRandomMode as any, false);
                       }
                     }}
                     disabled={params.autoRandomMode === 'none'}
                     className={`p-3 rounded-xl border transition-all flex items-center justify-center ${
                       params.autoRandomMode !== 'none' 
                         ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 hover:bg-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.3)]' 
                         : 'bg-gray-800/50 border-gray-700 text-gray-500 cursor-not-allowed'
                     }`}
                     title="Regenerar Valores"
                   >
                     <RotateCw size={18} className={params.autoRandomMode !== 'none' ? 'animate-spin-slow' : ''} />
                   </button>
                 </div>

                 <div className="bg-black/30 p-3 rounded-xl border border-white/10">
                   <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                     <Activity size={14} className="text-purple-400" />
                     Ajustes de Auto-Regeneración
                   </h4>
                   
                   <div className="space-y-3">
                     {params.autoRandomMode !== 'none' ? (
                       <>
                         <div className="flex items-center justify-between">
                           <label className="text-[10px] text-gray-300 flex items-center gap-1">Detección de Emoción/Estilo {isLocked && <Star size={10} className="text-yellow-500 fill-current" />}</label>
                           <input
                             type="checkbox"
                             checked={autoRandomOnEmotionChange}
                             onChange={(e) => {
                               if (isLocked) {
                                 onShowSubscription();
                                 return;
                               }
                               setAutoRandomOnEmotionChange(e.target.checked);
                             }}
                             className={`w-3 h-3 accent-cyan-500 ${isLocked ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                             disabled={isLocked}
                           />
                         </div>
                         
                         <div className="flex items-center justify-between mt-2">
                           <label className="text-[10px] text-gray-300 flex items-center gap-1">Detección de Ritmos {isLocked && <Star size={10} className="text-yellow-500 fill-current" />}</label>
                           <input
                             type="checkbox"
                             checked={params.autoRandomOnBeat}
                             onChange={(e) => {
                               if (isLocked) {
                                 onShowSubscription();
                                 return;
                               }
                               handleChange('autoRandomOnBeat', e.target.checked);
                             }}
                             className={`w-3 h-3 accent-cyan-500 ${isLocked ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                             disabled={isLocked}
                           />
                         </div>

                         {(autoRandomOnEmotionChange || params.autoRandomOnBeat) && (
                           <div className="space-y-3 mt-2">
                             <div className="flex flex-col items-center">
                               <label className="text-[10px] text-gray-300 flex justify-between w-full mb-1">
                                 <span className="flex items-center gap-1">Sensibilidad a Emoción {isLocked && <Star size={10} className="text-yellow-500 fill-current" />}</span>
                                 <span className="text-cyan-400">{autoEmotionSensitivity}%</span>
                               </label>
                               <input
                                 type="range"
                                 min="0"
                                 max="100"
                                 step="1"
                                 value={autoEmotionSensitivity}
                                 onChange={(e) => {
                                   if (isLocked) {
                                     onShowSubscription();
                                     return;
                                   }
                                   setAutoEmotionSensitivity(Number(e.target.value));
                                 }}
                                 className={`w-full h-1 accent-cyan-500 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                               />
                             </div>

                             <div className="flex flex-col items-center">
                               <label className="text-[10px] text-gray-300 flex justify-between w-full mb-1">
                                 <span className="flex items-center gap-1">Sensibilidad a Ritmos {isLocked && <Star size={10} className="text-yellow-500 fill-current" />}</span>
                                 <span className="text-cyan-400">{autoBeatSensitivity}%</span>
                               </label>
                               <input
                                 type="range"
                                 min="0"
                                 max="100"
                                 step="1"
                                 value={autoBeatSensitivity}
                                 onChange={(e) => {
                                   if (isLocked) {
                                     onShowSubscription();
                                     return;
                                   }
                                   setAutoBeatSensitivity(Number(e.target.value));
                                 }}
                                 className={`w-full h-1 accent-cyan-500 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                               />
                             </div>

                             <div className="flex flex-col items-center">
                               <label className="text-[10px] text-gray-300 flex justify-between w-full mb-1">
                                 <span className="flex items-center gap-1">Fluidez de Estilo {isLocked && <Star size={10} className="text-yellow-500 fill-current" />}</span>
                                 <span className="text-cyan-400">{autoStyleFluidity}%</span>
                               </label>
                               <input
                                 type="range"
                                 min="0"
                                 max="100"
                                 step="1"
                                 value={autoStyleFluidity}
                                 onChange={(e) => {
                                   if (isLocked) {
                                     onShowSubscription();
                                     return;
                                   }
                                   setAutoStyleFluidity(Number(e.target.value));
                                 }}
                                 className={`w-full h-1 accent-cyan-500 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                               />
                             </div>
                             
                             <div className="flex flex-col items-center">
                               <label className="text-[10px] text-gray-300 flex justify-between w-full mb-1">
                                 <span className="flex items-center gap-1">Velocidad de Reactividad {isLocked && <Star size={10} className="text-yellow-500 fill-current" />}</span>
                                 <span className="text-cyan-400">{autoRandomReactivitySpeed}%</span>
                               </label>
                               <input
                                 type="range"
                                 min="0"
                                 max="100"
                                 step="1"
                                 value={autoRandomReactivitySpeed}
                                 onChange={(e) => {
                                   if (isLocked) {
                                     onShowSubscription();
                                     return;
                                   }
                                   setAutoRandomReactivitySpeed(Number(e.target.value));
                                 }}
                                 className={`w-full h-1 accent-cyan-500 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                               />
                             </div>

                             <div className="flex flex-col items-center mt-4">
                               <label className="text-[10px] text-gray-300 flex justify-between w-full mb-1">
                                 <span className="flex items-center gap-1">Suavidad de Transición {isLocked && <Star size={10} className="text-yellow-500 fill-current" />}</span>
                                 <span className="text-cyan-400">{autoTransitionSmoothness}%</span>
                               </label>
                               <input
                                 type="range"
                                 min="0"
                                 max="100"
                                 step="1"
                                 value={autoTransitionSmoothness}
                                 onChange={(e) => {
                                   if (isLocked) {
                                     onShowSubscription();
                                     return;
                                   }
                                   setAutoTransitionSmoothness(Number(e.target.value));
                                 }}
                                 className={`w-full h-1 accent-cyan-500 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                               />
                             </div>
                           </div>
                         )}

                         {(!autoRandomOnEmotionChange && !params.autoRandomOnBeat) && (
                           <div>
                             <label className="text-[10px] text-gray-300 flex justify-between mb-1">
                               <span className="flex items-center gap-1">Intervalo (Velocidad de Reactividad) {isLocked && <Star size={10} className="text-yellow-500 fill-current" />}</span>
                               <span className="text-cyan-400">{autoRandomInterval}s</span>
                             </label>
                             <input
                               type="range"
                               min="1"
                               max="60"
                               step="1"
                               value={autoRandomInterval}
                               onChange={(e) => {
                                 if (isLocked) {
                                   onShowSubscription();
                                   return;
                                 }
                                 setAutoRandomInterval(Number(e.target.value));
                               }}
                               className={`w-full h-1 accent-cyan-500 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                             />
                           </div>
                         )}

                         {/* Advanced Auto-Regeneration Settings */}
                         <div className="mt-4 pt-4 border-t border-purple-500/30">
                           <h4 className="text-xs font-bold text-purple-300 mb-3 flex items-center gap-2">
                             <BrainCircuit className="w-3 h-3" /> Autoregeneración Avanzada {isLocked && <Star size={12} className="text-yellow-500 fill-current" />}
                           </h4>
                           
                           <div className={`space-y-3 ${isLocked ? 'opacity-50 cursor-pointer' : ''}`} onClick={() => { if (isLocked) onShowSubscription(); }}>
                             <div className="flex items-center justify-between bg-black/30 p-2 rounded-lg border border-white/5">
                               <label className="text-[10px] text-gray-300">Desvanecimiento Fuera de Pantalla</label>
                               <button 
                                 onClick={() => handleChange('autoOffscreenFade', !params.autoOffscreenFade)}
                                 className={`w-8 h-4 rounded-full transition-colors relative ${params.autoOffscreenFade ? 'bg-purple-500' : 'bg-gray-700'}`}
                               >
                                 <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${params.autoOffscreenFade ? 'translate-x-4' : 'translate-x-0.5'}`} />
                               </button>
                             </div>

                             <div className="bg-black/30 p-2 rounded-lg border border-white/5 space-y-1.5">
                               <label className="text-[10px] text-gray-300 font-semibold">Relación de Parámetros</label>
                               <div className="flex gap-1">
                                 <button 
                                   onClick={() => handleChange('autoRelationshipMode', 'empathetic')}
                                   className={`flex-1 py-1 text-[10px] rounded transition-colors ${params.autoRelationshipMode === 'empathetic' ? 'bg-purple-500/40 text-purple-200 border border-purple-500/50' : 'bg-black/50 text-gray-400 border border-white/10'}`}
                                 >
                                   Empática
                                 </button>
                                 <button 
                                   onClick={() => handleChange('autoRelationshipMode', 'rhythmic')}
                                   className={`flex-1 py-1 text-[10px] rounded transition-colors ${params.autoRelationshipMode === 'rhythmic' ? 'bg-purple-500/40 text-purple-200 border border-purple-500/50' : 'bg-black/50 text-gray-400 border border-white/10'}`}
                                 >
                                   Rítmica
                                 </button>
                                 <button 
                                   onClick={() => handleChange('autoRelationshipMode', 'technical')}
                                   className={`flex-1 py-1 text-[10px] rounded transition-colors ${params.autoRelationshipMode === 'technical' ? 'bg-purple-500/40 text-purple-200 border border-purple-500/50' : 'bg-black/50 text-gray-400 border border-white/10'}`}
                                 >
                                   Técnica
                                 </button>
                               </div>
                             </div>

                             <div className="bg-black/30 p-2 rounded-lg border border-white/5 space-y-1.5">
                               <label className="text-[10px] text-gray-300 font-semibold">Retardo de Tiempo</label>
                               <LiquidSelect
                                  value={params.autoTimeDelayMode || 'smart'}
                                  onChange={(val) => handleChange('autoTimeDelayMode', val)}
                                  options={[
                                    { value: 'instant', label: 'Instantáneo' },
                                    { value: 'smart', label: 'Automático Inteligente' },
                                    { value: 'custom', label: 'Personalizable' }
                                  ]}
                                />
                               {params.autoTimeDelayMode === 'custom' && (
                                 <div className="pt-1">
                                   {renderControl("Segundos", "autoTimeDelay", 0, 10, 0.1)}
                                 </div>
                               )}
                             </div>

                             <div className="bg-black/30 p-2 rounded-lg border border-white/5 space-y-1.5">
                               <label className="text-[10px] text-gray-300 font-semibold">Regeneración de Parámetros</label>
                               <LiquidSelect
                                  value={params.autoParamRegenMode || 'custom'}
                                  onChange={(val) => handleChange('autoParamRegenMode', val)}
                                  options={[
                                    { value: 'instant', label: 'Instantáneo' },
                                    { value: 'smooth', label: 'Suave (Líquido)' },
                                    { value: 'custom', label: 'Retardo Personalizable' }
                                  ]}
                                />
                               {params.autoParamRegenMode === 'custom' && (
                                 <div className="pt-1 space-y-1">
                                   {renderControl("Retardo (s)", "autoParamRegenDelay", 0, 10, 0.1)}
                                   {renderControl("Búfer Resonancia (%)", "autoParamRegenBuffer", 0, 100, 1)}
                                 </div>
                               )}
                             </div>

                             {renderSaturationLeveler()}

                             <div className="bg-black/30 p-2 rounded-lg border border-white/5 space-y-1.5">
                               <label className="text-[10px] text-gray-300 font-semibold">Nivelador de Relación de Parámetros</label>
                               <div className="pt-1">
                                 {renderControl("Nivelador (%)", "autoParamRatioLeveler", 0, 100, 1)}
                               </div>
                             </div>
                           </div>
                         </div>
                       </>
                     ) : (
                       <div className="text-center py-4 text-gray-500 text-xs">
                         Selecciona un modo para ver los ajustes.
                       </div>
                     )}
                   </div>
                 </div>
               </div>
            </div>

            {/* Auto Pilot Section */}
            <div className="liquid-section break-inside-avoid">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-lg font-bold neon-text flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 icon-neon-indigo" /> 
                  Espiral Automático
                </h3>
                <div 
                   onClick={() => {
                     handleChange('autoPilot', !params.autoPilot);
                   }}
                   className={`liquid-switch shrink-0 ${params.autoPilot ? 'active' : ''}`}
                 >
                   <div className="liquid-switch-thumb"></div>
                 </div>
               </div>
               
               {params.autoPilot && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                      
                      {/* Mode Selector */}
                      <div className="flex flex-col sm:flex-row bg-black/40 p-1.5 rounded-2xl mb-4 border border-white/10 shadow-inner gap-1 sm:gap-0">
                        {/* DRIFT - LOCKED for free users */}
                        <button
                          onClick={() => {
                            if (!isPremium) {
                              onShowSubscription();
                              return;
                            }
                            handleChange('autoPilotMode', 'drift');
                          }}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs uppercase font-bold rounded-xl transition-all ${
                            params.autoPilotMode === 'drift' 
                              ? 'liquid-bubble text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)]' 
                              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                          } ${!isPremium ? 'opacity-70 bg-amber-900/10' : ''}`}
                        >
                          <Shuffle size={14} className="icon-neon" /> Deriva {!isPremium && <Lock size={12} className="text-amber-400 ml-1" />}
                        </button>
                        {/* HARMONIC - UNLOCKED for ALL users */}
                        <button
                          onClick={() => {
                            handleChange('autoPilotMode', 'harmonic');
                          }}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs uppercase font-bold rounded-xl transition-all ${
                            params.autoPilotMode === 'harmonic' 
                              ? 'liquid-bubble text-cyan-300' 
                              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                          }`}
                        >
                          <Waves size={14} className="icon-neon" /> Armónico
                        </button>
                        {/* GENESIS - UNLOCKED for ALL users */}
                        <button
                          onClick={() => {
                            const ALL_SG = SACRED_GEOMETRY_OPTIONS.map(o => o.id as any);
                            const random3SG = [...ALL_SG].sort(() => 0.5 - Math.random()).slice(0, 3);
                            const random3SR = [...ALL_SG].sort(() => 0.5 - Math.random()).slice(0, 3);
                            setParams(p => ({
                              ...p,
                              autoPilotMode: 'genesis',
                              sacredGeometryModes: random3SG,
                              spiralResonanceModes: random3SR,
                              sacredGeometryEnabled: true,
                              sgDrawMode: 'both',
                              sgShowNodes: true,
                              sgAutoHarmonic: true,
                              sgTheme: Math.random() > 0.5 ? 'light' : 'dark',
                              sgAutoResonance: true
                            }));
                          }}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs uppercase font-bold rounded-xl transition-all ${
                            params.autoPilotMode === 'genesis' 
                              ? 'liquid-bubble text-emerald-300 shadow-[0_0_20px_rgba(10,185,129,0.3)]' 
                              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                          }`}
                        >
                          <Sprout size={14} className="icon-neon-emerald" /> Génesis
                        </button>
                      </div>

                      {/* Genesis/Math Display Info */}
                      {(params.autoPilotMode === 'genesis' || params.autoPilotMode === 'harmonic') && params.geometryData && (
                         <div className="mb-4 text-center p-3 bg-black/30 rounded-2xl border border-white/10 shadow-inner space-y-2">
                            <div className="border-b border-white/10 pb-2">
                              <span className="text-xs text-gray-400 uppercase tracking-widest block mb-1">Geometría Activa</span>
                              <span className="text-lg font-serif text-white font-bold block drop-shadow-md">{params.geometryData.name}</span>
                              <span className={`text-xs uppercase font-bold tracking-wider px-3 py-1 rounded-full inline-block mt-2 shadow-sm ${
                                  params.geometryData.regime === 'primary' 
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                    : params.geometryData.regime === 'reciprocal'
                                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              }`}>
                                  Régimen {params.geometryData.regime === 'primary' ? 'Primario' : params.geometryData.regime === 'reciprocal' ? 'Recíproco' : 'Vacío'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                <div className="bg-black/40 p-2 rounded-xl border border-white/5">
                                    <div className="text-gray-400 mb-1">α (Estructura)</div>
                                    <div className="text-cyan-300 font-bold text-sm drop-shadow-[0_0_5px_rgba(0,242,254,0.5)]">{params.geometryData.alpha.toFixed(1)}</div>
                                </div>
                                <div className="bg-black/40 p-2 rounded-xl border border-white/5">
                                    <div className="text-gray-400 mb-1">β (Potencial)</div>
                                    <div className="text-pink-300 font-bold text-sm drop-shadow-[0_0_5px_rgba(255,8,68,0.5)]">{params.geometryData.beta.toFixed(2)}</div>
                                </div>
                            </div>
                         </div>
                      )}

                      {renderControl("Viscosidad", "autoViscosity", 0.01, 0.999, 0.001, <Droplets className="w-4 h-4 icon-neon"/>, false, isAutoPilotLocked)}
                      {renderControl("Velocidad", "autoSpeed", 0.01, 1.0, 0.01, <Wind className="w-4 h-4 icon-neon"/>, false, isAutoPilotLocked)}
                      {renderControl("Sensibilidad Emocional", "autoEmotionSensitivity", 0.0, 1.0, 0.01, <Heart className="w-4 h-4 icon-neon"/>, false, isAutoPilotLocked)}
                      {renderControl("Fluidez de Estilo", "autoStyleFluidity", 0.0, 1.0, 0.01, <Palette className="w-4 h-4 icon-neon"/>, false, isAutoPilotLocked)}
                  </div>
               )}
            </div>

            {/* Perturbación de Espiral Section */}
            <div className="liquid-section break-inside-avoid border-emerald-500/30 shadow-[inset_0_0_30px_rgba(16,185,129,0.05)]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold neon-text-emerald flex items-center gap-2">
                  <Waves className="w-5 h-5 icon-neon-emerald" /> Perturbación de Espiral {!isPremium && <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/20">MODO LECTURA</span>}
                </h3>
                <div className="flex items-center gap-3">
                  <button onClick={() => {
                      randomizeSection('spiralResonance');
                    }} 
                    className={`text-emerald-400 hover:text-emerald-300 transition-colors ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`} 
                    title="Armonía Aleatoria"
                  >
                    <Shuffle size={18} className="icon-neon-emerald" />
                  </button>
                </div>
              </div>
              {params.sgAutoResonance && renderSaturationLeveler()}
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/40 p-1.5 rounded-2xl border border-emerald-500/20 shadow-inner transition-all duration-500`}>
                {SACRED_GEOMETRY_OPTIONS.map(mode => {
                  const isActive = params.spiralResonanceModes?.includes(mode.id as any);
                  const isLocked = params.lockedParams?.includes(`spiralMode_${mode.id}`);
                  return (
                    <div key={mode.id} className="relative flex group">
                      <button
                        onClick={() => {
                          const currentModes = params.spiralResonanceModes || [];
                          let newModes;
                          if (isActive) {
                            newModes = currentModes.filter(m => m !== mode.id);
                          } else {
                            newModes = [...currentModes, mode.id];
                          }
                          handleChange('spiralResonanceModes', newModes);
                        }}
                        className={`flex-1 py-2.5 px-2 text-[10px] sm:text-xs uppercase font-bold rounded-xl transition-all ${
                          isActive 
                            ? 'liquid-bubble text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                        }`}
                      >
                        {mode.label}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setParams(p => {
                            const lockKey = `spiralMode_${mode.id}`;
                            const newLocked = p.lockedParams?.includes(lockKey)
                              ? p.lockedParams.filter(k => k !== lockKey)
                              : [...(p.lockedParams || []), lockKey];
                            return { ...p, lockedParams: newLocked };
                          });
                        }}
                        className={`absolute top-1 right-1 p-1 rounded-full transition-all ${
                          isLocked ? 'bg-amber-500/20 text-amber-400' : 'opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 hover:bg-white/10'
                        }`}
                        title={isLocked ? "Desbloquear" : "Bloquear"}
                      >
                        {isLocked ? <Lock size={10} /> : <Unlock size={10} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sacred Geometry Section */}
            <div className={`liquid-section break-inside-avoid border-emerald-500/30 shadow-[inset_0_0_30px_rgba(16,185,129,0.05)] transition-all duration-500`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold neon-text-emerald flex items-center gap-2">
                  <Sprout className="w-5 h-5 icon-neon-emerald" /> Geometría Sagrada
                  {!isPremium && <Lock size={14} className="text-amber-400 cursor-pointer" onClick={onShowSubscription} />}
                </h3>
                <div className="flex items-center gap-3">
                  <button onClick={() => randomizeSection('sacredGeometry')} className={`text-emerald-400 hover:text-emerald-300 transition-colors`} title="Armonía Aleatoria">
                    <Shuffle size={18} className="icon-neon-emerald" />
                  </button>
                  <div 
                     onClick={() => {
                       if (isLocked) {
                         onShowSubscription();
                         return;
                       }
                       const isEnabling = !params.sacredGeometryEnabled;
                       handleChange('sacredGeometryEnabled', isEnabling);
                     }}
                     className={`liquid-switch shrink-0 ${params.sacredGeometryEnabled ? 'active' : ''} ${isLocked ? 'opacity-60' : ''}`}
                   >
                     <div className="liquid-switch-thumb"></div>
                   </div>
                </div>
              </div>

              {params.sacredGeometryEnabled && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                  {params.sgAutoHarmonic && renderSaturationLeveler()}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-xs uppercase tracking-wider text-gray-300 flex items-center gap-2 font-semibold">
                        Tipos de Geometría
                      </label>
                    </div>
                    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/40 p-1.5 rounded-2xl border border-emerald-500/20 shadow-inner transition-all duration-500`}>
                      {SACRED_GEOMETRY_OPTIONS.map(mode => {
                        const isActive = params.sacredGeometryModes?.includes(mode.id as any);
                        const isLocked = params.lockedParams?.includes(`sacredMode_${mode.id}`);
                        return (
                          <div key={mode.id} className="relative flex group">
                            <button
                              onClick={() => {
                                const currentModes = params.sacredGeometryModes || [];
                                let newModes;
                                if (isActive) {
                                  newModes = currentModes.filter(m => m !== mode.id);
                                } else {
                                  newModes = [...currentModes, mode.id];
                                }
                                handleChange('sacredGeometryModes', newModes);
                              }}
                              className={`flex-1 py-2.5 px-2 text-[10px] sm:text-xs uppercase font-bold rounded-xl transition-all ${
                                isActive 
                                  ? 'liquid-bubble text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
                                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                              }`}
                            >
                              {mode.label} {isGenesisLocked && <Star size={10} className="text-yellow-500 fill-current inline-block ml-1" />}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setParams(p => {
                                  const lockKey = `sacredMode_${mode.id}`;
                                  const newLocked = p.lockedParams?.includes(lockKey)
                                    ? p.lockedParams.filter(k => k !== lockKey)
                                    : [...(p.lockedParams || []), lockKey];
                                  return { ...p, lockedParams: newLocked };
                                });
                              }}
                              className={`absolute top-1 right-1 p-1 rounded-full transition-all ${
                                isLocked ? 'bg-amber-500/20 text-amber-400' : 'opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 hover:bg-white/10'
                              }`}
                              title={isLocked ? "Desbloquear" : "Bloquear"}
                            >
                              {isLocked ? <Lock size={10} /> : <Unlock size={10} />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                <div className="mb-6">
                  <label className="text-xs uppercase tracking-wider text-gray-300 flex items-center gap-2 mb-3 font-semibold">
                    Modo de Dibujo {isGenesisLocked && <Star size={12} className="text-yellow-500 fill-current" />}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-black/40 p-1.5 rounded-2xl border border-emerald-500/20 shadow-inner">
                    <button
                      onClick={() => {
                        if (isGenesisLocked) { onShowSubscription(); return; }
                        handleChange('sgDrawMode', 'layers');
                      }}
                      className={`py-2.5 px-2 text-xs uppercase font-bold rounded-xl transition-all ${
                        params.sgDrawMode === 'layers' 
                          ? 'liquid-bubble text-emerald-300' 
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                      } ${isGenesisLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Capas Infinitas
                    </button>
                    <button
                      onClick={() => {
                        if (isGenesisLocked) { onShowSubscription(); return; }
                        handleChange('sgDrawMode', 'both');
                      }}
                      className={`py-2.5 px-2 text-xs uppercase font-bold rounded-xl transition-all ${
                        params.sgDrawMode === 'both' 
                          ? 'liquid-bubble text-emerald-300' 
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                      } ${isGenesisLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Ambos
                    </button>
                    <button
                      onClick={() => {
                        if (isGenesisLocked) { onShowSubscription(); return; }
                        handleChange('sgDrawMode', 'nodes');
                      }}
                      className={`py-2.5 px-2 text-xs uppercase font-bold rounded-xl transition-all ${
                        params.sgDrawMode === 'nodes' 
                          ? 'liquid-bubble text-emerald-300' 
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                      } ${isGenesisLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Nodos en Espiral
                    </button>
                  </div>
                </div>

                {(params.sgDrawMode === 'nodes' || params.sgDrawMode === 'both') && (
                  <div className="mb-6 flex justify-between items-center bg-black/20 p-3 rounded-2xl border border-white/5 gap-2">
                     <label className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-300 font-semibold truncate flex-1 flex items-center gap-2">
                        Mostrar Nodos Emanantes {isGenesisLocked && <Star size={12} className="text-yellow-500 fill-current" />}
                     </label>
                     <div 
                       onClick={() => {
                         if (isGenesisLocked) { onShowSubscription(); return; }
                         handleChange('sgShowNodes', !params.sgShowNodes);
                       }}
                       className={`liquid-switch shrink-0 ${params.sgShowNodes ? 'active-emerald' : ''} ${isGenesisLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                     >
                       <div className="liquid-switch-thumb"></div>
                     </div>
                  </div>
                )}

                <div className="mb-4 flex justify-between items-center bg-emerald-900/20 p-3 rounded-2xl border border-emerald-500/30 gap-2">
                   <label className="text-[10px] sm:text-xs uppercase tracking-wider text-emerald-300 font-bold drop-shadow-[0_0_5px_rgba(16,185,129,0.5)] truncate flex-1 flex items-center gap-2">
                      Armonía Automática Total {isGenesisLocked && <Star size={12} className="text-yellow-500 fill-current" />}
                   </label>
                   <div 
                     onClick={() => {
                       if (isGenesisLocked) { onShowSubscription(); return; }
                       handleChange('sgAutoHarmonic', !params.sgAutoHarmonic);
                     }}
                     className={`liquid-switch shrink-0 ${params.sgAutoHarmonic ? 'active-emerald' : ''} ${isGenesisLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                   >
                     <div className="liquid-switch-thumb"></div>
                   </div>
                </div>

                <div className="mb-6">
                  <label className="text-xs uppercase tracking-wider text-gray-300 flex items-center gap-2 mb-3 font-semibold">
                    Tema de Geometría {isGenesisLocked && <Star size={12} className="text-yellow-500 fill-current" />}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/40 p-1.5 rounded-2xl border border-emerald-500/20 shadow-inner">
                    <button
                      onClick={() => {
                        if (isGenesisLocked) { onShowSubscription(); return; }
                        handleChange('sgTheme', 'light');
                      }}
                      className={`py-2.5 px-2 text-xs uppercase font-bold rounded-xl transition-all ${
                        params.sgTheme === 'light' 
                          ? 'liquid-bubble text-emerald-300' 
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                      } ${isGenesisLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Tonos Claros
                    </button>
                    <button
                      onClick={() => {
                        if (isGenesisLocked) { onShowSubscription(); return; }
                        handleChange('sgTheme', 'dark');
                      }}
                      className={`py-2.5 px-2 text-xs uppercase font-bold rounded-xl transition-all ${
                        params.sgTheme === 'dark' 
                          ? 'liquid-bubble text-emerald-300' 
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                      } ${isGenesisLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Tonos Oscuros
                    </button>
                  </div>
                </div>

                <div className="mb-4 flex justify-between items-center bg-emerald-900/20 p-3 rounded-2xl border border-emerald-500/30 gap-2">
                   <label className="text-[10px] sm:text-xs uppercase tracking-wider text-emerald-300 font-bold drop-shadow-[0_0_5px_rgba(16,185,129,0.5)] truncate flex-1 flex items-center gap-2">
                      Resonancia Automática {isGenesisLocked && <Star size={12} className="text-yellow-500 fill-current" />}
                   </label>
                   <div 
                     onClick={() => {
                       if (isGenesisLocked) { onShowSubscription(); return; }
                       handleChange('sgAutoResonance', !params.sgAutoResonance);
                     }}
                     className={`liquid-switch shrink-0 ${params.sgAutoResonance ? 'active-emerald' : ''} ${isGenesisLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                   >
                     <div className="liquid-switch-thumb"></div>
                   </div>
                </div>

                <div className="mb-6 mt-6">
                  <label className="text-xs uppercase tracking-wider text-emerald-400 flex items-center gap-2 mb-3 font-semibold">
                    Ajustes Globales (Todas las Geometrías)
                  </label>
                  {renderControl("Transparencia Global", "sgGlobalOpacity", 0.0, 3.0, 0.01, undefined, false, true)}
                  {renderControl("Velocidad de Flujo Global", "sgGlobalFlowSpeed", -3.0, 3.0, 0.01, undefined, false, true)}
                  {renderControl("Reactividad de Audio Global", "sgGlobalAudioReactivity", 0.0, 5.0, 0.01, undefined, false, true)}
                  {renderControl("Viscosidad Global", "sgGlobalViscosity", 0.0, 3.0, 0.01, undefined, false, true)}
                </div>

                {!params.sgAutoResonance ? (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="mb-5 mt-6">
                      <label className="text-xs uppercase tracking-wider text-emerald-400 flex items-center gap-2 mb-3 font-semibold">
                        Ajustes Independientes
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/40 p-1.5 rounded-2xl border border-emerald-500/20 mb-4 shadow-inner">
                        {SACRED_GEOMETRY_OPTIONS.map(mode => (
                          <button
                            key={`edit-${mode.id}`}
                            onClick={() => setSelectedSgEditMode(mode.id as SacredGeometryMode)}
                            className={`py-2.5 px-2 text-xs uppercase font-bold rounded-xl transition-all ${
                              selectedSgEditMode === mode.id 
                                ? 'liquid-bubble text-emerald-300' 
                                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {renderSgControl("Complejidad (Nodos)", "complexity", 1, 100, 1)}
                    {renderSgControl("Distancia Conexión", "connectionSpan", 1, 100, 1)}
                    {renderSgControl("Escala (Tamaño)", "scale", 0.01, 5.0, 0.01)}
                    {renderSgControl("Opacidad Líneas", "lineOpacity", 0.0, 1.0, 0.01)}
                    {renderSgControl("Opacidad Fondo", "bgOpacity", 0.0, 1.0, 0.01)}
                    {renderSgControl("Grosor de Línea", "thickness", 0.01, 5.0, 0.01)}
                    {renderSgControl("Velocidad Flujo", "flowSpeed", -5.0, 5.0, 0.01)}
                    {renderSgControl("Reactividad Audio", "audioReactivity", 0.0, 10.0, 0.1)}
                    {renderSgControl("Viscosidad", "viscosity", 0.01, 1.0, 0.01)}
                    
                    <div className="mb-3 flex justify-between items-center bg-black/20 p-3 rounded-2xl border border-white/5 gap-2">
                       <label className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-300 font-semibold truncate flex-1">
                          Con Color
                       </label>
                       <div 
                         onClick={() => {
                           setParams(prev => ({
                             ...prev,
                             sgSettings: {
                               ...prev.sgSettings,
                               [selectedSgEditMode]: {
                                 ...prev.sgSettings[selectedSgEditMode],
                                 colored: !prev.sgSettings[selectedSgEditMode].colored
                               }
                             }
                           }));
                         }}
                         className={`liquid-switch shrink-0 ${params.sgSettings[selectedSgEditMode].colored ? 'active-emerald' : ''}`}
                       >
                         <div className="liquid-switch-thumb"></div>
                       </div>
                    </div>
                    
                    {params.sgSettings[selectedSgEditMode].colored && (
                      <div className="mb-3 transition-all duration-500 opacity-100">
                        <div className="flex justify-between items-center mb-1.5 gap-2">
                          <label className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-300 flex items-center gap-1 sm:gap-2 font-semibold truncate flex-1">
                            <span className="truncate">Tono Personalizado</span>
                          </label>
                          <input
                            type="number"
                            step="1"
                            value={params.sgSettings[selectedSgEditMode].customColor}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (isNaN(val)) return;
                              setParams(prev => ({
                                ...prev,
                                sgSettings: {
                                  ...prev.sgSettings,
                                  [selectedSgEditMode]: {
                                    ...prev.sgSettings[selectedSgEditMode],
                                    customColor: val
                                  }
                                }
                              }));
                            }}
                            className="bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-xs text-white w-16 text-right focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          step="1"
                          value={params.sgSettings[selectedSgEditMode].customColor}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setParams(prev => ({
                              ...prev,
                              sgSettings: {
                                ...prev.sgSettings,
                                [selectedSgEditMode]: {
                                  ...prev.sgSettings[selectedSgEditMode],
                                  customColor: val
                                }
                              }
                            }));
                          }}
                          className="w-full liquid-slider"
                          style={{
                            background: `linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)`
                          }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-6 p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-2xl text-center shadow-inner">
                    <p className="text-sm text-emerald-300 italic font-medium">
                      La Resonancia Automática está controlando inteligentemente todos los parámetros geométricos en armonía con el sonido.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* VR / AR — NO PORTABLE a React 18. Se dice, no se finge. */}
            <div className="liquid-section break-inside-avoid border-purple-500/30 shadow-[inset_0_0_30px_rgba(168,85,247,0.05)]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold neon-text text-purple-400 flex items-center gap-2" style={{backgroundImage: 'linear-gradient(135deg, #c084fc 0%, #a855f7 100%)'}}>
                  <Glasses className="w-5 h-5 icon-neon-pink" /> Realidad Virtual / AR
                </h3>
              </div>

              <div className="p-4 rounded-2xl bg-purple-900/15 border border-purple-500/25 space-y-3">
                <p className="text-xs leading-relaxed text-purple-100/80">
                  <b className="text-purple-200">El VR/AR no corre dentro del OS, y no vamos a fingir que sí.</b>{' '}
                  Su motor (<code className="text-[10px]">@react-three/fiber v9</code> +{' '}
                  <code className="text-[10px]">@react-three/xr v6</code> + <code className="text-[10px]">postprocessing v3</code>)
                  exige <b>React 19</b>; el StarSeed OS va con <b>React 18</b> y R3F v8. Montarlo aquí
                  significaría subir de versión medio sistema.
                </p>
                <p className="text-xs leading-relaxed text-purple-100/60">
                  <b>Todo lo demás de esta lista SÍ es nativo y está aquí</b>: piloto automático,
                  aleatorización, las 20 geometrías sagradas, perturbación de la espiral, color,
                  fondo, reactividad y presets. Los parámetros VR/AR se conservan en los presets
                  (no se pierden), simplemente no tienen motor que los pinte en el OS.
                </p>
                <a
                  href="https://audiomorphic.vercel.app"
                  target="_blank"
                  rel="noreferrer"
                  className="liquid-bubble inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-purple-200 hover:text-white"
                >
                  <ExternalLink size={14} /> Abrir el VR/AR en la app original
                </a>
              </div>
            </div>

            {/* Interface & Reactivity */}
            <div className="break-inside-avoid">
              <div className="liquid-section">
                <h3 className="text-lg font-bold neon-text text-yellow-400 mb-6 flex items-center gap-2" style={{backgroundImage: 'linear-gradient(135deg, #fde047 0%, #eab308 100%)'}}>
                  <Zap className="w-5 h-5 icon-neon" /> Interfaz
                </h3>
                <div 
                   className="flex justify-between items-center bg-black/20 p-3 rounded-2xl border border-white/5 gap-2 mb-4 cursor-pointer group"
                   onClick={() => {
                     if (isLocked) {
                       onShowSubscription();
                     } else {
                       handleChange('showIndicators', !params.showIndicators);
                     }
                   }}
                 >
                    <label className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-300 font-semibold truncate flex-1 cursor-pointer flex items-center gap-2">
                      Mostrar Indicadores
                      {isLocked && <Lock size={12} className="text-yellow-500 group-hover:scale-110 transition-all font-bold" />}
                    </label>
                    <div className={`liquid-switch shrink-0 ${params.showIndicators ? 'active' : ''} ${isLocked ? 'opacity-50' : ''}`}>
                      <div className="liquid-switch-thumb"></div>
                    </div>
                 </div>
                {renderControl("Transparencia Menú", "menuTransparency", 0.0, 1.0, 0.05)}
                {renderControl("Cierre Automático (s)", "menuAutoCloseTime", 1, 60, 1)}
              </div>

              <div className="liquid-section">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold neon-text text-yellow-400 flex items-center gap-2" style={{backgroundImage: 'linear-gradient(135deg, #fde047 0%, #eab308 100%)'}}>
                    <Zap className="w-5 h-5 icon-neon" /> Reactividad
                  </h3>
                  <button onClick={() => randomizeSection('reactivity')} className={`text-yellow-400 hover:text-yellow-300 transition-colors ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`} title="Armonía Aleatoria">
                    <Shuffle size={18} className="icon-neon" />
                  </button>
                </div>
                {renderControl("Sensibilidad", "sensitivity", 0.1, 5.0, 0.1, undefined, false, true)}
                {renderControl("Espectro Freq", "freqRange", 0.1, 1.0, 0.05, undefined, false, true)}
                {renderControl("Persistencia", "trail", 0.01, 1.0, 0.01, undefined, false, true)}
              </div>
            </div>

            {/* Colors */}
            <div className="liquid-section break-inside-avoid border-pink-500/30 shadow-[inset_0_0_30px_rgba(236,72,153,0.05)]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold neon-text-pink flex items-center gap-2">
                  <Palette className="w-5 h-5 icon-neon-pink" /> Cromatismo
                  {isLocked && <Lock size={16} className="text-amber-400" />}
                </h3>
                <button onClick={() => randomizeSection('color')} className={`text-pink-400 hover:text-pink-300 transition-colors ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`} title="Armonía Aleatoria">
                  <Shuffle size={18} className="icon-neon-pink" />
                </button>
              </div>
              
              <div className={`mb-4 flex justify-between items-center bg-pink-900/20 p-3 rounded-2xl border border-pink-500/30 gap-2 ${isLocked ? 'opacity-50 cursor-pointer' : ''}`} onClick={() => { if (isLocked) onShowSubscription(); }}>
                 <label className="text-[10px] sm:text-xs uppercase tracking-wider text-pink-300 font-bold flex items-center gap-2 drop-shadow-[0_0_5px_rgba(236,72,153,0.5)] truncate flex-1">
                    <Music className="w-4 h-4 shrink-0 icon-neon-pink" /> <span className="truncate">Color Armónico</span> {isLocked && <Star size={12} className="text-yellow-500 fill-current" />}
                 </label>
                 <div onClick={() => {
                   if (isLocked) {
                     onShowSubscription();
                     return;
                   }
                   handleChange('harmonicColor', !params.harmonicColor);
                 }} className={`liquid-switch shrink-0 ${params.harmonicColor ? 'active-pink' : ''} ${isLocked ? 'opacity-60' : ''}`}>
                   <div className="liquid-switch-thumb"></div>
                 </div>
              </div>

              {params.harmonicColor ? (
                <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                  {renderControl("Sensibilidad Color", "harmonicSensitivity", 0.1, 5.0, 0.1)}
                  {renderControl("Profundidad Color", "harmonicDepth", 0, 360, 10)}
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                  {renderControl("Tono Base", "baseHue", 0, 360, 1, undefined, params.autoPilot)}
                  {renderControl("Velocidad Ciclo", "hueSpeed", 0, 5, 0.1)}
                </div>
              )}
              
              <div className="mt-6">
                {renderControl("Rango Gradiente", "hueRange", 0, 360, 1, undefined, false, true)}
                {renderControl("Saturación", "saturation", 0, 100, 1, undefined, false, true)}
                {renderControl("Brillo Base", "brightness", 0, 100, 1, undefined, false, true)}
              </div>
            </div>

            {/* Fondo propio del visualizador.
                Como CAPA DE FONDO del OS **no se pinta** (si lo hiciera, taparía el
                fondo del OS — el fantasma de la Adenda 68·D). Se dice, no se esconde. */}
            {isBackground && (
              <div className="liquid-section break-inside-avoid border-cyan-500/30">
                <h3 className="text-lg font-bold neon-text flex items-center gap-2 mb-3">
                  <Palette className="w-5 h-5 icon-neon" /> Fondo
                </h3>
                <p className="text-xs leading-relaxed text-cyan-100/70">
                  Aquí el fondo lo pone <b>el OS</b> (las capas de abajo: color, degradado,
                  Spline, imagen…) y la espiral se compone encima con <b>transparencia real</b>.
                  Por eso el fondo propio del visualizador (sólido, arcoíris líquido, burbujas…)
                  <b> no se pinta en la capa</b>: taparía el del sistema.
                  <br />
                  <span className="text-cyan-100/50">
                    ¿Lo quieres? Está entero en la app <code className="text-[10px]">/audiomorphic</code>.
                  </span>
                </p>
              </div>
            )}
            {!isBackground && (
            <div className="liquid-section break-inside-avoid border-cyan-500/30 shadow-[inset_0_0_30px_rgba(0,242,254,0.05)]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold neon-text flex items-center gap-2">
                  <Palette className="w-5 h-5 icon-neon" /> Fondo
                  {isLocked && <Lock size={16} className="text-amber-400" />}
                </h3>
                <button onClick={() => randomizeSection('background')} className={`text-cyan-400 hover:text-cyan-300 transition-colors ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`} title="Armonía Aleatoria">
                  <Shuffle size={18} className="icon-neon" />
                </button>
              </div>

              <div className="mb-4 bg-black/20 p-4 rounded-2xl border border-white/5">
                <label className="text-xs uppercase tracking-wider text-gray-300 flex items-center gap-2 mb-3 font-semibold">
                  Modo de Fondo
                </label>
                <LiquidSelect
                  value={params.bgMode || 'solid'}
                  onChange={(val) => handleChange('bgMode', val)}
                  options={[
                    { value: 'solid', label: 'Color Sólido' },
                    { value: 'gradient', label: 'Degradado' },
                    { value: 'liquid-rainbow', label: 'Arcoíris Líquido', locked: isLocked },
                    { value: 'crystal-bubbles', label: 'Burbujas de Cristal', locked: isLocked },
                    { value: 'organic-fade', label: 'Transición Orgánica', locked: isLocked },
                    { value: 'morphing-colors', label: 'Colores Mórficos', locked: isLocked }
                  ]}
                />
              </div>

              <div className={`mb-4 bg-black/20 p-4 rounded-2xl border border-white/5 ${isLocked ? 'opacity-50 cursor-pointer' : ''}`} onClick={() => { if (isLocked) onShowSubscription(); }}>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-xs uppercase tracking-wider text-gray-300 font-semibold flex items-center gap-2">
                    Colores Personalizables {isLocked && <Star size={12} className="text-yellow-500 fill-current" />}
                  </label>
                  <button 
                    onClick={() => {
                      if (isLocked) {
                        onShowSubscription();
                        return;
                      }
                      handleChange('bgColors', [...(params.bgColors || []), '#ffffff']);
                    }}
                    className="text-cyan-400 hover:text-cyan-300 text-xs px-2 py-1 bg-cyan-500/10 rounded"
                  >
                    + Añadir
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(params.bgColors || []).map((color, idx) => (
                    <div key={idx} className="relative group">
                      <input 
                        type="color" 
                        value={color} 
                        onChange={(e) => {
                          const newColors = [...(params.bgColors || [])];
                          newColors[idx] = e.target.value;
                          handleChange('bgColors', newColors);
                        }} 
                        className="w-full h-8 rounded cursor-pointer bg-transparent border-none" 
                      />
                      {(params.bgColors || []).length > 1 && (
                        <button 
                          onClick={() => {
                            const newColors = (params.bgColors || []).filter((_, i) => i !== idx);
                            handleChange('bgColors', newColors);
                          }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className={`flex justify-between items-center bg-black/20 p-3 rounded-2xl border border-white/5 gap-2 mb-4 ${isLocked ? 'opacity-50 cursor-pointer' : ''}`} onClick={() => { if (isLocked) onShowSubscription(); }}>
                 <label className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-300 font-semibold truncate flex-1 flex items-center gap-1">
                   Animado {isLocked && <Star size={12} className="text-yellow-500 fill-current" />}
                 </label>
                 <div onClick={() => {
                   if (isLocked) {
                     onShowSubscription();
                     return;
                   }
                   handleChange('bgAnimatable', !params.bgAnimatable);
                 }} className={`liquid-switch shrink-0 ${params.bgAnimatable ? 'active' : ''} ${isLocked ? 'opacity-60' : ''}`}><div className="liquid-switch-thumb"></div></div>
              </div>

              {renderControl("Velocidad Animación", "bgSpeed", 0, 5, 0.1)}

              <div className={`flex justify-between items-center bg-black/20 p-3 rounded-2xl border border-white/5 gap-2 mb-4 mt-4 ${isLocked ? 'opacity-50 cursor-pointer' : ''}`} onClick={() => { if (isLocked) onShowSubscription(); }}>
                 <label className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-300 font-semibold truncate flex-1 flex items-center gap-1">
                   Viñeta {isLocked && <Star size={12} className="text-yellow-500 fill-current" />}
                 </label>
                 <div onClick={() => {
                   if (isLocked) {
                     onShowSubscription();
                     return;
                   }
                   handleChange('bgVignette', !params.bgVignette);
                 }} className={`liquid-switch shrink-0 ${params.bgVignette ? 'active' : ''} ${isLocked ? 'opacity-60' : ''}`}><div className="liquid-switch-thumb"></div></div>
              </div>

              {params.bgVignette && renderControl("Intensidad Viñeta", "bgVignetteIntensity", 0, 1, 0.05)}
            </div>
            )}

            {/* Base Geometry */}
            <div className="liquid-section break-inside-avoid">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold neon-text text-purple-400 flex items-center gap-2" style={{backgroundImage: 'linear-gradient(135deg, #c084fc 0%, #a855f7 100%)'}}>
                  <Maximize className="w-5 h-5 icon-neon" /> Geometría Base
                </h3>
                <button onClick={() => randomizeSection('baseGeometry')} className={`text-purple-400 hover:text-purple-300 transition-colors ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`} title="Armonía Aleatoria">
                  <Shuffle size={18} className="icon-neon" />
                </button>
              </div>
              {renderControl("Factor K", "k", 0.8, 1.2, 0.001, undefined, params.autoPilot, true)}
              {renderControl("Detalle", "iter", 100, 2000, 10, undefined, false, true)}
              {renderControl("Profundidad", "zoom", 0.001, 3.0, 0.001, undefined, false, true)}
              {renderControl("Distancia", "distanceZoom", 0.1, 5.0, 0.01, undefined, false, true)}
              {renderControl("Grosor de Línea Espiral", "spiralThickness", 0.1, 10, 0.1, undefined, false, true)}
            </div>

            {/* Transformation */}
            <div className="liquid-section break-inside-avoid">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="text-lg font-bold neon-text text-green-400 flex items-center gap-2" style={{backgroundImage: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)'}}>
                  <RotateCw className="w-5 h-5 icon-neon" /> Transformación
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => randomizeSection('transformation')} className={`text-green-400 hover:text-green-300 transition-colors ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`} title="Armonía Aleatoria">
                    <Shuffle size={18} className="icon-neon" />
                  </button>
                  <button 
                    onClick={() => {
                      if (isLocked) {
                        onShowSubscription();
                        return;
                      }
                      centerSpiral();
                    }}
                    disabled={params.autoPilot || isLocked}
                    className={`liquid-bubble px-3 py-2 text-xs uppercase font-bold text-cyan-300 flex items-center gap-1 ${(params.autoPilot || isLocked) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Target size={14} className="icon-neon" /> CENTRAR {isLocked && <Star size={12} className="text-yellow-500 fill-current" />}
                  </button>
                </div>
              </div>
              
              {renderControl("Ángulo ψ", "psi", -6.28, 6.28, 0.01, undefined, params.autoPilot, true)}
              {renderControl("Desplazamiento X", "z0_r", -2, 2, 0.01, undefined, params.autoPilot, true)}
              {renderControl("Desplazamiento Y", "z0_i", -2, 2, 0.01, undefined, params.autoPilot, true)}
            </div>

          </div>
        </div>
      </div>

      {/* Preset Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="liquid-panel w-full max-w-md p-6 border border-white/20 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold neon-text flex items-center gap-2">
                <Save className="w-6 h-6 icon-neon" />
                Presets y Ajustes
              </h2>
              <button onClick={() => setShowPresetModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <p className="text-sm text-gray-300 mb-6">
              Selecciona qué categorías deseas guardar o cargar.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { id: 'baseGeometry', label: 'Geometría Base' },
                { id: 'colors', label: 'Cromatismo' },
                { id: 'sacredGeometry', label: 'Geometría Sagrada' },
                { id: 'vrAr', label: 'VR / AR' },
                { id: 'reactivity', label: 'Reactividad' }
              ].map(cat => (
                <label key={cat.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={presetCategories[cat.id as keyof typeof presetCategories]}
                    onChange={(e) => setPresetCategories(prev => ({ ...prev, [cat.id]: e.target.checked }))}
                    className="rounded border-gray-500 bg-black/50 text-cyan-500 focus:ring-cyan-500/50"
                  />
                  {cat.label}
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              <button
                onClick={handleExportPreset}
                className="liquid-bubble w-full py-3 text-sm font-bold flex items-center justify-center gap-2 text-emerald-300 hover:text-emerald-200"
              >
                <Download className="w-5 h-5 icon-neon" />
                Exportar Preset Actual
              </button>

              <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  ref={fileInputRef}
                  onChange={handleImportPreset}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="liquid-bubble w-full py-3 text-sm font-bold flex items-center justify-center gap-2 text-cyan-300 hover:text-cyan-200"
                >
                  <Upload className="w-5 h-5 icon-neon" />
                  Importar Preset
                </button>
              </div>
            </div>

            <div className="mt-8 border-t border-white/10 pt-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
                <Cloud className="w-5 h-5 text-blue-400" />
                Mis Presets
              </h3>
              <p className="text-[11px] text-gray-400 mb-4">
                Guardados <b>en este dispositivo</b>, ilimitados y sin cuenta. (En la app original
                esto exigía iniciar sesión y plan de pago.)
              </p>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Nombre del preset..."
                  className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleSaveCloudPreset}
                  disabled={!presetName.trim() || isSavingPreset}
                  className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all ${
                    !presetName.trim() || isSavingPreset
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_10px_rgba(37,99,235,0.5)] cursor-pointer'
                  }`}
                >
                  {isSavingPreset ? 'Guardando...' : 'Guardar'}
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {cloudPresets.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">Todavía no has guardado ningún preset.</p>
                ) : (
                  cloudPresets.map(preset => (
                    <div key={preset.id} className="flex items-center justify-between bg-black/40 border border-white/5 rounded-lg p-3 hover:border-blue-500/30 transition-colors">
                      <span className="text-sm font-medium text-gray-200 truncate pr-4">{preset.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleLoadCloudPreset(preset)}
                          className="p-1.5 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/40 transition-colors cursor-pointer"
                          title="Cargar"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCloudPreset(preset.id)}
                          className="p-1.5 bg-red-500/20 text-red-300 rounded hover:bg-red-500/40 transition-colors cursor-pointer"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ControlPanel;
