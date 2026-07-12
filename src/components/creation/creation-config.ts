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
    type LucideIcon,
} from "lucide-react";
import type { OsEntityType } from "@/lib/os-social";

// ── Destinos ─────────────────────────────────────────────────────────────────

/** Destino de una creación: secciones de la red + perfil + entidad propia. */
export type CreationDest =
    | "perfil"
    | "politica"
    | "educacion"
    | "cultura"
    | "biblioteca"
    | "propia";

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
    Exclude<CreationDest, "perfil" | "propia">,
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
    if (dest === "propia") {
        // Sin entidad elegida: degrada al perfil (nunca rompe).
        return { entityType: "page", entitySlug: "perfil-mi-perfil" };
    }
    return { entityType: "page", entitySlug: SECTION_SLUGS[dest] };
}

// ── Metadata embebida en el body (sin romper el esquema de os_posts) ─────────

/** Metadata estructurada de una creación, embebida al final del cuerpo. */
export interface SsPostMeta {
    /** Sección/destino de la creación (politica/educacion/cultura/biblioteca…). */
    area?: string;
    /** Tipo especializado (propuesta, curso, obra, archivo, pizarra…). */
    tipo?: string;
    /** Bloques del Lienzo Universal (forma compacta). */
    blocks?: Array<Record<string, unknown>>;
    /** Referencia a otra entidad (p. ej. { kind: "pizarra", id, href }). */
    ref?: Record<string, unknown>;
    /**
     * Geolocalización de la publicación (Mapa del Hub, SOP §12). os_posts no
     * tiene columna metadata, así que la geo viaja aquí; la capa
     * "Publicaciones" del mapa (src/lib/map/map-data.ts) la parsea.
     */
    geo?: { lat: number; lng: number; label?: string | null };
}

const SS_META_RE = /<!--ss:meta\s+([\s\S]*?)-->/;

/** Serializa la metadata como comentario HTML (invisible en render markdown). */
export function buildSsMetaComment(meta: SsPostMeta): string {
    try {
        return `<!--ss:meta ${JSON.stringify(meta)}-->`;
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
