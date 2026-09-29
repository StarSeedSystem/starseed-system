/**
 * De las filas reales a la vista común de publicación (Ola 0929 · D) — PURO.
 * Lienzo de la Red (`posts`) y creaciones del Café (`cafe_posts`) hablan la misma voz en las
 * tarjetas; lo que las distingue (origen, tipo, si hay página de conversación) viaja en la vista.
 */
import type { PublicacionRed } from "./feed-red-datos";
import type { CreacionCafe } from "./cafe-datos";
import type { PublicacionVista } from "./publicaciones";
import { relevancia } from "./formato";

export interface TipoCreacion {
    etiqueta: string;
    color: string;
}

/** Tipos del Café y del Lienzo con su color (los desconocidos se nombran tal cual). */
export const TIPOS_CREACION: Record<string, TipoCreacion> = {
    obra: { etiqueta: "Obra", color: "#ec4899" },
    propuesta: { etiqueta: "Propuesta", color: "#f59e0b" },
    debate: { etiqueta: "Debate", color: "#a855f7" },
    mision: { etiqueta: "Misión", color: "#10b981" },
    "misión": { etiqueta: "Misión", color: "#10b981" },
    evento: { etiqueta: "Evento", color: "#38bdf8" },
    elixir: { etiqueta: "Elixir", color: "#34d399" },
    receta: { etiqueta: "Receta", color: "#fbbf24" },
    post: { etiqueta: "Publicación", color: "#94a3b8" },
    articulo: { etiqueta: "Artículo", color: "#60a5fa" },
    galeria: { etiqueta: "Galería", color: "#f472b6" },
    musica: { etiqueta: "Música", color: "#c084fc" },
};

export function tipoCreacion(tipo: string | null | undefined): TipoCreacion {
    const k = (tipo ?? "").toLowerCase();
    return TIPOS_CREACION[k] ?? { etiqueta: tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : "Creación", color: "#94a3b8" };
}

const AREAS: Record<string, string> = { politica: "Política", "política": "Política", educacion: "Educación", "educación": "Educación", cultura: "Cultura", general: "General" };

export type Origen = "red" | "cafe";

export interface PublicacionConOrigen extends PublicacionVista {
    origen: Origen;
    area: string | null;
    tipo: string | null;
}

export function vistaDeRed(p: PublicacionRed): PublicacionConOrigen {
    const area = p.area ? AREAS[p.area.toLowerCase()] ?? p.area : null;
    return {
        id: p.id,
        origen: "red",
        area,
        tipo: null,
        autor: p.autor,
        avatar: p.avatar,
        texto: p.texto,
        media: p.media,
        tipoMedia: p.tipoMedia,
        nMedia: p.nMedia,
        reacciones: p.reacciones,
        meGusta: p.meGusta,
        comentarios: p.comentarios,
        etiqueta: area,
        ms: p.ms,
        href: `/post/${p.id}`,
        hrefAutor: p.handle ? `/profile/${p.handle}` : null,
    };
}

export function vistaDeCafe(c: CreacionCafe): PublicacionConOrigen {
    const t = tipoCreacion(c.tipo);
    return {
        id: `cafe:${c.id}`,
        origen: "cafe",
        area: "Cultura",
        tipo: c.tipo,
        autor: c.rama ? `${c.autor} · ${c.rama}` : c.autor,
        avatar: c.avatar,
        titulo: c.titulo,
        texto: c.texto,
        media: c.media,
        tipoMedia: c.tipoMedia,
        nMedia: c.nMedia,
        reacciones: c.reacciones,
        comentarios: c.comentarios,
        etiqueta: t.etiqueta,
        colorEtiqueta: c.acento && /^#([0-9a-f]{6})$/i.test(c.acento) ? c.acento : t.color,
        ms: c.ms,
        // Las creaciones del Café no tienen página propia en el OS: se leen dentro del widget.
        href: "/network/culture",
        sinConversacion: true,
    };
}

/** Ordena por relevancia honesta (reacciones, comentarios y frescura). */
export function porRelevancia<T extends PublicacionVista>(lista: T[], ahora: number): T[] {
    return [...lista].sort((a, b) => relevancia({ reacciones: b.reacciones, comentarios: b.comentarios, ms: b.ms }, ahora) - relevancia({ reacciones: a.reacciones, comentarios: a.comentarios, ms: a.ms }, ahora));
}
