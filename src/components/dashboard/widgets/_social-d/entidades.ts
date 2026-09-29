/**
 * Entidades de la Red para los widgets del paquete D (Ola 0929) — PURO.
 *
 * Páginas (`os_pages`) y grupos (`os_groups`) a una misma vista, su actividad REAL (publicaciones
 * de `os_posts` que las nombran) y una puntuación de descubrimiento que solo usa señales medidas:
 * miembros, publicaciones de la última semana, novedad y afinidad con tus grupos. Cada entidad
 * sale con sus MOTIVOS en palabras («3 publicaciones esta semana», «nueva», «afín a Huerto»): lo
 * que se recomienda se explica, no se inventa.
 */
import type { OsGroupRow, OsMembershipRow, OsPageRow, OsPostRow } from "@/lib/widget-data/os-live";
import { colorDe, msDe, plural } from "./formato";

const DIA = 86_400_000;

export type OrigenEntidad = "pagina" | "grupo";

export interface EntidadVista {
    id: string;
    slug: string;
    nombre: string;
    origen: OrigenEntidad;
    /** Clase declarada: comunidad, proyecto, página, entidad, asamblea, círculo, colectivo… */
    clase: string;
    claseEtiqueta: string;
    descripcion: string;
    etiquetas: string[];
    acento: string;
    avatar: string | null;
    portada: string | null;
    miembros: number;
    duenoId: string | null;
    creada: number;
    href: string;
}

const ETIQUETA_CLASE: Record<string, string> = {
    comunidad: "Comunidad",
    proyecto: "Proyecto",
    pagina: "Página",
    perfil: "Perfil",
    entidad: "Entidad federativa",
    partido: "Partido",
    asamblea: "Asamblea",
    circulo: "Círculo",
    colectivo: "Colectivo",
};

function acentoValido(a: string | null | undefined, semilla: string): string {
    return a && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(a) ? a : colorDe(semilla);
}

export function entidadDePagina(r: OsPageRow): EntidadVista {
    const clase = (r.kind ?? "pagina").toLowerCase();
    return {
        id: `p:${r.id}`,
        slug: r.slug,
        nombre: r.name || r.slug,
        origen: "pagina",
        clase,
        claseEtiqueta: ETIQUETA_CLASE[clase] ?? (r.kind || "Página"),
        descripcion: r.description ?? "",
        etiquetas: Array.isArray(r.tags) ? r.tags.filter(Boolean) : [],
        acento: acentoValido(r.accent, r.slug),
        avatar: r.avatar_url,
        portada: r.cover_url,
        miembros: Math.max(0, r.member_count ?? 0),
        duenoId: r.owner_id,
        creada: msDe(r.created_at),
        href: clase === "entidad" ? `/entidad/${r.slug}` : `/pagina/${r.slug}`,
    };
}

export function entidadDeGrupo(r: OsGroupRow): EntidadVista {
    const clase = (r.kind ?? "grupo").toLowerCase();
    return {
        id: `g:${r.id}`,
        slug: r.slug,
        nombre: r.name || r.slug,
        origen: "grupo",
        clase,
        claseEtiqueta: ETIQUETA_CLASE[clase] ?? (r.kind || "Grupo"),
        descripcion: r.description ?? "",
        etiquetas: Array.isArray(r.tags) ? r.tags.filter(Boolean) : [],
        acento: acentoValido(r.accent, r.slug),
        avatar: r.avatar_url,
        portada: r.cover_url,
        miembros: Math.max(0, r.member_count ?? 0),
        duenoId: r.owner_id,
        creada: msDe(r.created_at),
        href: `/grupo/${r.slug}`,
    };
}

export interface Actividad {
    /** Publicaciones de los últimos 7 días que nombran a la entidad. */
    semana: number;
    /** Instante de su última publicación (0 = ninguna en lo leído). */
    ultima: number;
    /** Publicaciones por día de los últimos 7 días (hoy al final). */
    serie: number[];
}

const CLAVE_TIPO: Record<string, OrigenEntidad> = { page: "pagina", pagina: "pagina", group: "grupo", grupo: "grupo" };

export function claveEntidad(origen: OrigenEntidad, slug: string): string {
    return `${origen}:${slug}`;
}

/** Actividad real por entidad a partir de las publicaciones leídas. */
export function actividadPorEntidad(posts: OsPostRow[], ahora: number): Map<string, Actividad> {
    const mapa = new Map<string, Actividad>();
    const hoy = new Date(ahora);
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
    for (const p of posts) {
        const origen = CLAVE_TIPO[(p.entity_type ?? "").toLowerCase()];
        if (!origen || !p.entity_slug) continue;
        const k = claveEntidad(origen, p.entity_slug);
        const a = mapa.get(k) ?? { semana: 0, ultima: 0, serie: [0, 0, 0, 0, 0, 0, 0] };
        const ms = msDe(p.created_at);
        if (ms > a.ultima) a.ultima = ms;
        if (ms > 0 && ahora - ms < 7 * DIA) a.semana += 1;
        const dias = Math.round((inicioHoy - new Date(new Date(ms).getFullYear(), new Date(ms).getMonth(), new Date(ms).getDate()).getTime()) / DIA);
        if (ms > 0 && dias >= 0 && dias < 7) a.serie[6 - dias] += 1;
        mapa.set(k, a);
    }
    return mapa;
}

export interface Puntuada {
    e: EntidadVista;
    puntos: number;
    motivos: string[];
    actividad: Actividad | null;
    nueva: boolean;
}

/**
 * Descubrimiento honesto: log(miembros) + 1,5·publicaciones de la semana + novedad (< 14 días)
 * + afinidad (etiquetas compartidas con tus grupos). Los motivos se dicen en palabras.
 */
export function puntuar(e: EntidadVista, actividad: Actividad | null, afinidad: Map<string, string>, ahora: number): Puntuada {
    const motivos: string[] = [];
    let puntos = Math.log10(1 + e.miembros) * 2;
    if (e.miembros > 0) motivos.push(plural(e.miembros, "miembro", "miembros"));
    if (actividad && actividad.semana > 0) {
        puntos += 1.5 * actividad.semana;
        motivos.push(`${plural(actividad.semana, "publicación", "publicaciones")} esta semana`);
    }
    const nueva = e.creada > 0 && ahora - e.creada < 14 * DIA;
    if (nueva) {
        puntos += 2;
        motivos.push("nueva");
    }
    const comun = e.etiquetas.find((t) => afinidad.has(t.toLowerCase()));
    if (comun) {
        puntos += 2.5;
        motivos.push(`afín a ${afinidad.get(comun.toLowerCase())}`);
    }
    return { e, puntos, motivos, actividad, nueva };
}

/** Etiquetas de los grupos a los que perteneces → nombre del grupo (para «afín a …»). */
export function afinidadDe(grupos: EntidadVista[], membresias: OsMembershipRow[]): Map<string, string> {
    const mias = new Set(membresias.map((m) => m.group_slug));
    const mapa = new Map<string, string>();
    for (const g of grupos) {
        if (!mias.has(g.slug)) continue;
        for (const t of g.etiquetas) if (!mapa.has(t.toLowerCase())) mapa.set(t.toLowerCase(), g.nombre);
    }
    return mapa;
}

/** Rol legible de una membresía. */
export function rolLegible(rol: string | null | undefined): string {
    const r = (rol ?? "").toLowerCase();
    if (r === "admin" || r === "administrador") return "Administras";
    if (r === "moderador" || r === "mod") return "Moderas";
    if (r === "fundador" || r === "owner" || r === "dueno" || r === "dueño") return "Fundaste";
    if (r === "pendiente" || r === "solicitud") return "Solicitud enviada";
    return "Miembro";
}
