// ════════════════════════════════════════════════════════════════
// StarSeed OS — Listas de comandos instalables (Librería · Comandos)
// ----------------------------------------------------------------
// Datos PUROS (sin React). Una "lista de comandos" es una secuencia
// corta de acciones REALES del OS que se ejecuta en orden:
//   • navigate  → router.push(target)                (ruta interna)
//   • event     → window.dispatchEvent(CustomEvent)  (señal global)
//   • open-app  → app del ecosistema (URL externa en pestaña nueva,
//                 o ruta interna si target no es http).
//
// TODOS los targets son reales y verificados en el repo:
//   rutas: /escritorios /dashboard /omnifrecuencias /hub?tab=red
//          /decisiones /pizarra /atmosphere /immersive /nexus
//   eventos: starseed:open-aurora-exocortex · starseed:toggle-fullscreen
//            starseed:open-omnifrecuencias (OmniAppHost, montado global)
// ════════════════════════════════════════════════════════════════

export type CommandAction = "navigate" | "event" | "open-app";

export interface CommandStep {
    /** Descripción humana del paso. */
    label: string;
    action: CommandAction;
    /** Ruta, nombre de evento o URL según `action`. */
    target: string;
    /** Payload opcional del CustomEvent (solo action:"event"). */
    detail?: Record<string, unknown>;
}

export interface CommandListListing {
    id: string;
    name: string;
    desc: string;
    /** Nombre de icono lucide (lo mapea la Librería; con fallback). */
    icon?: string;
    /** Acento hex para la tarjeta. */
    accent?: string;
    commands: CommandStep[];
}

export const COMMAND_LIST_LISTINGS: CommandListListing[] = [
    {
        id: "arranque-rapido",
        name: "Arranque rápido",
        desc: "Abre tus escritorios, invoca el Exocórtex de Aurora y pasa a pantalla completa. Tu sesión lista en tres pasos.",
        icon: "Zap",
        accent: "#FFBF00",
        commands: [
            { label: "Abrir Escritorios", action: "navigate", target: "/escritorios" },
            { label: "Invocar el Exocórtex de Aurora", action: "event", target: "starseed:open-aurora-exocortex" },
            { label: "Pantalla completa", action: "event", target: "starseed:toggle-fullscreen" },
        ],
    },
    {
        id: "estudio-sonido",
        name: "Estudio de sonido",
        desc: "Monta tu cabina: estudio Omnifrecuencias, panel con los widgets de Música y Radio en vivo, y la ventana flotante de frecuencias encima.",
        icon: "Waves",
        accent: "#22D3EE",
        commands: [
            { label: "Abrir el estudio Omnifrecuencias", action: "navigate", target: "/omnifrecuencias" },
            { label: "Panel con Música y Radio en vivo", action: "navigate", target: "/dashboard" },
            { label: "Omnifrecuencias en ventana flotante", action: "event", target: "starseed:open-omnifrecuencias" },
        ],
    },
    {
        id: "sesion-civica",
        name: "Sesión cívica",
        desc: "Del mapa de la red al voto: revisa los nodos y entidades federativas y aterriza en el centro de decisiones.",
        icon: "Vote",
        accent: "#DC143C",
        commands: [
            { label: "Red de nodos y entidades", action: "navigate", target: "/hub?tab=red" },
            { label: "Centro de decisiones", action: "navigate", target: "/decisiones" },
        ],
    },
    {
        id: "foco-creativo",
        name: "Foco creativo",
        desc: "Pizarra abierta y pantalla completa sin distracciones. Modo génesis.",
        icon: "PenLine",
        accent: "#39FF14",
        commands: [
            { label: "Abrir la Pizarra", action: "navigate", target: "/pizarra" },
            { label: "Pantalla completa sin distracciones", action: "event", target: "starseed:toggle-fullscreen" },
        ],
    },
    {
        id: "viaje-inmersivo",
        name: "Viaje inmersivo",
        desc: "Clima espacial en vivo y salto al Espacio Inmersivo (WebXR) a pantalla completa.",
        icon: "Orbit",
        accent: "#A855F7",
        commands: [
            { label: "Clima espacial en vivo", action: "navigate", target: "/atmosphere" },
            { label: "Entrar al Espacio Inmersivo", action: "navigate", target: "/immersive" },
            { label: "Pantalla completa", action: "event", target: "starseed:toggle-fullscreen" },
        ],
    },
    {
        id: "salto-ecosistema",
        name: "Salto al ecosistema",
        desc: "Audiomorphic VR completo en una pestaña (el primer paso se ejecuta al instante para que el navegador no lo bloquee) y el portal Nexus dentro del OS.",
        icon: "Rocket",
        accent: "#007FFF",
        commands: [
            { label: "Audiomorphic VR completo (pestaña nueva)", action: "open-app", target: "https://audiomorphic.vercel.app/?starseed_os=1&full=1" },
            { label: "Portal StarSeed Nexus (web oficial)", action: "open-app", target: "https://starseed-nexus.vercel.app" },
        ],
    },
];
