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
import { OS_VERSION, OS_FECHA, OS_NOTAS } from "@/lib/version/os-release";

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
        build: OS_VERSION,
        pwa: true,
        tags: ["os", "pwa", "soberanía", "código abierto", "ia 1.58-bit"],
        links: [
            { label: "Web oficial", url: "https://starseed-os.vercel.app" },
            { label: "Código fuente (GitHub)", url: "https://github.com/StarSeedSystem/starseed-system" },
            { label: "Releases", url: "https://github.com/StarSeedSystem/starseed-system/releases" },
        ],
        versions: [
            {
                version: OS_VERSION,
                date: OS_FECHA,
                notes: OS_NOTAS,
                url: "https://starseed-os.vercel.app",
            },
            {
                version: "2026.09.24",
                date: "2026-09-24",
                notes:
                    "Apps nativas 0.2.0 para macOS, Windows, Linux y Android con actualización automática inteligente (reinstalación completa dentro de la propia app); en iPhone/iPad, como app web instalable. El fondo animado ahora ajusta su calidad solo según el dispositivo. Nueva ventana de ajustes del chat de Astraura. El panel de Olas es honesto: solo marca «en curso» cuando hay agentes trabajando de verdad. La nube deja de repetir trabajo ya hecho.",
                url: "https://starseed-os.vercel.app",
            },
            {
                version: "2026.09.09",
                date: "2026-09-09",
                notes:
                    "Versión que unifica la versión del sistema en una sola fuente de verdad, para que el instalador muestre la misma información en todos los medios.",
                url: "https://starseed-os.vercel.app",
            },
            {
                version: "2026.08.23",
                date: "2026-08-23",
                notes:
                    "Astraura 1.58-bit pasa a ser el SISTEMA PRIMARIO de inteligencia del OS: motor ternario BitNet b1.58 nativo en tu propia neurona (sin nube), 10 personalidades y sus agentes con procesos imaginativos e intuitivos en segundo plano, Studio 1.58 con 13 secciones (imaginación, enjambre, director, sentidos, memoria, almacenamiento, proyectos, voz) y notificaciones especiales de esos procesos en el centro de avisos. Los demás sistemas (Ollama, WebLLM, OpenRouter :free, servidor StarSeed…) siguen operativos como secundarios y configurables por cerebro, personalidad o agente.",
                url: "https://starseed-os.vercel.app",
            },
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
    // (2026-09-25) Audiomorphic y Omnifrecuencias: se abren DENTRO del OS en su versión
    // oficial en línea (ruta propia → AppOficial) y se instalan desde su último release de
    // GitHub. La versión NO se escribe aquí: la lee en vivo `useUltimaVersion` (la barra de la
    // app dentro del OS y el diálogo de instalar la muestran), con respaldo en
    // src/lib/apps-oficiales/apps-oficiales.ts.
    // «Descargas» apunta a /releases/latest, que GitHub redirige siempre al último.
    {
        id: "audiomorphic",
        name: "Audiomorphic",
        tagline: "Visualizador matemático de audio, con realidad aumentada.",
        description:
            "Convierte el sonido en geometría matemática viva, en tiempo real, y la lleva a tu espacio con realidad aumentada (AR). 100% gratis. Úsala en línea desde su web oficial —dentro del OS se abre esa misma versión, siempre la última— o instala la app para Android, macOS, Windows o Linux desde el botón Instalar.",
        iconUrl: "/app-icons/audiomorphic.png",
        accent: "#A855F7",
        author: "StarSeedSystem",
        web: "https://audiomorphic.vercel.app",
        route: "/audiomorphic",
        repo: "https://github.com/StarSeedSystem/Audiomorphic-AR-app",
        tags: ["audio", "visualizador", "ar", "matemáticas", "gratis"],
        links: [
            { label: "Web oficial", url: "https://audiomorphic.vercel.app" },
            { label: "Código fuente (GitHub)", url: "https://github.com/StarSeedSystem/Audiomorphic-AR-app" },
            { label: "Descargas (última versión)", url: "https://github.com/StarSeedSystem/Audiomorphic-AR-app/releases/latest" },
        ],
    },
    {
        id: "omnifrecuencias",
        name: "Omnifrecuencias",
        tagline: "Generador y estudio de frecuencias funcionales.",
        description:
            "Estudio de frecuencias funcionales: multi-tono, binaural, isocrónico y presets guardables. Úsala en línea desde su web oficial —dentro del OS se abre esa misma versión, siempre la última— o instala la app para Android, macOS, Windows o Linux desde el botón Instalar. El widget compacto del panel sigue disponible.",
        iconUrl: "/app-icons/omnifrecuencias.png",
        accent: "#22D3EE",
        author: "StarSeedSystem",
        web: "https://omnifrecuencias.vercel.app",
        route: "/omnifrecuencias",
        repo: "https://github.com/StarSeedSystem/generador_frecuencias",
        tags: ["audio", "frecuencias", "bienestar", "gratis"],
        links: [
            { label: "Web oficial", url: "https://omnifrecuencias.vercel.app" },
            { label: "Código fuente (GitHub)", url: "https://github.com/StarSeedSystem/generador_frecuencias" },
            { label: "Descargas (última versión)", url: "https://github.com/StarSeedSystem/generador_frecuencias/releases/latest" },
        ],
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
