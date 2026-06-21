'use client';

// ════════════════════════════════════════════════════════════════
// useOmniLastSession — recall de la última sesión (modelo REAL)
// ----------------------------------------------------------------
// Persiste el último `PresetContent` (osciladores reales del motor
// useAudio) en localStorage, SSR-safe, para "continuar donde lo dejaste".
// Lo escribe el widget compacto del dashboard cada vez que cambia su
// mezcla; lo puede leer la app completa al abrirse (recall). Usa el MISMO
// modelo `OscillatorState[]` que el motor y los presets de Biblioteca, de
// modo que es directamente cargable por `Generator.loadPreset`.
//
// Se mantiene aparte del store soberano (library-store) a propósito: la
// "última sesión" es un borrador efímero del dispositivo, no un recurso
// guardado por el usuario. Para guardar de verdad se usa useFileSystem.
// ════════════════════════════════════════════════════════════════

import { OscillatorState, PresetContent } from '../types';

const LAST_KEY = 'starseed.omnifrecuencias.last-session';

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/** Saneo defensivo de osciladores deserializados (evita NaN / tipos raros). */
function sanitizeOscillators(raw: unknown): OscillatorState[] {
  if (!Array.isArray(raw)) return [];
  const waves: OscillatorState['type'][] = ['sine', 'square', 'sawtooth', 'triangle'];
  const out: OscillatorState[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const frequency = Number(o.frequency);
    if (!Number.isFinite(frequency) || frequency <= 0) continue;
    const type = waves.includes(o.type as OscillatorState['type'])
      ? (o.type as OscillatorState['type'])
      : 'sine';
    const num = (v: unknown, def: number, min: number, max: number): number => {
      const n = Number(v);
      if (!Number.isFinite(n)) return def;
      return Math.max(min, Math.min(max, n));
    };
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : `osc-${out.length}-${Date.now()}`,
      frequency,
      type,
      volume: num(o.volume, 0.5, 0, 1),
      panX: num(o.panX, 0, -1, 1),
      panY: num(o.panY, 0, -1, 1),
      panZ: num(o.panZ, 0, -1, 1),
      isPlaying: o.isPlaying !== false,
      name: typeof o.name === 'string' ? o.name : 'Oscilador',
      isIndependent: o.isIndependent === true,
      color: typeof o.color === 'string' && o.color ? o.color : '#38bdf8',
    });
  }
  return out;
}

/** Guarda los osciladores actuales como "última sesión". SSR-safe. */
export function rememberLastSession(oscillators: OscillatorState[]): void {
  if (!isClient()) return;
  try {
    const payload: PresetContent = {
      oscillators,
      dateCreated: Date.now(),
      description: 'Última sesión del reproductor',
    };
    localStorage.setItem(LAST_KEY, JSON.stringify(payload));
  } catch {
    /* cuota / modo privado: degradar en silencio */
  }
}

/** Recupera la última sesión guardada (o null si no hay / inválida). */
export function getLastSession(): PresetContent | null {
  if (!isClient()) return null;
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const oscillators = sanitizeOscillators(parsed.oscillators);
    if (!oscillators.length) return null;
    return {
      oscillators,
      dateCreated: Number(parsed.dateCreated) || Date.now(),
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
    };
  } catch {
    return null;
  }
}

/** Borra la última sesión. */
export function clearLastSession(): void {
  if (!isClient()) return;
  try {
    localStorage.removeItem(LAST_KEY);
  } catch {
    /* noop */
  }
}
