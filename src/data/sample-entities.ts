// src/data/sample-entities.ts
// ─────────────────────────────────────────────────────────────────────────────
// Dataset de EJEMPLO tipado y rico para demostrar la capacidad de páginas,
// perfiles, grupos, apps y archivos en línea dentro de cada uno de los tres
// ecosistemas funcionales de la Red StarSeed (Político, Educativo, Cultural).
//
// Todas las imágenes provienen de servicios LIBRES y fiables (nada de Drive):
//   · Avatares  → DiceBear 9.x  (https://api.dicebear.com/9.x/...)  · CC0
//   · Portadas  → Picsum semilla (https://picsum.photos/seed/<slug>/...) · libre
//   · Archivos de muestra públicos:
//       - PDF   → https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf
//       - Vídeo → https://www.w3schools.com/html/mov_bbb.mp4  (Big Buck Bunny, CC-BY 3.0, Blender Foundation)
//       - Audio → https://www.w3schools.com/html/horse.mp3
//
// El shape de SamplePost reutiliza intencionadamente `NormalizedPost` de
// `@/lib/social-posts`, de modo que pueda pasarse tal cual a <PostCard/>.
// ─────────────────────────────────────────────────────────────────────────────

import type { NormalizedPost, PostMediaKind } from "@/lib/social-posts";

/** Los tres ecosistemas funcionales de la Red. */
export type SystemKey = "politico" | "educativo" | "cultural";

// ── Helpers de imágenes libres ──

/** Avatar determinista vía DiceBear (sin almacenar datos personales). */
export function diceBearAvatar(
    seed: string,
    style:
        | "bottts-neutral"
        | "glass"
        | "shapes"
        | "thumbs"
        | "identicon"
        | "rings"
        | "lorelei" = "glass",
): string {
    return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

/** Portada temática determinista vía Picsum (Lorem Picsum, licencia libre). */
export function picsumCover(slug: string, w = 800, h = 400): string {
    return `https://picsum.photos/seed/${encodeURIComponent(slug)}/${w}/${h}`;
}

// URLs públicas de archivos de muestra reutilizables.
export const SAMPLE_PDF =
    "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
export const SAMPLE_VIDEO = "https://www.w3schools.com/html/mov_bbb.mp4";
export const SAMPLE_AUDIO = "https://www.w3schools.com/html/horse.mp3";

// ── Tipos del dataset ──

export interface SampleProfile {
    id: string;
    system: SystemKey;
    /** Faceta del perfil dentro de la dualidad Cuenta/Perfil del SOSD. */
    facet: "civico" | "artistico" | "educador" | "anonimo" | "profesional";
    name: string;
    handle: string;
    avatar: string;
    bio: string;
    /** Insignias / logros (Meritocracia del Entendimiento). */
    credentials: string[];
    accent: string;
    stats: { label: string; value: string }[];
    verified?: boolean;
}

export interface SamplePage {
    id: string;
    system: SystemKey;
    kind: "ley" | "curso" | "exposicion" | "comunidad" | "obra";
    title: string;
    cover: string;
    description: string;
    members: number;
    accent: string;
    /** Etiqueta de estado contextual (En votación, En curso, Abierta…). */
    status?: string;
    tags: string[];
}

export interface SampleGroup {
    id: string;
    system: SystemKey;
    kind: "asamblea" | "circulo" | "colectivo";
    name: string;
    cover: string;
    avatar: string;
    members: number;
    /** Resumen de actividad reciente (ej. "12 debates esta semana"). */
    activity: string;
    accent: string;
    description: string;
}

export interface SampleApp {
    id: string;
    system: SystemKey;
    name: string;
    /** Semilla de icono DiceBear (estilo bottts/shapes). */
    icon: string;
    description: string;
    category: string;
    accent: string;
    open: boolean;
}

export type SampleFileFormat =
    | "imagen"
    | "video"
    | "audio"
    | "pdf"
    | "enlace"
    | "app"
    | "dataset";

export interface SampleFile {
    id: string;
    system: SystemKey;
    format: SampleFileFormat;
    name: string;
    url: string;
    /** Vista previa (poster/thumbnail) cuando aplica. */
    thumb?: string;
    size?: string;
    /** Atribución / licencia cuando el recurso lo requiere. */
    license?: string;
    accent: string;
}

/** Reutiliza el shape exacto de PostCard + sistema de procedencia. */
export type SamplePost = NormalizedPost & { system: SystemKey };

// Acentos cromáticos por sistema (alineados con la paleta Trinity / oro StarSeed).
export const SYSTEM_ACCENT: Record<SystemKey, string> = {
    politico: "#DC143C", // System Crimson (Anchor / poder público)
    educativo: "#007FFF", // Electric Azure (Zenith / sabiduría)
    cultural: "#39FF14", // Neon Lime (Horizon / génesis creativa)
};

export const SYSTEM_LABEL: Record<SystemKey, string> = {
    politico: "Político",
    educativo: "Educativo",
    cultural: "Cultural",
};

// ─────────────────────────────────────────────────────────────────────────────
// PERFILES
// ─────────────────────────────────────────────────────────────────────────────

export const sampleProfiles: SampleProfile[] = [
    // ── Político ──
    {
        id: "prof-pol-1",
        system: "politico",
        facet: "civico",
        name: "Lucía Ferrán",
        handle: "@lucia.civica",
        avatar: diceBearAvatar("Lucia Ferran", "lorelei"),
        bio: "Facilitadora de asambleas. Defiendo el voto delegado líquido y la transparencia total en el ejercicio del poder público.",
        credentials: ["Mediadora certificada", "Delegada en Energía", "1.2k delegaciones"],
        accent: "#DC143C",
        verified: true,
        stats: [
            { label: "Propuestas", value: "47" },
            { label: "Delegaciones", value: "1.2k" },
            { label: "Reputación", value: "98%" },
        ],
    },
    {
        id: "prof-pol-2",
        system: "politico",
        facet: "profesional",
        name: "Néstor Aliaga",
        handle: "@nestor.legis",
        avatar: diceBearAvatar("Nestor Aliaga", "lorelei"),
        bio: "Analista de políticas públicas. Redacto borradores legislativos abiertos y auditables para la E.F. del Sur.",
        credentials: ["Insignia Legislativa", "Economía de procomún"],
        accent: "#DC143C",
        stats: [
            { label: "Leyes co-redactadas", value: "23" },
            { label: "Enmiendas", value: "310" },
            { label: "Reputación", value: "91%" },
        ],
    },
    {
        id: "prof-pol-3",
        system: "politico",
        facet: "anonimo",
        name: "Voz Soberana #4471",
        handle: "@anon.soberano",
        avatar: diceBearAvatar("anon-4471", "identicon"),
        bio: "Participante verificado por conocimiento cero. Una persona, una voz — sin revelar identidad civil.",
        credentials: ["Verificación ZK", "Voto activo"],
        accent: "#DC143C",
        stats: [
            { label: "Votos emitidos", value: "182" },
            { label: "Debates", value: "64" },
            { label: "Verificado", value: "ZK" },
        ],
    },

    // ── Educativo ──
    {
        id: "prof-edu-1",
        system: "educativo",
        facet: "educador",
        name: "Dra. Amara Sen",
        handle: "@amara.cosmos",
        avatar: diceBearAvatar("Amara Sen", "lorelei"),
        bio: "Astrofísica y mentora. Diseño rutas de aprendizaje inmersivo sobre cosmología y pensamiento sistémico.",
        credentials: ["Maestra del Entendimiento", "PhD Astrofísica", "Mentora híbrida IA+humano"],
        accent: "#007FFF",
        verified: true,
        stats: [
            { label: "Estudiantes", value: "8.4k" },
            { label: "Cursos", value: "12" },
            { label: "Valoración", value: "4.9" },
        ],
    },
    {
        id: "prof-edu-2",
        system: "educativo",
        facet: "profesional",
        name: "Kenji Mora",
        handle: "@kenji.bio",
        avatar: diceBearAvatar("Kenji Mora", "lorelei"),
        bio: "Bio-ingeniero. Comparto datasets abiertos y notebooks reproducibles sobre evolución simbiótica.",
        credentials: ["Insignia de Datos Abiertos", "Revisor de pares"],
        accent: "#007FFF",
        stats: [
            { label: "Recursos", value: "204" },
            { label: "Citas", value: "1.7k" },
            { label: "Valoración", value: "4.8" },
        ],
    },
    {
        id: "prof-edu-3",
        system: "educativo",
        facet: "anonimo",
        name: "Aprendiz Errante",
        handle: "@aprendiz.errante",
        avatar: diceBearAvatar("aprendiz-errante", "thumbs"),
        bio: "Autodidacta perpetuo. Documento mi viaje por la biblioteca universal sin foco en mi identidad.",
        credentials: ["Racha 365 días", "Curador comunitario"],
        accent: "#007FFF",
        stats: [
            { label: "Lecciones", value: "1.1k" },
            { label: "Notas públicas", value: "340" },
            { label: "Racha", value: "365d" },
        ],
    },

    // ── Cultural ──
    {
        id: "prof-cul-1",
        system: "cultural",
        facet: "artistico",
        name: "Nova Reyes",
        handle: "@nova.multiverso",
        avatar: diceBearAvatar("Nova Reyes", "lorelei"),
        bio: "Artista de medios sintéticos. Construyo escenas del Multiverso y experiencias audiovisuales cyberdélicas.",
        credentials: ["Insignia Génesis", "Residencia Horizon", "Curaduría Multiverso"],
        accent: "#39FF14",
        verified: true,
        stats: [
            { label: "Obras", value: "63" },
            { label: "Seguidores", value: "21k" },
            { label: "Remezclas", value: "412" },
        ],
    },
    {
        id: "prof-cul-2",
        system: "cultural",
        facet: "artistico",
        name: "Iris Bloom",
        handle: "@iris.sonora",
        avatar: diceBearAvatar("Iris Bloom", "lorelei"),
        bio: "Compositora de paisajes sonoros generativos. La música como puente empático entre comunidades.",
        credentials: ["Insignia Sonora", "Eventos físicos coordinados"],
        accent: "#39FF14",
        stats: [
            { label: "Pistas", value: "138" },
            { label: "Escuchas", value: "94k" },
            { label: "Eventos", value: "27" },
        ],
    },
    {
        id: "prof-cul-3",
        system: "cultural",
        facet: "anonimo",
        name: "Sombra Pixel",
        handle: "@sombra.pixel",
        avatar: diceBearAvatar("sombra-pixel", "bottts-neutral"),
        bio: "Colectivo de arte anónimo. Publicamos sin firma para que la obra hable por sí misma.",
        credentials: ["Arte anónimo", "Lienzo Universal"],
        accent: "#39FF14",
        stats: [
            { label: "Piezas", value: "89" },
            { label: "Forks", value: "256" },
            { label: "Galerías", value: "9" },
        ],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINAS
// ─────────────────────────────────────────────────────────────────────────────

export const samplePages: SamplePage[] = [
    // ── Político ──
    {
        id: "page-pol-1",
        system: "politico",
        kind: "ley",
        title: "Ley de Energía Procomún 2026",
        cover: picsumCover("ley-energia-procomun"),
        description:
            "Propuesta para declarar la red energética de las Sanghas como infraestructura procomún de acceso libre. En fase de votación líquida.",
        members: 4280,
        accent: "#DC143C",
        status: "En votación",
        tags: ["Energía", "Procomún", "Fase Fruto"],
    },
    {
        id: "page-pol-2",
        system: "politico",
        kind: "comunidad",
        title: "Mesa de Justicia Restaurativa",
        cover: picsumCover("justicia-restaurativa"),
        description:
            "Espacio de mediación comunitaria. Coordina Círculos de Paz en lugar de sanciones punitivas, según la Invariante de justicia restaurativa.",
        members: 612,
        accent: "#DC143C",
        status: "Abierta",
        tags: ["Mediación", "Círculos de Paz"],
    },

    // ── Educativo ──
    {
        id: "page-edu-1",
        system: "educativo",
        kind: "curso",
        title: "Cosmología para Sembradores",
        cover: picsumCover("cosmologia-sembradores"),
        description:
            "Ruta inmersiva de 8 módulos sobre el origen del universo, materia oscura y pensamiento sistémico. Mentoría híbrida humano + IA.",
        members: 8410,
        accent: "#007FFF",
        status: "En curso",
        tags: ["Astrofísica", "Inmersivo", "Mentoría"],
    },
    {
        id: "page-edu-2",
        system: "educativo",
        kind: "comunidad",
        title: "Biblioteca Universal — Nodo Sur",
        cover: picsumCover("biblioteca-universal-sur"),
        description:
            "Repositorio federado de conocimiento abierto. Todo recurso es una Entidad Única referenciada, nunca duplicada (Lienzo Universal).",
        members: 15230,
        accent: "#007FFF",
        status: "Abierta",
        tags: ["Open Access", "Federado"],
    },

    // ── Cultural ──
    {
        id: "page-cul-1",
        system: "cultural",
        kind: "exposicion",
        title: "Exposición: Aurora Sintética",
        cover: picsumCover("aurora-sintetica"),
        description:
            "Muestra colectiva de arte generativo en el Multiverso. Obras navegables en realidad virtual, remezclables bajo el Lienzo Universal.",
        members: 3120,
        accent: "#39FF14",
        status: "En cartel",
        tags: ["Multiverso", "Generativo", "VR"],
    },
    {
        id: "page-cul-2",
        system: "cultural",
        kind: "obra",
        title: "Obra Viva: Constelación Sonora",
        cover: picsumCover("constelacion-sonora"),
        description:
            "Composición colaborativa permanente. Cada participante añade una capa sonora; la obra evoluciona y se refleja en todas sus instancias.",
        members: 980,
        accent: "#39FF14",
        status: "Abierta",
        tags: ["Sonido", "Colaborativa", "Génesis"],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// GRUPOS
// ─────────────────────────────────────────────────────────────────────────────

export const sampleGroups: SampleGroup[] = [
    // ── Político ──
    {
        id: "grp-pol-1",
        system: "politico",
        kind: "asamblea",
        name: "Asamblea Local Oikos Norte",
        cover: picsumCover("asamblea-oikos-norte"),
        avatar: diceBearAvatar("Oikos Norte", "shapes"),
        members: 1840,
        activity: "18 debates · 4 votaciones esta semana",
        accent: "#DC143C",
        description:
            "Soberanía directa a escala de barrio. Decisiones de presupuesto participativo y gestión de recursos comunes.",
    },
    {
        id: "grp-pol-2",
        system: "politico",
        kind: "circulo",
        name: "Círculo de Delegados en Salud",
        cover: picsumCover("delegados-salud"),
        avatar: diceBearAvatar("Delegados Salud", "shapes"),
        members: 340,
        activity: "Voto delegado activo · 6 dictámenes",
        accent: "#DC143C",
        description:
            "Expertos a quienes la comunidad delega de forma revocable las decisiones técnicas sanitarias.",
    },

    // ── Educativo ──
    {
        id: "grp-edu-1",
        system: "educativo",
        kind: "circulo",
        name: "Círculo de Estudio: Sistemas Complejos",
        cover: picsumCover("circulo-sistemas-complejos"),
        avatar: diceBearAvatar("Sistemas Complejos", "shapes"),
        members: 720,
        activity: "Lectura semanal · 32 notas compartidas",
        accent: "#007FFF",
        description:
            "Grupo de aprendizaje entre pares sobre teoría de sistemas, redes y emergencia.",
    },
    {
        id: "grp-edu-2",
        system: "educativo",
        kind: "circulo",
        name: "Mentores del Exocórtex",
        cover: picsumCover("mentores-exocortex"),
        avatar: diceBearAvatar("Mentores Exocortex", "shapes"),
        members: 415,
        activity: "Sesiones híbridas IA+humano · 12 rutas",
        accent: "#007FFF",
        description:
            "Educadores que diseñan mentorías asistidas por la IA personal (Exocórtex) leal al estudiante.",
    },

    // ── Cultural ──
    {
        id: "grp-cul-1",
        system: "cultural",
        kind: "colectivo",
        name: "Colectivo Génesis Multiverso",
        cover: picsumCover("colectivo-genesis"),
        avatar: diceBearAvatar("Genesis Multiverso", "shapes"),
        members: 2560,
        activity: "9 obras nuevas · 1 evento físico próximo",
        accent: "#39FF14",
        description:
            "Artistas que co-crean escenas navegables del Multiverso y coordinan exposiciones físicas en las Sanghas.",
    },
    {
        id: "grp-cul-2",
        system: "cultural",
        kind: "colectivo",
        name: "Taller de Sonido Cyberdélico",
        cover: picsumCover("taller-sonido-cyberdelico"),
        avatar: diceBearAvatar("Sonido Cyberdelico", "shapes"),
        members: 880,
        activity: "Jam generativa semanal · 47 pistas",
        accent: "#39FF14",
        description:
            "Comunidad de música generativa orientada a la conexión empática y la expansión de la conciencia.",
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// APPS
// ─────────────────────────────────────────────────────────────────────────────

export const sampleApps: SampleApp[] = [
    // ── Político ──
    {
        id: "app-pol-1",
        system: "politico",
        name: "Votación Líquida",
        icon: diceBearAvatar("Votacion Liquida", "bottts-neutral"),
        description:
            "Emite o delega tu voto de forma revocable. Verificación por conocimiento cero: una persona, una voz.",
        category: "Gobernanza",
        accent: "#DC143C",
        open: true,
    },
    {
        id: "app-pol-2",
        system: "politico",
        name: "Tablero de Recursos Comunes",
        icon: diceBearAvatar("Recursos Comunes", "bottts-neutral"),
        description:
            "Visualiza en tiempo real el estado y la asignación transparente de los recursos del procomún.",
        category: "Transparencia",
        accent: "#DC143C",
        open: true,
    },

    // ── Educativo ──
    {
        id: "app-edu-1",
        system: "educativo",
        name: "Biblioteca Inmersiva",
        icon: diceBearAvatar("Biblioteca Inmersiva", "bottts-neutral"),
        description:
            "Explora el conocimiento como un espacio 3D navegable. Cada nodo es una Entidad Única referenciable.",
        category: "Aprendizaje",
        accent: "#007FFF",
        open: true,
    },
    {
        id: "app-edu-2",
        system: "educativo",
        name: "Mentor Exocórtex",
        icon: diceBearAvatar("Mentor Exocortex", "bottts-neutral"),
        description:
            "Tu IA personal de tutoría. Propiedad tuya, leal a ti — amplifica tu cognición sin vigilarte.",
        category: "IA personal",
        accent: "#007FFF",
        open: false,
    },

    // ── Cultural ──
    {
        id: "app-cul-1",
        system: "cultural",
        name: "Galería del Multiverso",
        icon: diceBearAvatar("Galeria Multiverso", "bottts-neutral"),
        description:
            "Recorre exposiciones en realidad virtual. Remezcla y referencia cualquier obra bajo el Lienzo Universal.",
        category: "Multiverso",
        accent: "#39FF14",
        open: true,
    },
    {
        id: "app-cul-2",
        system: "cultural",
        name: "Estudio Sonoro Generativo",
        icon: diceBearAvatar("Estudio Sonoro", "bottts-neutral"),
        description:
            "Compón paisajes sonoros colaborativos en directo. Cada capa queda viva y editable por la comunidad.",
        category: "Creación",
        accent: "#39FF14",
        open: true,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVOS DE MUESTRA (uno por formato, en cada sistema)
// ─────────────────────────────────────────────────────────────────────────────

export const sampleFiles: SampleFile[] = [
    // ── Político ──
    {
        id: "file-pol-pdf",
        system: "politico",
        format: "pdf",
        name: "Borrador — Ley de Energía Procomún.pdf",
        url: SAMPLE_PDF,
        size: "1.2 MB",
        license: "Dominio público (W3C test file)",
        accent: "#DC143C",
    },
    {
        id: "file-pol-dataset",
        system: "politico",
        format: "dataset",
        name: "resultados-votacion-2026.csv",
        url: SAMPLE_PDF, // placeholder descargable público
        size: "84 KB",
        license: "CC0 · datos sintéticos",
        accent: "#DC143C",
    },
    {
        id: "file-pol-link",
        system: "politico",
        format: "enlace",
        name: "Constitución de la Sociedad StarSeed",
        url: "https://starseed-os.vercel.app",
        accent: "#DC143C",
    },
    {
        id: "file-pol-app",
        system: "politico",
        format: "app",
        name: "Simulador de Voto Delegado (interactivo)",
        url: "https://starseed-os.vercel.app",
        thumb: picsumCover("simulador-voto", 400, 300),
        accent: "#DC143C",
    },

    // ── Educativo ──
    {
        id: "file-edu-video",
        system: "educativo",
        format: "video",
        name: "Lección 01 — El origen del cosmos.mp4",
        url: SAMPLE_VIDEO,
        thumb: picsumCover("leccion-cosmos", 400, 300),
        size: "5.3 MB",
        license: "Big Buck Bunny · CC-BY 3.0, Blender Foundation",
        accent: "#007FFF",
    },
    {
        id: "file-edu-pdf",
        system: "educativo",
        format: "pdf",
        name: "Apuntes — Pensamiento Sistémico.pdf",
        url: SAMPLE_PDF,
        size: "0.9 MB",
        license: "Dominio público (W3C test file)",
        accent: "#007FFF",
    },
    {
        id: "file-edu-dataset",
        system: "educativo",
        format: "dataset",
        name: "evolucion-simbiotica.dataset.csv",
        url: SAMPLE_PDF,
        size: "1.4 MB",
        license: "CC0 · datos sintéticos",
        accent: "#007FFF",
    },
    {
        id: "file-edu-image",
        system: "educativo",
        format: "imagen",
        name: "Diagrama de redes complejas.png",
        url: picsumCover("diagrama-redes", 800, 600),
        thumb: picsumCover("diagrama-redes", 400, 300),
        license: "Lorem Picsum · libre",
        accent: "#007FFF",
    },

    // ── Cultural ──
    {
        id: "file-cul-image",
        system: "cultural",
        format: "imagen",
        name: "Aurora Sintética — pieza 03.jpg",
        url: picsumCover("aurora-pieza-03", 1000, 700),
        thumb: picsumCover("aurora-pieza-03", 400, 300),
        license: "Lorem Picsum · libre",
        accent: "#39FF14",
    },
    {
        id: "file-cul-audio",
        system: "cultural",
        format: "audio",
        name: "Constelación Sonora — capa base.mp3",
        url: SAMPLE_AUDIO,
        size: "0.5 MB",
        license: "W3Schools sample · libre",
        accent: "#39FF14",
    },
    {
        id: "file-cul-video",
        system: "cultural",
        format: "video",
        name: "Recorrido VR — Galería Multiverso.mp4",
        url: SAMPLE_VIDEO,
        thumb: picsumCover("recorrido-vr", 400, 300),
        size: "5.3 MB",
        license: "Big Buck Bunny · CC-BY 3.0, Blender Foundation",
        accent: "#39FF14",
    },
    {
        id: "file-cul-app",
        system: "cultural",
        format: "app",
        name: "Lienzo Generativo (interactivo)",
        url: "https://starseed-os.vercel.app",
        thumb: picsumCover("lienzo-generativo", 400, 300),
        accent: "#39FF14",
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// PUBLICACIONES (shape de PostCard) — una por tipo de media, por sistema
// ─────────────────────────────────────────────────────────────────────────────

const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

export const samplePosts: SamplePost[] = [
    // ── Político ──
    {
        id: "post-pol-text",
        system: "politico",
        authorName: "Lucía Ferrán",
        authorHandle: "@lucia.civica",
        avatarUrl: diceBearAvatar("Lucia Ferran", "lorelei"),
        accent: "#DC143C",
        title: "Convocatoria de asamblea",
        body: "Mañana abrimos la votación líquida de la Ley de Energía Procomún. Recuerda que puedes delegar tu voto de forma revocable a cualquier experto. Una persona, una voz.",
        kind: "anuncio",
        createdAt: hoursAgo(2),
        likes: 842,
        commentsCount: 56,
        media: null,
    },
    {
        id: "post-pol-pdf",
        system: "politico",
        authorName: "Néstor Aliaga",
        authorHandle: "@nestor.legis",
        avatarUrl: diceBearAvatar("Nestor Aliaga", "lorelei"),
        accent: "#DC143C",
        title: "Borrador legislativo publicado",
        body: "Aquí el texto completo del borrador, abierto a enmiendas durante 14 días.",
        kind: "documento",
        createdAt: hoursAgo(9),
        likes: 410,
        commentsCount: 38,
        media: { kind: "pdf", url: SAMPLE_PDF, name: "Ley de Energía Procomún.pdf", size: "1.2 MB" },
    },
    {
        id: "post-pol-link",
        system: "politico",
        authorName: "Mesa de Justicia Restaurativa",
        authorHandle: "@justicia.circulos",
        avatarUrl: diceBearAvatar("Justicia Restaurativa", "shapes"),
        accent: "#DC143C",
        body: "Guía abierta para facilitar Círculos de Paz en tu comunidad.",
        kind: "enlace",
        createdAt: hoursAgo(20),
        likes: 233,
        commentsCount: 12,
        media: { kind: "link", url: "https://starseed-os.vercel.app", domain: "starseed-os.vercel.app", name: "Guía de Círculos de Paz" },
    },

    // ── Educativo ──
    {
        id: "post-edu-video",
        system: "educativo",
        authorName: "Dra. Amara Sen",
        authorHandle: "@amara.cosmos",
        avatarUrl: diceBearAvatar("Amara Sen", "lorelei"),
        accent: "#007FFF",
        title: "Nueva lección: el origen del cosmos",
        body: "Primer módulo del curso Cosmología para Sembradores ya disponible. Mentoría híbrida con tu Exocórtex incluida.",
        kind: "lección",
        createdAt: hoursAgo(4),
        likes: 1290,
        commentsCount: 74,
        media: { kind: "video", url: SAMPLE_VIDEO, poster: picsumCover("leccion-cosmos", 800, 450) },
    },
    {
        id: "post-edu-image",
        system: "educativo",
        authorName: "Aprendiz Errante",
        authorHandle: "@aprendiz.errante",
        avatarUrl: diceBearAvatar("aprendiz-errante", "thumbs"),
        accent: "#007FFF",
        body: "Mi mapa visual de la red de sistemas complejos tras la lectura de esta semana. Lo comparto como Entidad Única para que cualquiera lo referencie.",
        kind: "nota",
        createdAt: hoursAgo(15),
        likes: 318,
        commentsCount: 21,
        media: { kind: "image", url: picsumCover("diagrama-redes", 800, 450) },
    },
    {
        id: "post-edu-dataset",
        system: "educativo",
        authorName: "Kenji Mora",
        authorHandle: "@kenji.bio",
        avatarUrl: diceBearAvatar("Kenji Mora", "lorelei"),
        accent: "#007FFF",
        title: "Dataset reproducible publicado",
        body: "Datos abiertos sobre evolución simbiótica, listos para tus notebooks. CC0.",
        kind: "dataset",
        createdAt: hoursAgo(28),
        likes: 506,
        commentsCount: 33,
        media: { kind: "file", url: SAMPLE_PDF, name: "evolucion-simbiotica.dataset.csv", size: "1.4 MB" },
    },

    // ── Cultural ──
    {
        id: "post-cul-gallery",
        system: "cultural",
        authorName: "Nova Reyes",
        authorHandle: "@nova.multiverso",
        avatarUrl: diceBearAvatar("Nova Reyes", "lorelei"),
        accent: "#39FF14",
        title: "Aurora Sintética — nuevas piezas",
        body: "Tres fragmentos de la próxima exposición en el Multiverso. Remezclables bajo el Lienzo Universal.",
        kind: "obra",
        createdAt: hoursAgo(3),
        likes: 2140,
        commentsCount: 118,
        media: {
            kind: "gallery",
            urls: [
                picsumCover("aurora-pieza-01", 600, 600),
                picsumCover("aurora-pieza-02", 600, 600),
                picsumCover("aurora-pieza-03", 600, 600),
                picsumCover("aurora-pieza-04", 600, 600),
            ],
        },
    },
    {
        id: "post-cul-audio",
        system: "cultural",
        authorName: "Iris Bloom",
        authorHandle: "@iris.sonora",
        avatarUrl: diceBearAvatar("Iris Bloom", "lorelei"),
        accent: "#39FF14",
        title: "Capa base de Constelación Sonora",
        body: "Añade tu propia capa a esta obra viva. La composición evoluciona en todas sus instancias a la vez.",
        kind: "audio",
        createdAt: hoursAgo(11),
        likes: 940,
        commentsCount: 47,
        media: { kind: "audio", url: SAMPLE_AUDIO },
    },
    {
        id: "post-cul-video",
        system: "cultural",
        authorName: "Colectivo Génesis Multiverso",
        authorHandle: "@genesis.multiverso",
        avatarUrl: diceBearAvatar("Genesis Multiverso", "shapes"),
        accent: "#39FF14",
        body: "Recorrido VR por la galería antes del evento físico de la Sangha Norte.",
        kind: "video",
        createdAt: hoursAgo(22),
        likes: 1560,
        commentsCount: 89,
        media: { kind: "video", url: SAMPLE_VIDEO, poster: picsumCover("recorrido-vr", 800, 450) },
    },
];

// ── Selectores por sistema ──

export function profilesBySystem(s: SystemKey): SampleProfile[] {
    return sampleProfiles.filter((p) => p.system === s);
}
export function pagesBySystem(s: SystemKey): SamplePage[] {
    return samplePages.filter((p) => p.system === s);
}
export function groupsBySystem(s: SystemKey): SampleGroup[] {
    return sampleGroups.filter((g) => g.system === s);
}
export function appsBySystem(s: SystemKey): SampleApp[] {
    return sampleApps.filter((a) => a.system === s);
}
export function filesBySystem(s: SystemKey): SampleFile[] {
    return sampleFiles.filter((f) => f.system === s);
}
export function postsBySystem(s: SystemKey): SamplePost[] {
    return samplePosts.filter((p) => p.system === s);
}

/** Exporto el tipo de media por si el showcase quiere etiquetar formatos. */
export type { PostMediaKind };
