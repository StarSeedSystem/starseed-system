// ════════════════════════════════════════════════════════════════
// Catálogo de Apps StarSeed — fuente única de verdad del launcher
// ----------------------------------------------------------------
// Apps de marca StarSeed, módulos nativos del SOSD y apps utilitarias.
// La estrategia de apertura se decide POR APP (CSP/embebibilidad reales).
// URLs canónicas: ~/Documents/StarSeed Ecosistema/MANUAL DE ENLACES…
// SOP: architecture/dashboard-launcher-apps-y-archivos.md
// ════════════════════════════════════════════════════════════════

import {
    Globe, Coffee, AudioWaveform, Radio, MessageSquare, Network,
    Library, BrainCircuit, CloudSun, Music, Waves,
} from "lucide-react";
import type { StarseedApp, LauncherCollection } from "./launcher-types";

export const APP_CATALOG: StarseedApp[] = [
    // ── Apps de marca StarSeed ───────────────────────────────────
    {
        id: "nexus",
        name: "StarSeed Nexus",
        short: "Nexus",
        description: "Portal del ecosistema: las 6 áreas + Audiomorphic bajo una cuenta soberana.",
        icon: Globe,
        iconUrl: "/app-icons/nexus.png",
        accent: "#39FF14",
        category: "starseed",
        status: "live",
        open: {
            primary: "route",
            allowed: ["route", "window", "tab"],
            route: "/nexus",
            href: "https://starseed-nexus.vercel.app",
            embeddable: true,
        },
    },
    {
        id: "cafe",
        name: "StarSeed Café",
        short: "Café",
        description: "Menú vivo, Alquimista 3D, Exocórtex de mesa y economía de Granos.",
        icon: Coffee,
        iconUrl: "/app-icons/cafe.png",
        accent: "#D4AF37",
        category: "starseed",
        status: "live",
        open: {
            primary: "window",
            allowed: ["window", "tab", "popup"],
            href: "https://starseed-nexus.vercel.app/cafe/",
            embeddable: true,
        },
    },
    {
        id: "audiomorphic",
        name: "Audiomorphic VR",
        short: "Audiomorphic",
        description: "Visualizador de consciencia: audio → geometría sagrada. Gratis dentro del OS.",
        icon: AudioWaveform,
        iconUrl: "/app-icons/audiomorphic.png",
        accent: "#A855F7",
        category: "starseed",
        status: "live",
        vrCapable: true,
        open: {
            primary: "window",
            allowed: ["window", "tab", "popup", "embed"],
            // ?starseed_os=1&full=1 → señal para desbloquear la VERSIÓN COMPLETA al
            // usarse incrustado dentro del OS con sesión (la app lo detecta).
            href: "https://audiomorphic.vercel.app/?starseed_os=1&full=1",
            embeddable: true, // ya se embebe como fondo del OS → framing permitido
        },
    },
    {
        id: "omnifrecuencias",
        name: "Omnifrecuencias",
        short: "Omni",
        description: "Estudio de frecuencias funcionales: multi-tono, binaural, isocrónico, presets en tu biblioteca.",
        icon: Waves,
        iconUrl: "/app-icons/omnifrecuencias.png",
        accent: "#22D3EE",
        category: "starseed",
        status: "native",
        open: {
            primary: "route",
            allowed: ["route", "window", "tab"],
            route: "/omnifrecuencias",
        },
    },

    // ── Módulos nativos del sistema ──────────────────────────────
    {
        id: "messages",
        name: "Mensajes",
        short: "Mensajes",
        description: "Uplink neural de comunicación e inteligencia.",
        icon: MessageSquare,
        iconUrl: "/app-icons/messages.png",
        accent: "#007FFF",
        category: "sistema",
        status: "native",
        open: { primary: "route", allowed: ["route", "tab"], route: "/messages" },
    },
    {
        id: "network",
        name: "Red",
        short: "Red",
        description: "Áreas de la Red: Política, Cultura, Educación y topología viva.",
        icon: Network,
        iconUrl: "/app-icons/network.png",
        accent: "#10B981",
        category: "sistema",
        status: "native",
        open: { primary: "route", allowed: ["route", "tab"], route: "/network" },
    },
    {
        id: "library",
        name: "Biblioteca",
        short: "Biblioteca",
        description: "Guarda, instala y organiza apps, archivos y entidades.",
        icon: Library,
        iconUrl: "/app-icons/library.png",
        accent: "#FFBF00",
        category: "sistema",
        status: "native",
        open: { primary: "route", allowed: ["route", "tab"], route: "/library" },
    },
    {
        id: "agent",
        name: "Exocórtex",
        short: "Exocórtex",
        description: "Tu IA personal (Astraura). Propiedad del usuario, lealtad al usuario.",
        icon: BrainCircuit,
        iconUrl: "/app-icons/agent.png",
        accent: "#6366F1",
        category: "sistema",
        status: "native",
        open: { primary: "route", allowed: ["route", "tab"], route: "/agent" },
    },

    // ── Apps utilitarias / media ─────────────────────────────────
    {
        id: "clima",
        name: "Clima",
        short: "Clima",
        description: "Atmósfera terrestre y espacial: telemetría viva y vista ampliada.",
        icon: CloudSun,
        iconUrl: "/app-icons/clima.png",
        accent: "#38BDF8",
        category: "utilidad",
        status: "native",
        open: { primary: "route", allowed: ["route", "tab"], route: "/atmosphere" },
    },
    {
        id: "musica",
        name: "Música",
        short: "Música",
        description: "Reproductor con biblioteca, listas y playback. Control en el menú Trinidad.",
        icon: Music,
        iconUrl: "/app-icons/musica.png",
        accent: "#F472B6",
        category: "media",
        status: "soon", // player estilo Spotify en Fase 2
        open: { primary: "window", allowed: ["window", "route"] },
    },
    {
        id: "radio",
        name: "Radio en vivo",
        short: "Radio",
        description: "Emisoras y streaming en directo con ajustes de salida de medios.",
        icon: Radio,
        iconUrl: "/app-icons/radio.png",
        accent: "#FB923C",
        category: "media",
        status: "soon", // streaming en Fase 2
        open: { primary: "window", allowed: ["window", "tab"] },
    },
];

const CATALOG_INDEX: Record<string, StarseedApp> = Object.fromEntries(
    APP_CATALOG.map((a) => [a.id, a])
);

export function getApp(id: string): StarseedApp | undefined {
    return CATALOG_INDEX[id];
}

/** Colecciones predeterminadas (presets de origen de una carpeta). */
export const APP_COLLECTIONS: Record<LauncherCollection, string[]> = {
    // 'starseed' = carpeta de inicio por defecto (marca + módulos clave)
    starseed: ["nexus", "cafe", "audiomorphic", "omnifrecuencias", "messages", "network", "musica", "clima"],
    sistema: ["messages", "network", "library", "agent"],
    media: ["musica", "radio", "omnifrecuencias", "audiomorphic"],
    custom: [],
};

/** Resuelve la lista de apps de una carpeta: ids explícitos o, si vacío, la colección. */
export function resolveApps(appIds: string[] | undefined, collection?: LauncherCollection): StarseedApp[] {
    const ids = appIds && appIds.length > 0 ? appIds : APP_COLLECTIONS[collection ?? "starseed"];
    return ids.map(getApp).filter((a): a is StarseedApp => Boolean(a));
}
