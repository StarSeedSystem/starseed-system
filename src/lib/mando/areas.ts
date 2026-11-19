// src/lib/mando/areas.ts
// -----------------------------------------------------------------------------
// Áreas de trabajo del OS (Ola 231 · Genesis): el índice vivo del
// proyecto — por dónde se trabaja, con qué documentos de memoria y qué olas
// tocaron cada zona. Lo muestra `panel-areas.tsx` en Genesis.
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

/** Configuración de la guía de usuario en un área. */
export interface GuiaConfig {
    timeoutMs?: number;
    requiereInteraccion?: boolean;
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
    /** Configuración de la guía para esta área. */
    guia?: GuiaConfig;
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
        olas: ["227", "231"],
        guia: { requiereInteraccion: true },
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
        olas: ["153", "155", "158", "231"],
        guia: { requiereInteraccion: true },
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

/**
 * Mensajes del panel de áreas con su TONO, para que un fallo no se lea como un
 * detalle y cada aviso diga qué pasó, qué implica y por dónde seguir.
 * `CLASES_MENSAJE` da al panel la tinta clara sobre fondo profundo y el borde
 * visible; nunca solo color: cada mensaje lleva título y texto.
 */
export type TonoMensaje = "error" | "aviso" | "exito";

export interface MensajeArea {
    tono: TonoMensaje;
    titulo: string;
    texto: string;
}

/** Clases de contraste por tono (claves completas para que el JIT las vea). */
export const CLASES_MENSAJE: Record<TonoMensaje, string> = {
    error: "rounded-lg border border-red-400/50 bg-red-950/60 p-2.5 text-xs font-medium text-red-100",
    aviso: "rounded-lg border border-amber-400/40 bg-amber-950/40 p-2.5 text-xs text-amber-100",
    exito: "rounded-lg border border-emerald-400/40 bg-emerald-950/40 p-2.5 text-xs text-emerald-100",
};

/** Qué lectura del panel falló: la actividad del relevo o los permisos. */
export type RecursoPanelAreas = "eventos" | "permisos";

/**
 * Fallo de lectura del panel: distingue un error de red de un permiso
 * denegado y nombra la salida concreta, sin culpar al usuario.
 */
export function mensajeFalloCarga(recurso: RecursoPanelAreas): MensajeArea {
    if (recurso === "eventos") {
        return {
            tono: "error",
            titulo: "No pude leer la actividad del relevo",
            texto:
                "Las áreas siguen mostrando sus accesos y memorias; lo único que falta es la última actividad. " +
                "Pulsa «Actualizar» en unos segundos y, si sigue vacío, revisa que Genesis tenga red.",
        };
    }
    return {
        tono: "error",
        titulo: "No pude consultar los permisos del navegador",
        texto:
            "Esto no es un permiso denegado: el panel no supo leerlo, así que no afirma nada sobre lo concedido. " +
            "Ábrelos desde el enlace de cada permiso (Privacidad, Notificaciones o Almacenes) y concédelos ahí si te faltan.",
    };
}

/**
 * Estado sin actividad de un área: en vez del vacío seco, nombra el área y
 * señala su primer acceso y su primer documento para saber por dónde seguir.
 */
export function mensajeSinActividad(area: AreaTrabajo): MensajeArea {
    const acceso = area.rutas[0];
    const memoria = area.documentos[0];
    const guia =
        acceso && memoria
            ? `abre «${acceso.etiqueta}» y sigue el hilo en ${memoria}`
            : acceso
              ? `abre «${acceso.etiqueta}»`
              : memoria
                ? `sigue el hilo en ${memoria}`
                : "revisa sus memorias para ver por dónde va";
    return {
        tono: "aviso",
        titulo: `Sin actividad reciente en ${area.nombre}`,
        texto: `Ningún evento del relevo ha tocado esta área en la sesión: ${guia}.`,
    };
}
