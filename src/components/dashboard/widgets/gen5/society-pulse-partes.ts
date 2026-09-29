/**
 * Pulso de la Sociedad · piezas PURAS (Ola 0929-C).
 *
 * Todo sale de las filas REALES que ya traen los hooks en vivo del OS (`os-live`: publicaciones,
 * grupos y eventos). Con un matiz honesto: las publicaciones son las más recientes que el hook
 * carga (no el total de la red), y así se dice cuando la muestra se llena.
 */
import type { OsEventRow, OsGroupRow, OsPostRow } from "@/lib/widget-data/os-live";

const DIA = 86_400_000;

function inicioDelDia(t: number): number {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

export interface Latido { dia: number; n: number }

/** Publicaciones por día (hoy el último) de los últimos `dias` días, sobre la muestra dada. */
export function latidos(posts: Pick<OsPostRow, "created_at">[], ahora: number, dias = 7): Latido[] {
    const hoy = inicioDelDia(ahora);
    const out: Latido[] = Array.from({ length: dias }, (_, i) => ({ dia: hoy - (dias - 1 - i) * DIA, n: 0 }));
    for (const p of posts) {
        const t = p.created_at ? Date.parse(p.created_at) : NaN;
        if (!Number.isFinite(t) || t > ahora + 60_000) continue;
        const i = Math.floor((inicioDelDia(t) - out[0].dia) / DIA);
        if (i >= 0 && i < dias) out[i].n++;
    }
    return out;
}

/**
 * ¿La muestra se quedó corta? Si el hook trae N filas y todas caen dentro de la ventana, puede
 * haber más de las que vemos: entonces las cifras se leen como «al menos».
 */
export function muestraLlena(posts: Pick<OsPostRow, "created_at">[], limite: number, desde: number): boolean {
    if (posts.length < limite) return false;
    return posts.every((p) => p.created_at && Date.parse(p.created_at) >= desde);
}

/** Voces distintas (autores) en los últimos `dias` días. */
export function voces(posts: Pick<OsPostRow, "created_at" | "author_id" | "author_name">[], ahora: number, dias = 7): number {
    const s = new Set<string>();
    for (const p of posts) {
        const t = p.created_at ? Date.parse(p.created_at) : NaN;
        if (Number.isFinite(t) && t >= ahora - dias * DIA) s.add(p.author_id || p.author_name || "anónimo");
    }
    return s.size;
}

export function proximos(eventos: OsEventRow[], ahora: number, dias = 7): OsEventRow[] {
    return eventos
        .filter((e) => { const t = e.starts_at ? Date.parse(e.starts_at) : NaN; return Number.isFinite(t) && t >= ahora && t <= ahora + dias * DIA; })
        .sort((a, b) => Date.parse(a.starts_at!) - Date.parse(b.starts_at!));
}

export function comunidades(grupos: OsGroupRow[]): { total: number; miembros: number; top: OsGroupRow[] } {
    const top = [...grupos].sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0));
    return { total: grupos.length, miembros: grupos.reduce((s, g) => s + Math.max(0, g.member_count ?? 0), 0), top: top.slice(0, 5) };
}

/** ¿Hubo actividad en la última hora? (el corazón late). */
export function latiendo(posts: Pick<OsPostRow, "created_at">[], ahora: number): boolean {
    return posts.some((p) => p.created_at && ahora - Date.parse(p.created_at) < 3_600_000 && Date.parse(p.created_at) <= ahora + 60_000);
}
