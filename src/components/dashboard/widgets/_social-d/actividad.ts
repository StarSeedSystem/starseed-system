/**
 * Actividad de la Red (Ola 0929 · D) — PURO. Publicaciones (`os_posts`), eventos (`os_events`),
 * páginas (`os_pages`) y grupos (`os_groups`) a una misma línea de tiempo, con quién, qué y dónde,
 * y a la ruta real de cada cosa. Las cifras del resumen salen de las mismas filas: nada se estima.
 */
import type { OsEventRow, OsGroupRow, OsPageRow, OsPostRow } from "@/lib/widget-data/os-live";
import { msDe, seriePorDia } from "./formato";

export type TipoActividad = "publicacion" | "evento" | "comunidad" | "grupo";

export interface EntradaActividad {
    id: string;
    tipo: TipoActividad;
    actor: string;
    actorId: string | null;
    accion: string;
    objeto: string;
    detalle: string | null;
    ms: number;
    href: string;
}

function destinoDe(tipo: string | null, slug: string | null): { href: string; nombre: string } {
    const t = (tipo ?? "").toLowerCase();
    if (!slug) return { href: "/network", nombre: "la Red" };
    const nombre = slug.replace(/-/g, " ");
    if (t === "group") return { href: `/grupo/${slug}`, nombre };
    if (t === "event") return { href: `/evento/${slug}`, nombre };
    if (t === "profile") return { href: `/profile/${slug}`, nombre: `@${slug}` };
    return { href: `/pagina/${slug}`, nombre };
}

export function construirActividad(f: { posts: OsPostRow[]; eventos: OsEventRow[]; paginas: OsPageRow[]; grupos: OsGroupRow[] }): EntradaActividad[] {
    const out: EntradaActividad[] = [];
    for (const p of f.posts) {
        const d = destinoDe(p.entity_type, p.entity_slug);
        out.push({
            id: `post-${p.id}`, tipo: "publicacion", actor: p.author_name?.trim() || "Alguien de la Red", actorId: p.author_id,
            accion: p.entity_slug ? "publicó en" : "publicó", objeto: p.entity_slug ? d.nombre : "", detalle: p.body?.replace(/\s+/g, " ").trim() || null,
            ms: msDe(p.created_at), href: d.href,
        });
    }
    for (const e of f.eventos) {
        out.push({
            id: `evt-${e.id}`, tipo: "evento", actor: e.organizer_slug ? e.organizer_slug.replace(/-/g, " ") : "La Red", actorId: e.owner_id,
            accion: "convocó", objeto: e.title, detalle: e.location, ms: msDe(e.created_at), href: `/evento/${e.slug}`,
        });
    }
    for (const p of f.paginas) {
        if ((p.kind ?? "").toLowerCase() === "perfil") continue;
        out.push({
            id: `pag-${p.id}`, tipo: "comunidad", actor: "Nueva página", actorId: p.owner_id, accion: "abrió", objeto: p.name,
            detalle: p.description, ms: msDe(p.created_at), href: `/pagina/${p.slug}`,
        });
    }
    for (const g of f.grupos) {
        out.push({
            id: `grp-${g.id}`, tipo: "grupo", actor: "Nuevo grupo", actorId: g.owner_id, accion: "se formó", objeto: g.name,
            detalle: g.description, ms: msDe(g.created_at), href: `/grupo/${g.slug}`,
        });
    }
    return out.filter((x) => x.ms > 0).sort((a, b) => b.ms - a.ms);
}

export interface ResumenActividad {
    publicaciones7: number[];
    total7: number;
    ultimas24: number;
    previas24: number;
    /** Variación 24 h frente a las 24 h previas, en % (null si no hay base). */
    variacion: number | null;
    comunidades: number;
    grupos: number;
    proximosEventos: number;
    masActivas: { nombre: string; href: string; n: number }[];
}

const DIA = 86_400_000;

export function resumirActividad(f: { posts: OsPostRow[]; eventos: OsEventRow[]; paginas: OsPageRow[]; grupos: OsGroupRow[] }, ahora: number): ResumenActividad {
    const instantes = f.posts.map((p) => msDe(p.created_at)).filter((m) => m > 0);
    const serie = seriePorDia(instantes, ahora, 7);
    const ultimas24 = instantes.filter((m) => ahora - m < DIA).length;
    const previas24 = instantes.filter((m) => ahora - m >= DIA && ahora - m < 2 * DIA).length;
    const cuenta = new Map<string, { nombre: string; href: string; n: number }>();
    for (const p of f.posts) {
        if (!p.entity_slug || ahora - msDe(p.created_at) > 7 * DIA) continue;
        const d = destinoDe(p.entity_type, p.entity_slug);
        const k = d.href;
        const e = cuenta.get(k) ?? { nombre: d.nombre, href: d.href, n: 0 };
        e.n += 1;
        cuenta.set(k, e);
    }
    return {
        publicaciones7: serie,
        total7: serie.reduce((a, b) => a + b, 0),
        ultimas24,
        previas24,
        variacion: previas24 > 0 ? Math.round(((ultimas24 - previas24) / previas24) * 100) : null,
        comunidades: f.paginas.filter((p) => (p.kind ?? "").toLowerCase() === "comunidad").length,
        grupos: f.grupos.length,
        proximosEventos: f.eventos.filter((e) => msDe(e.starts_at) >= ahora).length,
        masActivas: [...cuenta.values()].sort((a, b) => b.n - a.n).slice(0, 3),
    };
}

/** Solo lo tuyo: lo que publicaste, convocaste o fundaste. */
export function soloMio<T extends { actorId: string | null }>(xs: T[], uid: string | null): T[] {
    return uid ? xs.filter((x) => x.actorId === uid) : [];
}

/** Iniciales de día de la semana para los ejes (L M X J V S D), terminando hoy. */
export function ejeDias(ahora: number, dias = 7): string[] {
    const letras = ["D", "L", "M", "X", "J", "V", "S"];
    return Array.from({ length: dias }, (_, i) => letras[new Date(ahora - (dias - 1 - i) * DIA).getDay()]);
}
