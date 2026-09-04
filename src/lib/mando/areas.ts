// src/lib/mando/areas.ts
// -----------------------------------------------------------------------------
// Áreas de trabajo del OS (Ola 231 · Centro de Mando): el índice vivo del
// proyecto — por dónde se trabaja, con qué documentos de memoria y qué olas
// tocaron cada zona. Lo muestra `panel-areas.tsx` en el Centro de Mando.
//
// Cada área reúne sus accesos directos (rutas internas o enlaces externos),
// los documentos que mandan sobre ella y las olas que la han tocado. Los
// colores son claves de `ACENTOS` (src/lib/ui/acentos.ts), resueltas en el
// panel con `clasesAcento` para que el JIT de Tailwind las vea.
//
// ⚠️ Jamás se listan claves ni rutas absolutas del disco: solo rutas de la
// app, rutas relativas del repo y nombres de documentos.
// -----------------------------------------------------------------------------

/** Un acceso directo de un área (ruta interna de la app o enlace externo). */
export interface AccesoArea {
    etiqueta: string;
    href: string;
}

/** Un área de trabajo del proyecto, con sus accesos, memorias y olas. */
export interface AreaTrabajo {
    id: string;
    nombre: string;
    descripcion: string;
    /** Clave de `ACENTOS` (azure, cyan, amber, lime, magenta, emerald, rose, indigo, crimson, violet). */
    color: string;
    rutas: AccesoArea[];
    /** Documentos de memoria que mandan sobre el área (rutas relativas del repo). */
    documentos: string[];
    /** Olas que han tocado el área. */
    olas: string[];
}

/**
 * Las áreas reales del OS. El orden es el de la rejilla del panel: de la
 * puerta de entrada (rito) al sistema nervioso (malla, nube, memoria).
 */
export const AREAS_TRABAJO: AreaTrabajo[] = [
    {
        id: "rito",
        nombre: "Rito y bienvenida",
        descripcion:
            "La puerta de entrada: rito guiado de alta, identidad, correos, permisos iniciales y primera neurona.",
        color: "violet",
        rutas: [{ etiqueta: "Bienvenida", href: "/bienvenida" }],
        documentos: ["memory/principles.md", "memory/glossary.md"],
        olas: ["227"],
    },
    {
        id: "voz",
        nombre: "Voz",
        descripcion:
            "Voces, personalidades sonoras y el daemon de voz local de Astraura (Kokoro, OpenVoice).",
        color: "cyan",
        rutas: [{ etiqueta: "Voces", href: "/voces" }],
        documentos: ["architecture/centro-creacion-sync-permisos.md"],
        olas: ["149"],
    },
    {
        id: "avatares",
        nombre: "Avatares y movimiento",
        descripcion:
            "Cuerpos digitales, presencia y movimiento en el mundo: avatares vivos del usuario y de la red.",
        color: "rose",
        rutas: [{ etiqueta: "Mundo de avatares", href: "/mundo-avatares" }],
        documentos: ["memory/principles.md"],
        olas: ["215"],
    },
    {
        id: "laboratorio",
        nombre: "Laboratorio de la IA",
        descripcion:
            "Banco de pruebas de modelos: comparativas, benchmarks y jugueteo controlado con motores.",
        color: "lime",
        rutas: [{ etiqueta: "Laboratorio", href: "/laboratorio" }],
        documentos: ["memory/laboratorio-astraura.md"],
        olas: ["218"],
    },
    {
        id: "astraura",
        nombre: "Astraura y agentes",
        descripcion:
            "El sistema primario de inteligencia: router gratis-primero, neuronas, personalidades y el Studio 1.58.",
        color: "magenta",
        rutas: [{ etiqueta: "Agentes y Astraura", href: "/agent" }],
        documentos: [
            "architecture/astraura-inteligencia.md",
            "architecture/astraura-158-sistema-primario.md",
            "memory/orquestacion-economica.md",
        ],
        olas: ["153", "155", "158"],
    },
    {
        id: "social",
        nombre: "Social y perfiles",
        descripcion:
            "La red social: feed, publicaciones, gobernanza, comunidades y perfiles públicos de la cuenta.",
        color: "azure",
        rutas: [
            { etiqueta: "Red", href: "/network" },
            { etiqueta: "Perfil", href: "/profile" },
        ],
        documentos: ["memory/principles.md", "memory/roadmap.md"],
        olas: ["201"],
    },
    {
        id: "creacion",
        nombre: "Creación",
        descripcion:
            "El Centro de Creación Trinity: publicar, páginas, tienda y el lienzo universal de entidades únicas.",
        color: "amber",
        rutas: [{ etiqueta: "Crear", href: "/crear" }],
        documentos: ["architecture/centro-creacion-sync-permisos.md"],
        olas: ["63"],
    },
    {
        id: "biblioteca",
        nombre: "Biblioteca",
        descripcion:
            "Biblioteca universal y paquetes instalables (apps, temas, voces) con sincronización en vivo.",
        color: "emerald",
        rutas: [{ etiqueta: "Biblioteca", href: "/library" }],
        documentos: ["architecture/centro-creacion-sync-permisos.md"],
        olas: ["63"],
    },
    {
        id: "conexiones",
        nombre: "Conexiones y malla",
        descripcion:
            "La red sináptica: malla LoRa/Meshtastic, señales, relés y federación de topologías entre neuronas.",
        color: "indigo",
        rutas: [
            { etiqueta: "Red mesh", href: "/red-mesh" },
            { etiqueta: "Señales", href: "/senales" },
        ],
        documentos: ["architecture/astraura-mesh-meshtastic.md"],
        olas: ["97", "98", "99"],
    },
    {
        id: "nube",
        nombre: "Nube y despliegue",
        descripcion:
            "Publicación y operación: Vercel (auto-deploy desde GitHub) y Cloud Run como alternativa soberana.",
        color: "crimson",
        rutas: [
            { etiqueta: "Panel de Vercel", href: "https://vercel.com" },
            { etiqueta: "Consola de Cloud Run", href: "https://console.cloud.google.com/run" },
        ],
        documentos: ["DESPLIEGUE.md", "memory/architecture.md"],
        olas: ["214"],
    },
    {
        id: "memoria",
        nombre: "Memoria del proyecto",
        descripcion:
            "La memoria viva: adendas, roadmap, glosario y el memory root portátil que comparten todos los agentes.",
        color: "violet",
        rutas: [{ etiqueta: "Memorias", href: "/memorias" }],
        documentos: [
            "memory/state.md",
            "memory/roadmap.md",
            "memory/architecture.md",
            "starseed_memory_root/index.md",
        ],
        olas: ["219", "231"],
    },
];

/**
 * Claves de memoria locales del OS (localStorage / IndexedDB) que la tarjeta
 * «Memorias y permisos» enumera. Solo el nombre de la clave y su propósito;
 * jamás su contenido.
 */
export interface ClaveMemoria {
    clave: string;
    proposito: string;
}

export const CLAVES_MEMORIA_OS: ClaveMemoria[] = [
    {
        clave: "starseed.dock.items.v2",
        proposito: "Configuración del OmniDock (iconos, orden, carpetas).",
    },
    {
        clave: "starseed.astraura.primary-system.v1",
        proposito: "Sistema primario de inteligencia por agente / personalidad / cerebro.",
    },
    {
        clave: "starseed.astraura.neuron-persona.v1",
        proposito: "Sistemas configurados por neurona × personalidad.",
    },
    {
        clave: "starseed.astraura.routes.v1",
        proposito: "Bitácora de rutas del router de IA (qué fuente atendió cada petición).",
    },
];
