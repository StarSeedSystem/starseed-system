// ════════════════════════════════════════════════════════════════
// Omni-Frecuencias — Recetas de sinergia + mapeo Frecuencia→Oscilador
// ----------------------------------------------------------------
// Lógica COMPARTIDA (sin estado ni DOM) que describe cómo una entrada de
// la biblioteca se materializa en uno o varios osciladores del motor
// `useAudio`. Se extrae aquí desde `App.tsx` para que TANTO la app
// completa COMO el widget compacto del dashboard usen exactamente el
// MISMO código y los MISMOS datos (coherencia total del ecosistema).
//
//   • getSynergyRecipe(id): stacks multi-oscilador (binaurales Phi/Pi,
//     Schumann, Sol-Luna, tríadas estelares, intervalos…).
//   • frequencyToOscillators(item): convierte cualquier FrequencyItem en
//     los Partial<OscillatorState> que hay que añadir (sinergia → receta;
//     resto → un único oscilador con color por categoría).
//
// No requiere 'use client' (puro). El motor (useAudio) es quien crea los
// nodos de audio; este módulo solo decide QUÉ osciladores construir.
// ════════════════════════════════════════════════════════════════

import { CATEGORIES, type FrequencyItem, type OscillatorState } from '../types';

/**
 * Recetas de sinergia: cómo se construyen las combinaciones complejas
 * (stacks multi-oscilador, binaurales, etc.). Devuelve null si el id no
 * corresponde a una receta conocida.
 */
export const getSynergyRecipe = (id: string): Partial<OscillatorState>[] | null => {
  const commonVol = 0.5;

  switch (id) {
    case 'syn_phi': // 1.618 Hz Binaural (Golden Ratio)
      return [
        { frequency: 432, type: 'sine', volume: commonVol, panX: -0.8, panY: 0, panZ: 0, name: 'Base Phi (L)', isIndependent: false, color: '#fbbf24' },
        { frequency: 433.618, type: 'sine', volume: commonVol, panX: 0.8, panY: 0, panZ: 0, name: 'Binaural Phi (R)', isIndependent: false, color: '#f59e0b' },
      ];
    case 'syn_pi': // 3.1416 Hz Binaural
      return [
        { frequency: 432, type: 'sine', volume: commonVol, panX: -0.8, panY: 0, panZ: 0, name: 'Base Pi (L)', isIndependent: false, color: '#3b82f6' },
        { frequency: 435.1416, type: 'sine', volume: commonVol, panX: 0.8, panY: 0, panZ: 0, name: 'Binaural Pi (R)', isIndependent: false, color: '#60a5fa' },
      ];
    case 'syn_astral': // Theta 4Hz
      return [
        { frequency: 216, type: 'sine', volume: commonVol, panX: -0.9, panY: 0, panZ: 0, name: 'Base Astral (L)', isIndependent: false, color: '#8b5cf6' },
        { frequency: 220, type: 'sine', volume: commonVol, panX: 0.9, panY: 0, panZ: 0, name: 'Theta 4Hz (R)', isIndependent: false, color: '#a78bfa' },
      ];
    case 'syn_gaia_matrix': // 528 + 7.83
      return [
        { frequency: 528, type: 'sine', volume: 0.4, panX: 0, panY: 0, panZ: 0, name: 'ADN 528Hz', isIndependent: false, color: '#4ade80' },
        { frequency: 7.83, type: 'sine', volume: 0.8, panX: 0, panY: -1, panZ: 0, name: 'Schumann Ground', isIndependent: true, color: '#166534' },
      ];
    case 'syn_sun_moon': // Sun + Moon
      return [
        { frequency: 126.22, type: 'sine', volume: commonVol, panX: -0.6, panY: 0.5, panZ: 0, name: 'Sol (Yang)', isIndependent: false, color: '#fcd34d' },
        { frequency: 210.42, type: 'sine', volume: commonVol, panX: 0.6, panY: -0.5, panZ: 0, name: 'Luna (Yin)', isIndependent: false, color: '#e2e8f0' },
      ];
    case 'syn_venus_mars': // Venus + Mars
      return [
        { frequency: 221.23, type: 'sine', volume: commonVol, panX: -0.6, panY: 0, panZ: 0, name: 'Venus', isIndependent: false, color: '#f472b6' },
        { frequency: 144.72, type: 'sine', volume: commonVol, panX: 0.6, panY: 0, panZ: 0, name: 'Marte', isIndependent: false, color: '#ef4444' },
      ];
    case 'syn_fibonacci': // 144 + 233
      return [
        { frequency: 144, type: 'sine', volume: commonVol, panX: -0.3, panY: 0, panZ: 0, name: 'Fibo 144', isIndependent: false, color: '#2dd4bf' },
        { frequency: 233, type: 'sine', volume: commonVol, panX: 0.3, panY: 0, panZ: 0, name: 'Fibo 233', isIndependent: false, color: '#14b8a6' },
      ];
    case 'syn_pleiades': // Chord
      return [
        { frequency: 432, type: 'sine', volume: 0.4, panX: 0, panY: 0, panZ: 0, name: 'Pléyades Base', isIndependent: false, color: '#0ea5e9' },
        { frequency: 528, type: 'sine', volume: 0.3, panX: -0.5, panY: 0.5, panZ: 0, name: 'Pléyades High', isIndependent: false, color: '#38bdf8' },
        { frequency: 639, type: 'sine', volume: 0.3, panX: 0.5, panY: 0.5, panZ: 0, name: 'Pléyades Connect', isIndependent: false, color: '#7dd3fc' },
      ];
    case 'syn_sirius': // Sirius Connection
      return [
        { frequency: 396, type: 'sine', volume: 0.5, panX: -0.4, panY: 0, panZ: 0, name: 'Sirio Base', isIndependent: false, color: '#6366f1' },
        { frequency: 741, type: 'sine', volume: 0.4, panX: 0.4, panY: 0.5, panZ: 0, name: 'Sirio Light', isIndependent: false, color: '#818cf8' },
      ];
    case 'syn_orion': // Orion Belt Triad
      return [
        { frequency: 144, type: 'sine', volume: 0.4, panX: -0.5, panY: 0, panZ: 0, name: 'Alnitak', isIndependent: false, color: '#3b82f6' },
        { frequency: 528, type: 'sine', volume: 0.4, panX: 0, panY: 0.5, panZ: 0, name: 'Alnilam', isIndependent: false, color: '#60a5fa' },
        { frequency: 852, type: 'sine', volume: 0.4, panX: 0.5, panY: 0, panZ: 0, name: 'Mintaka', isIndependent: false, color: '#93c5fd' },
      ];
    case 'syn_arcturus': // Healing Stack
      return [
        { frequency: 396, type: 'sine', volume: 0.4, panX: -0.3, panY: -0.2, panZ: 0, name: 'Release Fear', isIndependent: false, color: '#f87171' },
        { frequency: 528, type: 'sine', volume: 0.4, panX: 0.3, panY: -0.2, panZ: 0, name: 'Heal Structure', isIndependent: false, color: '#4ade80' },
        { frequency: 963, type: 'sine', volume: 0.3, panX: 0, panY: 0.5, panZ: 0, name: 'Spirit Unity', isIndependent: false, color: '#facc15' },
      ];
    case 'syn_christ': // 33 Hz
      return [
        { frequency: 33, type: 'sine', volume: 0.7, panX: 0, panY: 0, panZ: 0, name: 'Resonancia 33', isIndependent: true, color: '#fb923c' },
      ];
    case 'syn_fifth':
      return [
        { frequency: 256, type: 'sine', volume: commonVol, panX: -0.4, panY: 0, panZ: 0, name: 'Raíz (C)', isIndependent: false, color: '#94a3b8' },
        { frequency: 384, type: 'sine', volume: commonVol, panX: 0.4, panY: 0, panZ: 0, name: 'Quinta (G)', isIndependent: false, color: '#64748b' },
      ];
    case 'syn_tritone':
      return [
        { frequency: 256, type: 'sine', volume: commonVol, panX: -0.4, panY: 0, panZ: 0, name: 'Raíz (C)', isIndependent: false, color: '#ef4444' },
        { frequency: 362.04, type: 'sine', volume: commonVol, panX: 0.4, panY: 0, panZ: 0, name: 'Tritono (F#)', isIndependent: false, color: '#dc2626' },
      ];
    default:
      return null;
  }
};

/** Color hex por defecto (para el visualizador) según la categoría. */
export function colorForCategory(category: FrequencyItem['category']): string {
  let defaultColor = '#38bdf8';
  const cat = CATEGORIES.find((c) => c.id === category);
  if (cat) {
    if (cat.color.includes('purple')) defaultColor = '#c084fc';
    if (cat.color.includes('red')) defaultColor = '#f87171';
    if (cat.color.includes('green') || cat.color.includes('emerald')) defaultColor = '#4ade80';
    if (cat.color.includes('amber') || cat.color.includes('orange')) defaultColor = '#fbbf24';
    if (cat.color.includes('pink')) defaultColor = '#f472b6';
  }
  return defaultColor;
}

/** Extrae una frecuencia numérica reproducible de un item (con fallback). */
export function resolveFrequency(item: FrequencyItem): number {
  let freq = item.numericalHz;
  if (!freq || freq === 0) {
    const match = item.hz.match(/[\d.]+/);
    freq = match ? parseFloat(match[0]) : 432;
  }
  return freq;
}

/**
 * Convierte un FrequencyItem en los osciladores que hay que añadir al
 * motor. Las sinergias devuelven su receta completa; el resto, un único
 * oscilador senoidal con color por categoría. MISMA lógica que usa la
 * app completa (`App.handleAddToPlayer`).
 */
export function frequencyToOscillators(item: FrequencyItem): Partial<OscillatorState>[] {
  if (item.category === 'synergy') {
    const recipe = getSynergyRecipe(item.id);
    if (recipe) return recipe;
  }
  return [
    {
      name: item.name,
      frequency: resolveFrequency(item),
      type: 'sine',
      volume: 0.5,
      panX: 0,
      color: colorForCategory(item.category),
    },
  ];
}
