// src/components/creation/creation-config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Configuración compartida del CENTRO DE CREACIÓN (/crear) y de la Zona de
// Publicación (SOP: architecture/centro-creacion-sync-permisos.md §2 y §8).
//
// Define, en un único lugar:
//   · Los DESTINOS de publicación (Mi Perfil · Política · Educación · Cultura ·
//     Biblioteca · página/grupo propio) y su mapeo a entidades os_posts.
//   · Los TIPOS ESPECIALIZADOS de publicación por sección (política: propuesta/
//     votación/debate/iniciativa · educación: curso/guía/recurso/tutoría ·
//     cultura: obra/evento/convocatoria/multiverso · biblioteca: archivo/wiki/
//     colección).
//   · La convención de METADATA embebida en el cuerpo del post (comentario
//     `<!--ss:meta {...}-->` al final del body) para no romper el esquema de
//     `os_posts` (que solo tiene body/media_url). Incluye parser para feeds.
//
// Lo consumen: /crear (lienzo, zona de publicación, pizarras) y /publish.
// ─────────────────────────────────────────────────────────────────────────────

import {
    UserCircle2,
    Scale,
    School,
    Palette,
    Library,
    Users2,
    Lightbulb,
    Vote,
    MessagesSquare,
    Rocket,
    GraduationCap,
    BookOpen,
    Package,
    UserCheck,
    Brush,
    CalendarDays,
    Megaphone,
    Orbit,
    FileText,
    BookMarked,
    LibraryBig,
    PenLine,
    ScrollText,
    // Catálogo de etiquetas (Adenda 66 §6)
    Globe,
    Presentation,
    ShieldAlert,
    MessageSquarePlus,
    FileSignature,
    LifeBuoy,
    HeartHandshake,
    Siren,
    Blocks,
    Boxes,
    ClipboardCheck,
    Laugh,
    Newspaper,
    Gamepad2,
    AppWindow,
    Code2,
    Microscope,
    BarChart3,
    Map as MapIcon,
    PencilRuler,
    GitBranch,
    Bot,
    type LucideIcon,
} from "lucide-react";
import type { OsEntityType } from "@/lib/os-social";
import type { PostBlock } from "@/lib/creation/post-blocks";
import type { Marco } from "@/lib/profile/marco-foto";

// ── Destinos ─────────────────────────────────────────────────────────────────

/** Destino de una creación: secciones de la red + perfil + entidad propia + Librería. */
export type CreationDest =
    | "perfil"
    | "politica"
    | "educacion"
    | "cultura"
    | "biblioteca"
    | "propia"
    /**
     * Adenda 66 §6 · «Librería» (con UBICACIÓN: biblioteca + folder). A diferencia
     * de "biblioteca" (que publica un POST en la cola de la sección Biblioteca),
     * este destino GUARDA el contenido como ÍTEM de biblioteca en la ubicación
     * elegida (con su ACL), no como publicación. Sólo lo maneja el Lienzo.
     */
    | "libreria";

export interface CreationDestDef {
    id: CreationDest;
    label: string;
    desc: string;
    icon: LucideIcon;
    /** Clases de acento (borde/texto) al estilo Crystal Liquid Glass. */
    accent: string;
}

export const CREATION_DESTS: CreationDestDef[] = [
    {
        id: "perfil",
        label: "Mi Perfil",
        desc: "Tu faceta pública",
        icon: UserCircle2,
        accent: "border-emerald-500/50 text-emerald-300",
    },
    {
        id: "politica",
        label: "Política",
        desc: "Propuestas y votos",
        icon: Scale,
        accent: "border-sky-500/50 text-sky-300",
    },
    {
        id: "educacion",
        label: "Educación",
        desc: "Cursos y guías",
        icon: School,
        accent: "border-amber-500/50 text-amber-300",
    },
    {
        id: "cultura",
        label: "Cultura",
        desc: "Arte y eventos",
        icon: Palette,
        accent: "border-fuchsia-500/50 text-fuchsia-300",
    },
    {
        id: "biblioteca",
        label: "Biblioteca",
        desc: "Archivo y wiki",
        icon: Library,
        accent: "border-teal-500/50 text-teal-300",
    },
    {
        id: "propia",
        label: "Página / Grupo propio",
        desc: "Tus entidades",
        icon: Users2,
        accent: "border-indigo-500/50 text-indigo-300",
    },
    {
        id: "libreria",
        label: "Librería",
        desc: "Guardar en biblioteca + folder",
        icon: LibraryBig,
        accent: "border-cyan-500/50 text-cyan-300",
    },
];

export const CREATION_DEST_BY_ID: Record<CreationDest, CreationDestDef> =
    Object.fromEntries(CREATION_DESTS.map((d) => [d.id, d])) as Record<
        CreationDest,
        CreationDestDef
    >;

/** Secciones publicables desde la Zona de Publicación (los 4 destinos Trinity). */
export const PUBLISH_SECTIONS: CreationDest[] = [
    "politica",
    "educacion",
    "cultura",
    "biblioteca",
];

/** Normaliza el parámetro ?dest= de la URL a un CreationDest válido (o null). */
export function parseDestParam(raw: string | null | undefined): CreationDest | null {
    const k = (raw ?? "").trim().toLowerCase();
    if (!k) return null;
    const map: Record<string, CreationDest> = {
        perfil: "perfil",
        politica: "politica",
        "política": "politica",
        politics: "politica",
        educacion: "educacion",
        "educación": "educacion",
        education: "educacion",
        cultura: "cultura",
        culture: "cultura",
        biblioteca: "biblioteca",
        library: "biblioteca",
        propia: "propia",
        libreria: "libreria",
        "librería": "libreria",
    };
    return map[k] ?? null;
}

// ── Tipos especializados por destino ─────────────────────────────────────────

export interface CreationTipoDef {
    id: string;
    label: string;
    desc: string;
    icon: LucideIcon;
}

export const TIPOS_POR_DEST: Record<CreationDest, CreationTipoDef[]> = {
    politica: [
        { id: "propuesta", label: "Propuesta", desc: "Propuesta legislativa o de acción", icon: Lightbulb },
        { id: "votacion", label: "Votación", desc: "Consulta con opciones de voto", icon: Vote },
        { id: "debate", label: "Debate", desc: "Deliberación estructurada", icon: MessagesSquare },
        { id: "iniciativa", label: "Iniciativa", desc: "Proyecto ejecutivo ciudadano", icon: Rocket },
    ],
    educacion: [
        { id: "curso", label: "Curso", desc: "Itinerario de aprendizaje", icon: GraduationCap },
        { id: "guia", label: "Guía", desc: "Instrucciones paso a paso", icon: BookOpen },
        { id: "recurso", label: "Recurso", desc: "Material de estudio", icon: Package },
        { id: "tutoria", label: "Tutoría", desc: "Mentoría humano + IA", icon: UserCheck },
    ],
    cultura: [
        { id: "obra", label: "Obra", desc: "Creación artística", icon: Brush },
        { id: "evento", label: "Evento", desc: "Encuentro físico o virtual", icon: CalendarDays },
        { id: "convocatoria", label: "Convocatoria", desc: "Llamado a participar", icon: Megaphone },
        { id: "multiverso", label: "Multiverso", desc: "Espacio inmersivo de la red", icon: Orbit },
    ],
    biblioteca: [
        { id: "archivo", label: "Archivo", desc: "Documento o pieza archivable", icon: FileText },
        { id: "wiki", label: "Wiki", desc: "Artículo de conocimiento vivo", icon: BookMarked },
        { id: "coleccion", label: "Colección", desc: "Conjunto curado de ítems", icon: LibraryBig },
    ],
    libreria: [
        { id: "archivo", label: "Archivo", desc: "Documento o pieza archivable", icon: FileText },
        { id: "recurso", label: "Recurso", desc: "Material reutilizable", icon: Package },
        { id: "coleccion", label: "Colección", desc: "Conjunto curado de ítems", icon: LibraryBig },
    ],
    perfil: [
        { id: "publicacion", label: "Publicación", desc: "Comparte con tu red", icon: PenLine },
        { id: "articulo", label: "Artículo", desc: "Texto largo con título", icon: ScrollText },
    ],
    propia: [
        { id: "publicacion", label: "Publicación", desc: "Post en tu entidad", icon: PenLine },
        { id: "articulo", label: "Artículo", desc: "Texto largo con título", icon: ScrollText },
        { id: "anuncio", label: "Anuncio", desc: "Aviso a los miembros", icon: Megaphone },
    ],
};

/** Primer tipo (por defecto) de un destino. */
export function defaultTipoFor(dest: CreationDest): string {
    return TIPOS_POR_DEST[dest]?.[0]?.id ?? "publicacion";
}

// ── Catálogo de ETIQUETAS MÚLTIPLES (Adenda 66 §6) ───────────────────────────
//
// El "tipo" de publicación deja de ser único: una creación lleva VARIAS
// etiquetas (chips seleccionables). Cada etiqueta declara a qué destinos/áreas
// aplica (`sections: "all"` o un subconjunto de CreationDest) para poder
// sugerir las más relevantes según el destino elegido. `tipo` primario = tags[0].

export interface PublicationTagDef {
    id: string;
    label: string;
    desc: string;
    icon: LucideIcon;
    /** Áreas/destinos donde la etiqueta es relevante ("all" = todas). */
    sections: "all" | CreationDest[];
}

export const PUBLICATION_TAGS: PublicationTagDef[] = [
    { id: "general", label: "General", desc: "Publicación abierta", icon: PenLine, sections: "all" },
    { id: "articulo", label: "Artículo", desc: "Texto largo con título", icon: ScrollText, sections: "all" },
    { id: "pagina-web", label: "Página web", desc: "Página con contenido interactivo", icon: Globe, sections: "all" },
    { id: "presentacion", label: "Presentación", desc: "Diapositivas o slides", icon: Presentation, sections: ["educacion", "cultura", "propia", "libreria"] },
    { id: "propuesta", label: "Propuesta", desc: "Propuesta legislativa o de acción", icon: Lightbulb, sections: ["politica", "propia"] },
    { id: "denuncia", label: "Denuncia", desc: "Reporte de un problema", icon: ShieldAlert, sections: ["politica", "perfil", "propia"] },
    { id: "sugerencia", label: "Sugerencia", desc: "Idea de mejora", icon: MessageSquarePlus, sections: "all" },
    { id: "peticion", label: "Petición", desc: "Solicitud con apoyos", icon: FileSignature, sections: ["politica", "propia"] },
    { id: "ayuda", label: "Ayuda", desc: "Pide o ofrece ayuda", icon: LifeBuoy, sections: "all" },
    { id: "voluntariado", label: "Voluntariado", desc: "Llamada a colaborar", icon: HeartHandshake, sections: ["cultura", "politica", "propia"] },
    { id: "urgencia", label: "Urgencia", desc: "Asunto prioritario", icon: Siren, sections: "all" },
    { id: "widget", label: "Widget", desc: "Interfaz forjada embebida", icon: Blocks, sections: "all" },
    { id: "vr-ar", label: "VR/AR", desc: "Realidad virtual o aumentada", icon: Boxes, sections: ["cultura", "educacion"] },
    { id: "examen", label: "Examen", desc: "Prueba con insignia opcional", icon: ClipboardCheck, sections: ["educacion", "propia"] },
    { id: "meme", label: "Meme", desc: "Humor e imagen ligera", icon: Laugh, sections: ["perfil", "cultura", "propia"] },
    { id: "noticia", label: "Noticia", desc: "Actualidad y novedades", icon: Newspaper, sections: "all" },
    { id: "evento", label: "Evento", desc: "Encuentro físico o virtual", icon: CalendarDays, sections: "all" },
    { id: "juego", label: "Juego", desc: "Juego jugable", icon: Gamepad2, sections: ["cultura", "educacion", "perfil"] },
    { id: "app", label: "App", desc: "Aplicación funcional", icon: AppWindow, sections: "all" },
    { id: "archivo", label: "Archivo", desc: "Documento o fichero", icon: FileText, sections: "all" },
    { id: "programa", label: "Programa", desc: "Código ejecutable", icon: Code2, sections: "all" },
    { id: "curso", label: "Curso", desc: "Itinerario de aprendizaje", icon: GraduationCap, sections: ["educacion", "propia", "libreria"] },
    { id: "guia", label: "Guía", desc: "Instrucciones paso a paso", icon: BookOpen, sections: "all" },
    { id: "recurso", label: "Recurso", desc: "Material reutilizable", icon: Package, sections: "all" },
    { id: "obra", label: "Obra", desc: "Creación artística", icon: Brush, sections: ["cultura", "perfil", "propia"] },
    { id: "convocatoria", label: "Convocatoria", desc: "Llamado a participar", icon: Megaphone, sections: ["cultura", "politica", "propia"] },
    { id: "debate", label: "Debate", desc: "Deliberación estructurada", icon: MessagesSquare, sections: ["politica", "educacion", "propia"] },
    { id: "votacion", label: "Votación", desc: "Consulta con opciones", icon: Vote, sections: ["politica", "propia"] },
    { id: "iniciativa", label: "Iniciativa", desc: "Proyecto ciudadano", icon: Rocket, sections: ["politica", "propia"] },
    { id: "tutoria", label: "Tutoría", desc: "Mentoría humano + IA", icon: UserCheck, sections: ["educacion", "propia"] },
    { id: "investigacion", label: "Investigación", desc: "Estudio con fuentes", icon: Microscope, sections: ["educacion", "politica", "libreria"] },
    { id: "dato-grafica", label: "Dato/Gráfica", desc: "Datos con visualización", icon: BarChart3, sections: "all" },
    { id: "mapa", label: "Mapa", desc: "Ubicación o zona", icon: MapIcon, sections: "all" },
    { id: "pizarra", label: "Pizarra", desc: "Lienzo de trabajo", icon: PencilRuler, sections: "all" },
    { id: "repo", label: "Repo", desc: "Repositorio de código", icon: GitBranch, sections: "all" },
    { id: "agente-bot", label: "Agente/Bot", desc: "Mini-agente con IA", icon: Bot, sections: "all" },
];

/** Índice id → definición de etiqueta. */
export const PUBLICATION_TAG_BY_ID: Record<string, PublicationTagDef> =
    Object.fromEntries(PUBLICATION_TAGS.map((t) => [t.id, t])) as Record<string, PublicationTagDef>;

/**
 * Etiquetas ORDENADAS para un destino: primero las que aplican a esa área, luego
 * el resto (el usuario puede elegir cualquiera, pero las relevantes van arriba).
 */
export function tagsForDest(dest: CreationDest): PublicationTagDef[] {
    const applies = (t: PublicationTagDef) =>
        t.sections === "all" || t.sections.includes(dest);
    const primary = PUBLICATION_TAGS.filter(applies);
    const rest = PUBLICATION_TAGS.filter((t) => !applies(t));
    return [...primary, ...rest];
}

/** Etiqueta por defecto de un destino (para no publicar nunca sin etiqueta). */
export function defaultTagFor(dest: CreationDest): string {
    const map: Partial<Record<CreationDest, string>> = {
        politica: "propuesta",
        educacion: "curso",
        cultura: "obra",
        biblioteca: "archivo",
        libreria: "archivo",
    };
    return map[dest] ?? "general";
}

// ── Mapeo destino → entidad os_posts ─────────────────────────────────────────

export interface CreationEntityRef {
    entityType: OsEntityType;
    entitySlug: string;
}

/**
 * Slugs CANÓNICOS de las secciones de la red en `os_posts` (entity_type "page").
 * Los feeds de Política/Educación/Cultura/Biblioteca leen estas colas.
 */
export const SECTION_SLUGS: Record<
    Exclude<CreationDest, "perfil" | "propia" | "libreria">,
    string
> = {
    politica: "politica",
    educacion: "educacion",
    cultura: "cultura",
    biblioteca: "biblioteca",
};

/**
 * Resuelve el destino a (entityType, entitySlug) para persistir con el MISMO
 * mecanismo que /publish (tabla os_posts vía createPost/useOsPosts).
 * `own` es la entidad propia elegida cuando dest === "propia".
 */
export function destToEntity(
    dest: CreationDest,
    own?: { entityType: OsEntityType; entitySlug: string } | null,
): CreationEntityRef {
    if (dest === "propia" && own?.entitySlug) {
        return { entityType: own.entityType, entitySlug: own.entitySlug };
    }
    if (dest === "perfil") {
        // Mismo shape que /publish para el destino "Mi Perfil".
        return { entityType: "page", entitySlug: "perfil-mi-perfil" };
    }
    if (dest === "propia" || dest === "libreria") {
        // "propia" sin entidad, o "libreria" (que NO publica un post sino que
        // guarda un ítem de biblioteca): degrada al perfil para no romper nunca.
        return { entityType: "page", entitySlug: "perfil-mi-perfil" };
    }
    return { entityType: "page", entitySlug: SECTION_SLUGS[dest] };
}

// ── Metadata embebida en el body (sin romper el esquema de os_posts) ─────────

/** Metadata estructurada de una creación, embebida al final del cuerpo. */
export interface SsPostMeta {
    /** Sección/destino de la creación (politica/educacion/cultura/biblioteca…). */
    area?: string;
    /**
     * Tipo PRIMARIO (compat): la PRIMERA etiqueta de `tags`. Se conserva para no
     * romper el render antiguo (badge por `kind`) y `splitBodyAttachments`.
     */
    tipo?: string;
    /** Adenda 66 §6 · ETIQUETAS MÚLTIPLES de la publicación (ids de PUBLICATION_TAGS). */
    tags?: string[];
    /** Bloques del Lienzo Universal (forma serializada — ver PostBlock). */
    blocks?: PostBlock[];
    /** Referencia a otra entidad (p. ej. { kind: "pizarra", id, href }). */
    ref?: Record<string, unknown>;
    /**
     * Geolocalización de la publicación (Mapa del Hub, SOP §12). os_posts no
     * tiene columna metadata, así que la geo viaja aquí; la capa
     * "Publicaciones" del mapa (src/lib/map/map-data.ts) la parsea.
     */
    geo?: { lat: number; lng: number; label?: string | null };
    /**
     * (Adenda 219) MARCOS de los medios de la publicación, por URL: forma de
     * recorte (círculo, estrella, hexágono…) y encuadre. Los bloques de imagen
     * legados viajan como markdown (sin sitio para el marco), así que el marco
     * va aquí y la tarjeta lo aplica a la foto o vídeo con esa URL.
     */
    marcos?: Record<string, Marco>;
}

const SS_META_RE = /<!--ss:meta\s+([\s\S]*?)-->/;

/** Serializa la metadata como comentario HTML (invisible en render markdown). */
export function buildSsMetaComment(meta: SsPostMeta): string {
    try {
        // Los bloques de código/HTML pueden contener «-->», que cerraría el
        // comentario antes de tiempo y rompería el parseo. Escapamos ese cierre
        // como «-->» dentro del JSON: JSON.parse lo decodifica de vuelta a
        // «-->» al leer, así que no hace falta paso inverso en los parsers.
        const json = JSON.stringify(meta).replace(/-->/g, "--\\u003e");
        return `<!--ss:meta ${json}-->`;
    } catch {
        return "";
    }
}

/** Extrae la metadata `ss:meta` de un body (o null si no hay/está corrupta). */
export function parseSsMeta(body: string | null | undefined): SsPostMeta | null {
    if (!body) return null;
    const m = body.match(SS_META_RE);
    if (!m?.[1]) return null;
    try {
        const parsed = JSON.parse(m[1]);
        return parsed && typeof parsed === "object" ? (parsed as SsPostMeta) : null;
    } catch {
        return null;
    }
}

/** Devuelve el body sin el comentario de metadata (para mostrar limpio). */
export function stripSsMeta(body: string | null | undefined): string {
    if (!body) return "";
    return body.replace(SS_META_RE, "").trimEnd();
}
