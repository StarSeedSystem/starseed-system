'use client';

// ════════════════════════════════════════════════════════════════
// media-catalog — Catálogo de muestra para el Media Center
// ----------------------------------------------------------------
// Fuentes REALES y libres:
//  • SAMPLE_TRACKS  → SoundHelix (mp3 de demostración, libres de uso).
//  • RADIO_STATIONS → SomaFM (streams públicos por comunidad).
//  • FREQUENCY_PRESETS → frecuencias funcionales (Solfeggio + Schumann),
//    sintetizadas en el navegador por el widget de Omnifrecuencias.
//
// Los títulos/artistas de las pistas son coherentes con la estética
// StarSeed (cyberdelia / cristal líquido), inventados para la demo.
// ════════════════════════════════════════════════════════════════

import type { MediaTrack } from './media-engine';

export const SAMPLE_TRACKS: MediaTrack[] = [
    {
        id: 'sh-1',
        title: 'Deriva Astral',
        artist: 'Núcleo Onírico',
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        kind: 'music',
    },
    {
        id: 'sh-2',
        title: 'Geometría Líquida',
        artist: 'Velo Prisma',
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        kind: 'music',
    },
    {
        id: 'sh-3',
        title: 'Mitosis Solar',
        artist: 'Corriente Semilla',
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
        kind: 'music',
    },
    {
        id: 'sh-4',
        title: 'Exocórtex (Sueño Lúcido)',
        artist: 'Astraura',
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
        kind: 'music',
    },
    {
        id: 'sh-5',
        title: 'Cosecha de Luz',
        artist: 'Oikos Coral',
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
        kind: 'music',
    },
];

export const RADIO_STATIONS: MediaTrack[] = [
    {
        id: 'soma-groovesalad',
        title: 'Groove Salad',
        artist: 'Ambient · Downtempo',
        url: 'https://ice1.somafm.com/groovesalad-128-mp3',
        kind: 'radio',
    },
    {
        id: 'soma-dronezone',
        title: 'Drone Zone',
        artist: 'Atmospheric · Space',
        url: 'https://ice1.somafm.com/dronezone-128-mp3',
        kind: 'radio',
    },
    {
        id: 'soma-spacestation',
        title: 'Space Station Soma',
        artist: 'Space · Mid-tempo',
        url: 'https://ice1.somafm.com/spacestation-128-mp3',
        kind: 'radio',
    },
    {
        id: 'soma-deepspaceone',
        title: 'Deep Space One',
        artist: 'Deep Ambient · Experimental',
        url: 'https://ice1.somafm.com/deepspaceone-128-mp3',
        kind: 'radio',
    },
];

export interface FrequencyPreset {
    id: string;
    label: string;
    hz: number;
    desc: string;
    /** Si está definido, se generan dos osciladores (L/R) con esta diferencia
     *  de frecuencia para inducir un latido binaural (binaural beat). */
    binauralBeat?: number;
}

export const FREQUENCY_PRESETS: FrequencyPreset[] = [
    { id: 'f-396', label: '396 Hz', hz: 396, desc: 'Liberar miedo y culpa' },
    { id: 'f-432', label: '432 Hz', hz: 432, desc: 'Afinación natural' },
    { id: 'f-528', label: '528 Hz', hz: 528, desc: 'Reparación / ADN' },
    { id: 'f-639', label: '639 Hz', hz: 639, desc: 'Conexión y vínculos' },
    { id: 'f-741', label: '741 Hz', hz: 741, desc: 'Expresión y soluciones' },
    { id: 'f-852', label: '852 Hz', hz: 852, desc: 'Intuición y retorno' },
    {
        id: 'f-schumann',
        label: 'Schumann 7.83',
        hz: 200,
        desc: 'Resonancia Schumann',
        binauralBeat: 7.83,
    },
];
