'use client';

// ════════════════════════════════════════════════════════════════
// omni-presets — Presets integrados + persistencia como ARCHIVOS de la
// Biblioteca soberana del usuario + recall inteligente.
// ----------------------------------------------------------------
// • BUILTIN_PRESETS: catálogo de fábrica (Solfeggio, Schumann, ondas
//   cerebrales: Delta/Theta/Alfa/Beta/Gamma, enfoque, sueño, calma…).
//
// • Persistencia: cada preset del usuario se guarda como un RECURSO de
//   biblioteca (`library-store.saveResource`) con:
//       kind   = 'preset'
//       origin = 'omnifrecuencias'
//       title  = nombre del preset
//       url    = data URL JSON (data:application/json;base64,<OmniConfig>)
//   Así aparece como "archivo" en la Biblioteca y se sincroniza a Supabase
//   por la capa de sync existente. El payload completo viaja en la url, de
//   modo que no se necesita almacenamiento extra.
//
// • Recall inteligente (localStorage, SSR-safe):
//       starseed.omni.last      → último OmniConfig usado (continuar).
//       starseed.omni.favorites → ids de presets favoritos (built-in + lib).
// ════════════════════════════════════════════════════════════════

import {
    getSaved,
    removeSaved,
    saveResource,
    type SavedResource,
} from '@/lib/library-store';
import type { OmniConfig, OmniTone, OmniWaveform } from './omni-engine';
import { makeToneId } from './omni-engine';

// ── Helpers de construcción de tonos (para presets compactos) ────

function tone(
    freq: number,
    opts: Partial<Omit<OmniTone, 'id' | 'freq'>> = {},
): OmniTone {
    return {
        id: makeToneId(),
        freq,
        waveform: opts.waveform ?? 'sine',
        gain: opts.gain ?? 0.6,
        pan: opts.pan ?? 0,
        binauralBeat: opts.binauralBeat,
        pulseHz: opts.pulseHz,
        label: opts.label,
    };
}

// ── Catálogo de fábrica ──────────────────────────────────────────

export interface BuiltinPreset {
    id: string;
    name: string;
    desc: string;
    config: OmniConfig;
}

export const BUILTIN_PRESETS: BuiltinPreset[] = [
    // ── Solfeggio ────────────────────────────────────────────────
    {
        id: 'solf-396',
        name: '396 Hz · Liberación',
        desc: 'Liberar miedo y culpa',
        config: {
            name: '396 Hz · Liberación',
            desc: 'Solfeggio — liberar miedo y culpa',
            tones: [tone(396, { label: '396 Hz' })],
            masterVolume: 0.5,
        },
    },
    {
        id: 'solf-417',
        name: '417 Hz · Cambio',
        desc: 'Deshacer situaciones, facilitar el cambio',
        config: {
            name: '417 Hz · Cambio',
            desc: 'Solfeggio — facilitar el cambio',
            tones: [tone(417, { label: '417 Hz' })],
            masterVolume: 0.5,
        },
    },
    {
        id: 'solf-528',
        name: '528 Hz · Reparación',
        desc: 'Transformación y reparación (ADN)',
        config: {
            name: '528 Hz · Reparación',
            desc: 'Solfeggio — transformación / ADN',
            tones: [tone(528, { label: '528 Hz' })],
            masterVolume: 0.5,
        },
    },
    {
        id: 'solf-639',
        name: '639 Hz · Vínculos',
        desc: 'Conexión, relaciones y armonía',
        config: {
            name: '639 Hz · Vínculos',
            desc: 'Solfeggio — conexión y vínculos',
            tones: [tone(639, { label: '639 Hz' })],
            masterVolume: 0.5,
        },
    },
    {
        id: 'solf-741',
        name: '741 Hz · Expresión',
        desc: 'Expresión, soluciones y limpieza',
        config: {
            name: '741 Hz · Expresión',
            desc: 'Solfeggio — expresión y soluciones',
            tones: [tone(741, { label: '741 Hz' })],
            masterVolume: 0.5,
        },
    },
    {
        id: 'solf-852',
        name: '852 Hz · Intuición',
        desc: 'Intuición y retorno al orden espiritual',
        config: {
            name: '852 Hz · Intuición',
            desc: 'Solfeggio — intuición y retorno',
            tones: [tone(852, { label: '852 Hz' })],
            masterVolume: 0.5,
        },
    },
    // ── Afinación natural ────────────────────────────────────────
    {
        id: 'tune-432',
        name: '432 Hz · Afinación natural',
        desc: 'Afinación cálida y orgánica',
        config: {
            name: '432 Hz · Afinación natural',
            desc: 'Afinación natural',
            tones: [tone(432, { label: '432 Hz', waveform: 'triangle' })],
            masterVolume: 0.5,
        },
    },
    // ── Resonancia Schumann (binaural) ───────────────────────────
    {
        id: 'schumann-783',
        name: 'Schumann 7.83 Hz',
        desc: 'Resonancia de la Tierra · binaural',
        config: {
            name: 'Schumann 7.83 Hz',
            desc: 'Resonancia Schumann — latido binaural 7.83 Hz',
            tones: [tone(136.1, { label: 'Tierra', binauralBeat: 7.83, gain: 0.55 })],
            masterVolume: 0.5,
        },
    },
    // ── Ondas cerebrales (binaural) ──────────────────────────────
    {
        id: 'delta-sleep',
        name: 'Sueño profundo · Delta',
        desc: 'Latido binaural 2 Hz para descanso profundo',
        config: {
            name: 'Sueño profundo · Delta',
            desc: 'Ondas Delta — sueño reparador (2 Hz binaural)',
            tones: [tone(100, { label: 'Delta', binauralBeat: 2, gain: 0.5, waveform: 'sine' })],
            masterVolume: 0.45,
        },
    },
    {
        id: 'theta-meditate',
        name: 'Meditación · Theta',
        desc: 'Latido binaural 6 Hz para meditación honda',
        config: {
            name: 'Meditación · Theta',
            desc: 'Ondas Theta — meditación profunda (6 Hz binaural)',
            tones: [tone(150, { label: 'Theta', binauralBeat: 6, gain: 0.5 })],
            masterVolume: 0.45,
        },
    },
    {
        id: 'alpha-calm',
        name: 'Calma · Alfa',
        desc: 'Latido binaural 10 Hz para relajación lúcida',
        config: {
            name: 'Calma · Alfa',
            desc: 'Ondas Alfa — calma relajada (10 Hz binaural)',
            tones: [tone(200, { label: 'Alfa', binauralBeat: 10, gain: 0.5 })],
            masterVolume: 0.5,
        },
    },
    {
        id: 'beta-focus',
        name: 'Enfoque · Beta',
        desc: 'Latido binaural 16 Hz para concentración',
        config: {
            name: 'Enfoque · Beta',
            desc: 'Ondas Beta — enfoque y concentración (16 Hz binaural)',
            tones: [tone(220, { label: 'Beta', binauralBeat: 16, gain: 0.5 })],
            masterVolume: 0.5,
        },
    },
    {
        id: 'gamma-insight',
        name: 'Lucidez · Gamma',
        desc: 'Latido binaural 40 Hz para claridad mental',
        config: {
            name: 'Lucidez · Gamma',
            desc: 'Ondas Gamma — claridad e insight (40 Hz binaural)',
            tones: [tone(240, { label: 'Gamma', binauralBeat: 40, gain: 0.45 })],
            masterVolume: 0.5,
        },
    },
    // ── Combinados (multi-tono) ──────────────────────────────────
    {
        id: 'focus-iso',
        name: 'Enfoque isocrónico',
        desc: '528 Hz con pulsos isocrónicos a 14 Hz',
        config: {
            name: 'Enfoque isocrónico',
            desc: 'Tono 528 Hz modulado en pulsos a 14 Hz (Beta baja)',
            tones: [tone(528, { label: 'Pulso', pulseHz: 14, gain: 0.6 })],
            masterVolume: 0.5,
        },
    },
    {
        id: 'deep-rest-stack',
        name: 'Descanso profundo (capas)',
        desc: 'Schumann + Delta binaural superpuestos',
        config: {
            name: 'Descanso profundo (capas)',
            desc: 'Capa terrestre (Schumann) + Delta para soltar',
            tones: [
                tone(136.1, { label: 'Tierra', binauralBeat: 7.83, gain: 0.4 }),
                tone(90, { label: 'Delta', binauralBeat: 2.5, gain: 0.35 }),
            ],
            masterVolume: 0.45,
        },
    },
];

// ── Persistencia como archivos de Biblioteca ─────────────────────

const PRESET_KIND = 'preset';
const PRESET_ORIGIN = 'omnifrecuencias';

/** Codifica un OmniConfig en un data URL JSON (base64, unicode-safe). */
function configToDataUrl(config: OmniConfig): string {
    const json = JSON.stringify(config);
    let b64: string;
    try {
        // unicode-safe (nombres con acentos): UTF-8 → latin1 → base64
        const utf8 = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
            String.fromCharCode(parseInt(p1, 16)),
        );
        b64 = typeof btoa !== 'undefined' ? btoa(utf8) : utf8;
    } catch {
        b64 = '';
    }
    return `data:application/json;base64,${b64}`;
}

/** Decodifica un data URL JSON a OmniConfig (o null si no es válido). */
function dataUrlToConfig(url: string | undefined): OmniConfig | null {
    if (!url || !url.startsWith('data:application/json;base64,')) return null;
    const b64 = url.slice('data:application/json;base64,'.length);
    try {
        const bin = typeof atob !== 'undefined' ? atob(b64) : b64;
        const json = decodeURIComponent(
            bin
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join(''),
        );
        const parsed = JSON.parse(json) as unknown;
        return normalizeConfig(parsed);
    } catch {
        return null;
    }
}

/** Saneo defensivo de un OmniConfig deserializado (evita NaN / tipos raros). */
function normalizeConfig(raw: unknown): OmniConfig | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const tonesRaw = Array.isArray(obj.tones) ? obj.tones : [];
    const waveforms: OmniWaveform[] = ['sine', 'square', 'triangle', 'sawtooth'];
    const tones: OmniTone[] = tonesRaw
        .map((t): OmniTone | null => {
            if (!t || typeof t !== 'object') return null;
            const to = t as Record<string, unknown>;
            const freq = Number(to.freq);
            if (!Number.isFinite(freq) || freq <= 0) return null;
            const waveform = waveforms.includes(to.waveform as OmniWaveform)
                ? (to.waveform as OmniWaveform)
                : 'sine';
            const gain = Number.isFinite(Number(to.gain)) ? Number(to.gain) : 0.6;
            const pan = Number.isFinite(Number(to.pan)) ? Number(to.pan) : 0;
            const binauralBeat = Number.isFinite(Number(to.binauralBeat))
                ? Number(to.binauralBeat)
                : undefined;
            const pulseHz = Number.isFinite(Number(to.pulseHz))
                ? Number(to.pulseHz)
                : undefined;
            return {
                id: typeof to.id === 'string' && to.id ? to.id : makeToneId(),
                freq,
                waveform,
                gain: Math.max(0, Math.min(1, gain)),
                pan: Math.max(-1, Math.min(1, pan)),
                binauralBeat: binauralBeat && binauralBeat > 0 ? binauralBeat : undefined,
                pulseHz: pulseHz && pulseHz > 0 ? pulseHz : undefined,
                label: typeof to.label === 'string' ? to.label : undefined,
            };
        })
        .filter((t): t is OmniTone => t !== null);
    if (!tones.length) return null;
    const masterVolume = Number.isFinite(Number(obj.masterVolume))
        ? Math.max(0, Math.min(1, Number(obj.masterVolume)))
        : 0.5;
    return {
        name: typeof obj.name === 'string' && obj.name ? obj.name : 'Preset',
        desc: typeof obj.desc === 'string' ? obj.desc : undefined,
        tones,
        masterVolume,
    };
}

/** Preset cargado desde la biblioteca (recurso + config parseada). */
export interface LibraryPreset {
    id: string;
    name: string;
    config: OmniConfig;
    savedAt: number;
}

/**
 * Guarda un OmniConfig como archivo de Biblioteca. Devuelve el data URL
 * usado (para diagnósticos). Deduplica por (url + título) en el store.
 */
export function savePresetToLibrary(config: OmniConfig): string {
    const url = configToDataUrl(config);
    saveResource({
        kind: PRESET_KIND,
        title: config.name,
        url,
        origin: PRESET_ORIGIN,
    });
    return url;
}

/** Lista los presets del usuario guardados en la Biblioteca (parseados). */
export function listLibraryPresets(): LibraryPreset[] {
    return getSaved()
        .filter((r: SavedResource) => r.kind === PRESET_KIND && r.origin === PRESET_ORIGIN)
        .map((r): LibraryPreset | null => {
            const config = dataUrlToConfig(r.url);
            if (!config) return null;
            return { id: r.id, name: r.title, config, savedAt: r.savedAt };
        })
        .filter((p): p is LibraryPreset => p !== null);
}

/** Carga un preset de biblioteca por id (o null). */
export function loadPreset(id: string): OmniConfig | null {
    const found = listLibraryPresets().find((p) => p.id === id);
    return found ? found.config : null;
}

/** Elimina un preset de la Biblioteca por id. */
export function deletePreset(id: string): void {
    removeSaved(id);
}

// ── Recall inteligente (localStorage) ────────────────────────────

const LAST_KEY = 'starseed.omni.last';
const FAV_KEY = 'starseed.omni.favorites';

function isClient(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/** Persiste el último OmniConfig usado (para "continuar donde lo dejaste"). */
export function rememberLastConfig(config: OmniConfig): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(LAST_KEY, JSON.stringify(config));
    } catch {
        /* cuota / privado: degradar en silencio */
    }
}

/** Recupera el último OmniConfig usado (o null). */
export function getLastConfig(): OmniConfig | null {
    if (!isClient()) return null;
    try {
        const raw = localStorage.getItem(LAST_KEY);
        if (!raw) return null;
        return normalizeConfig(JSON.parse(raw));
    } catch {
        return null;
    }
}

/** Lee la lista de ids favoritos. */
export function getFavorites(): string[] {
    if (!isClient()) return [];
    try {
        const raw = localStorage.getItem(FAV_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

/** Alterna un id en favoritos y devuelve la lista resultante. */
export function toggleFavorite(id: string): string[] {
    const current = getFavorites();
    const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
    if (isClient()) {
        try {
            localStorage.setItem(FAV_KEY, JSON.stringify(next));
        } catch {
            /* noop */
        }
    }
    return next;
}
