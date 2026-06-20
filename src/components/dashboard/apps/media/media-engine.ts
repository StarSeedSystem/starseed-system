'use client';

// ════════════════════════════════════════════════════════════════
// media-engine — Motor de reproducción compartido (singleton)
// ----------------------------------------------------------------
// UN único HTMLAudioElement global, creado perezosamente en el navegador
// la primera vez que se reproduce algo. Todos los widgets de media
// (Reproductor, Radio) comparten este motor → una sola fuente de audio,
// estado sincronizado y cola común para next/prev.
//
// El store expone un snapshot inmutable + suscripción, consumible con
// React vía useSyncExternalStore. getServerSnapshot devuelve el estado
// inicial para que el SSR de Next no rompa (no hay audio en el servidor).
//
// SSR-safety: nada toca `window`/`document`/`Audio`/`localStorage` hasta
// que se llama una acción desde un gesto del usuario (cliente).
// ════════════════════════════════════════════════════════════════

export interface MediaTrack {
    id: string;
    title: string;
    artist?: string;
    url: string;
    art?: string;
    kind?: 'music' | 'radio';
}

export interface MediaState {
    track: MediaTrack | null;
    playing: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    /** Stream/pista cargando (buffering inicial) — útil para radios en vivo. */
    loading: boolean;
}

const VOLUME_KEY = 'starseed.media.volume';

function readStoredVolume(): number {
    if (typeof window === 'undefined') return 0.8;
    try {
        const raw = window.localStorage.getItem(VOLUME_KEY);
        if (raw == null) return 0.8;
        const v = Number(raw);
        return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
    } catch {
        return 0.8;
    }
}

// Snapshot inicial (idéntico en server y primer render del cliente para
// evitar mismatches de hidratación; el volumen real se sincroniza tras montar).
const INITIAL_STATE: MediaState = {
    track: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    loading: false,
};

class MediaEngine {
    private audio: HTMLAudioElement | null = null;
    private state: MediaState = INITIAL_STATE;
    private listeners = new Set<() => void>();
    private queue: MediaTrack[] = [];
    private index = -1;
    private hydratedVolume = false;

    // ── Suscripción (useSyncExternalStore) ──────────────────────
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        // En la primera suscripción del cliente, hidratamos el volumen guardado.
        if (!this.hydratedVolume && typeof window !== 'undefined') {
            this.hydratedVolume = true;
            const v = readStoredVolume();
            if (v !== this.state.volume) {
                this.setState({ volume: v });
                if (this.audio) this.audio.volume = v;
            }
        }
        return () => {
            this.listeners.delete(listener);
        };
    };

    getSnapshot = (): MediaState => this.state;

    getServerSnapshot = (): MediaState => INITIAL_STATE;

    private setState(patch: Partial<MediaState>) {
        this.state = { ...this.state, ...patch };
        this.listeners.forEach((l) => l());
    }

    // ── Audio element (perezoso, solo en navegador) ─────────────
    private ensureAudio(): HTMLAudioElement | null {
        if (typeof window === 'undefined') return null;
        if (this.audio) return this.audio;
        const a = new Audio();
        a.preload = 'metadata';
        a.volume = this.state.volume;
        a.crossOrigin = 'anonymous';

        a.addEventListener('timeupdate', () => {
            this.setState({ currentTime: a.currentTime || 0 });
        });
        a.addEventListener('loadedmetadata', () => {
            const d = Number.isFinite(a.duration) ? a.duration : 0;
            this.setState({ duration: d, loading: false });
        });
        a.addEventListener('durationchange', () => {
            const d = Number.isFinite(a.duration) ? a.duration : 0;
            this.setState({ duration: d });
        });
        a.addEventListener('waiting', () => this.setState({ loading: true }));
        a.addEventListener('playing', () => this.setState({ loading: false, playing: true }));
        a.addEventListener('canplay', () => this.setState({ loading: false }));
        a.addEventListener('play', () => this.setState({ playing: true }));
        a.addEventListener('pause', () => this.setState({ playing: false }));
        a.addEventListener('ended', () => {
            this.setState({ playing: false });
            this.next();
        });
        a.addEventListener('error', () => this.setState({ loading: false, playing: false }));

        this.audio = a;
        return a;
    }

    // ── Acciones ────────────────────────────────────────────────
    playTrack(track: MediaTrack, queue?: MediaTrack[]) {
        const a = this.ensureAudio();
        if (!a) return;

        const list = queue && queue.length ? queue : [track];
        this.queue = list;
        const idx = list.findIndex((t) => t.id === track.id);
        this.index = idx >= 0 ? idx : 0;

        const isRadio = track.kind === 'radio';
        this.setState({
            track,
            currentTime: 0,
            duration: 0,
            loading: true,
        });
        a.src = track.url;
        a.load();
        // Las radios no exponen duración fiable; las pistas sí.
        if (isRadio) this.setState({ duration: 0 });
        void a.play().catch(() => {
            this.setState({ loading: false, playing: false });
        });
    }

    play() {
        const a = this.audio;
        if (!a || !this.state.track) return;
        void a.play().catch(() => this.setState({ playing: false }));
    }

    pause() {
        const a = this.audio;
        if (!a) return;
        a.pause();
    }

    toggle() {
        if (this.state.playing) this.pause();
        else this.play();
    }

    next() {
        if (!this.queue.length) return;
        const nextIdx = this.index + 1;
        if (nextIdx < this.queue.length) {
            this.playTrack(this.queue[nextIdx], this.queue);
        }
    }

    prev() {
        if (!this.queue.length) return;
        const a = this.audio;
        // Si llevamos >3s, "prev" reinicia la pista actual (UX clásica).
        if (a && this.state.currentTime > 3 && this.state.track?.kind !== 'radio') {
            a.currentTime = 0;
            return;
        }
        const prevIdx = this.index - 1;
        if (prevIdx >= 0) {
            this.playTrack(this.queue[prevIdx], this.queue);
        } else if (a) {
            a.currentTime = 0;
        }
    }

    seek(sec: number) {
        const a = this.audio;
        if (!a) return;
        const d = this.state.duration;
        if (!Number.isFinite(d) || d <= 0) return; // streams en vivo: no-op
        a.currentTime = Math.max(0, Math.min(d, sec));
        this.setState({ currentTime: a.currentTime });
    }

    setVolume(v: number) {
        const clamped = Math.max(0, Math.min(1, v));
        const a = this.ensureAudio();
        if (a) a.volume = clamped;
        this.setState({ volume: clamped });
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(VOLUME_KEY, String(clamped));
            } catch {
                /* almacenamiento no disponible: ignorar */
            }
        }
    }
}

// Singleton de módulo (un único motor para todo el OS en el cliente).
const engine = new MediaEngine();

export function getMediaEngine(): MediaEngine {
    return engine;
}

// Importación perezosa de React solo dentro del hook para mantener este
// módulo utilizable como utilidad pura si se necesitara.
import { useSyncExternalStore } from 'react';

export interface MediaPlayerApi {
    state: MediaState;
    playTrack: (track: MediaTrack, queue?: MediaTrack[]) => void;
    toggle: () => void;
    pause: () => void;
    play: () => void;
    next: () => void;
    prev: () => void;
    seek: (sec: number) => void;
    setVolume: (v: number) => void;
}

export function useMediaPlayer(): MediaPlayerApi {
    const state = useSyncExternalStore(
        engine.subscribe,
        engine.getSnapshot,
        engine.getServerSnapshot,
    );

    return {
        state,
        playTrack: (track, queue) => engine.playTrack(track, queue),
        toggle: () => engine.toggle(),
        pause: () => engine.pause(),
        play: () => engine.play(),
        next: () => engine.next(),
        prev: () => engine.prev(),
        seek: (sec) => engine.seek(sec),
        setVolume: (v) => engine.setVolume(v),
    };
}
