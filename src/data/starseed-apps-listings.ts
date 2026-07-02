// ════════════════════════════════════════════════════════════════
// StarSeed OS — Apps del ecosistema StarSeed (listados publicables)
// ----------------------------------------------------------------
// Datos PUROS (sin React) para que la Librería publique las apps
// oficiales del ecosistema como Entidades Únicas con ficha rica.
// Fuente de verdad de URLs: catálogo del launcher (app-catalog.ts),
// CLAUDE.md §1 y el manual de enlaces del Ecosistema.
//
// También define los PRIMITIVOS de listado extendido (versiones,
// media, enlaces) que consume la ficha `AppFilePage` — tolerantes a
// faltantes: toda ficha funciona sin ellos.
// ════════════════════════════════════════════════════════════════

/** Elemento multimedia de una ficha (galería). */
export interface ListingMediaItem {
    type: "image" | "video" | "audio";
    url: string;
    caption?: string;
}

/** Versión publicada de un listado (historial). */
export interface ListingVersion {
    /** Etiqueta de la versión (p. ej. "2026.07.01"). */
    version: string;
    /** Fecha ISO o legible de la publicación. */
    date: string;
    /** Notas de la versión. */
    notes?: string;
    /** URL de descarga/apertura de ESTA versión (si existe). */
    url?: string;
}

/** Enlace externo de una ficha (web, repo, releases…). */
export interface ListingLink {
    label: string;
    url: string;
}

/** App oficial del ecosistema StarSeed, publicable en la Librería. */
export interface StarSeedAppListing {
    id: string;
    name: string;
    /** Frase corta para tarjetas. */
    tagline: string;
    /** Descripción larga para la ficha. */
    description: string;
    /** Icono en /public (solo si el archivo existe de verdad). */
    iconUrl?: string;
    /** Color de acento de la marca (hex). */
    accent: string;
    author: string;
    /** URL pública (despliegue en vivo), si la app vive fuera del OS. */
    web?: string;
    /** Ruta interna del OS, si la app vive dentro. */
    route?: string;
    /** Repositorio de código abierto. */
    repo?: string;
    /** Build/versión actual conocida. */
    build?: string;
    /** ¿Instalable como PWA? */
    pwa?: boolean;
    tags: string[];
    media?: ListingMediaItem[];
    links?: ListingLink[];
    versions?: ListingVersion[];
}

export const STARSEED_APP_LISTINGS: StarSeedAppListing[] = [
    {
        id: "starseed-os",
        name: "StarSeed OS",
        tagline: "El Sistema Operativo Social Descentralizado (SOSD).",
        description:
            "Sistema operativo social abierto: gobernanza directa, librería universal, escritorios, exocórtex personal y ecosistemas político, educativo y cultural bajo una identidad soberana. Instalable como PWA en Android, iOS y escritorio.",
        iconUrl: "/starseed-symbol-192.png",
        accent: "#007FFF",
        author: "StarSeedSystem",
        web: "https://starseed-os.vercel.app",
        repo: "https://github.com/StarSeedSystem/starseed-system",
        build: "2026.07.01",
        pwa: true,
        tags: ["os", "pwa", "soberanía", "código abierto"],
        links: [
            { label: "Web oficial", url: "https://starseed-os.vercel.app" },
            { label: "Código fuente (GitHub)", url: "https://github.com/StarSeedSystem/starseed-system" },
            { label: "Releases", url: "https://github.com/StarSeedSystem/starseed-system/releases" },
        ],
        versions: [
            {
                version: "2026.07.01",
                date: "2026-07-01",
                notes: "Build en producción en starseed-os.vercel.app. Instalable como app (PWA) desde el navegador; código y releases en GitHub.",
                url: "https://starseed-os.vercel.app",
            },
        ],
    },
    {
        id: "nexus",
        name: "StarSeed Nexus",
        tagline: "Portal del ecosistema bajo una cuenta soberana.",
        description:
            "Portal de marca del ecosistema StarSeed: las áreas (Inicio, Sociedad, Cafetería, Aplicaciones, Estudio) y Audiomorphic bajo la misma cuenta soberana que el OS.",
        iconUrl: "/app-icons/nexus.png",
        accent: "#39FF14",
        author: "StarSeed",
        web: "https://starseed-nexus.vercel.app",
        tags: ["portal", "ecosistema"],
        links: [{ label: "Web oficial", url: "https://starseed-nexus.vercel.app" }],
    },
    {
        id: "cafe",
        name: "StarSeed Café",
        tagline: "Menú vivo, Alquimista 3D y economía de Granos.",
        description:
            "La cafetería del ecosistema: menú vivo de elixires, Alquimista 3D, Exocórtex de mesa y economía de Granos. Puerta física y digital a la comunidad StarSeed.",
        iconUrl: "/app-icons/cafe.png",
        accent: "#D4AF37",
        author: "StarSeed",
        web: "https://starseed-cafe.vercel.app",
        tags: ["cafetería", "comunidad"],
        links: [{ label: "Web oficial", url: "https://starseed-cafe.vercel.app" }],
    },
    {
        id: "audiomorphic",
        name: "Audiomorphic VR",
        tagline: "Audio → geometría sagrada, en VR.",
        description:
            "Visualizador de consciencia: convierte el audio en geometría sagrada viva. Compatible con VR (WebXR). La versión completa se desbloquea gratis al usarse dentro del OS con sesión.",
        iconUrl: "/app-icons/audiomorphic.png",
        accent: "#A855F7",
        author: "StarSeed",
        web: "https://audiomorphic.vercel.app",
        tags: ["audio", "vr", "visualizador"],
        links: [{ label: "Web oficial", url: "https://audiomorphic.vercel.app" }],
    },
    {
        id: "omnifrecuencias",
        name: "Omnifrecuencias",
        tagline: "Estudio de frecuencias funcionales.",
        description:
            "Estudio de frecuencias funcionales dentro del OS: multi-tono, binaural, isocrónico y presets guardables en tu biblioteca. También se abre como ventana flotante desde el panel.",
        iconUrl: "/app-icons/omnifrecuencias.png",
        accent: "#22D3EE",
        author: "StarSeed",
        route: "/omnifrecuencias",
        tags: ["audio", "frecuencias", "bienestar"],
    },
    {
        id: "immersive",
        name: "Espacio Inmersivo",
        tagline: "Geometría sagrada y portales 3D (WebXR).",
        description:
            "Espacio VR/AR nativo del OS (WebXR): geometría sagrada y portales 3D hacia las apps StarSeed. El modo XR del sistema se activa contextualmente aquí.",
        accent: "#A855F7",
        author: "StarSeed",
        route: "/immersive",
        tags: ["vr", "ar", "webxr", "3d"],
    },
    {
        id: "clima",
        name: "Clima Espacial",
        tagline: "Atmósfera terrestre y espacial en vivo.",
        description:
            "Telemetría viva de la atmósfera terrestre y del clima espacial, con vista ampliada. También disponible como widget y recordatorios en el panel.",
        iconUrl: "/app-icons/clima.png",
        accent: "#38BDF8",
        author: "StarSeed",
        route: "/atmosphere",
        tags: ["clima", "espacio", "telemetría"],
    },
];
