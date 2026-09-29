"use client";
/**
 * Páginas de la red (os_pages) para los widgets del paquete E — una sola lectura compartida entre
 * los proyectos de la red y el mapa (caché de 15 min, solo con el widget a la vista). Se guardan
 * únicamente los campos que se pintan.
 */
import { fetchEvents, fetchGroups, fetchPages, type OsPage } from "@/lib/os-social";
import { TTL_EXTERNO_MS, cacheadoE } from "./cache";

export const CLAVE_PAGINAS_RED = "os-paginas-v1";

/** Solo lo necesario para pintar (la caché persiste en localStorage: nada de campos de sobra). */
export interface PaginaRed { id: string; slug: string; name: string; kind: string; description: string; tags: string[]; accent: string; avatarUrl?: string; coverUrl?: string; memberCount: number; lat?: number | null; lng?: number | null; placeLabel?: string | null }

export async function cargarPaginasRed(): Promise<PaginaRed[]> {
    const paginas = await fetchPages();
    return paginas.filter((p: OsPage) => !p.isSample).map((p) => ({
        id: p.id, slug: p.slug, name: p.name, kind: p.kind, description: p.description ?? "", tags: p.tags ?? [], accent: p.accent,
        avatarUrl: p.avatarUrl, coverUrl: p.coverUrl, memberCount: p.memberCount ?? 0, lat: p.lat, lng: p.lng, placeLabel: p.placeLabel,
    }));
}

/** Lugares con coordenadas reales (páginas y grupos) y eventos con coordenadas, para el mapa. */
export interface PuntoRed { id: string; tipo: "evento" | "comunidad" | "grupo"; nombre: string; detalle: string; href: string; lat: number; lng: number; cuando?: string | null; gente?: number }

export async function cargarPuntosRed(): Promise<PuntoRed[]> {
    // Las páginas salen de la MISMA caché que los proyectos de la red: una sola lectura para los dos.
    const [paginas, grupos, eventos] = await Promise.all([
        cacheadoE(CLAVE_PAGINAS_RED, TTL_EXTERNO_MS, cargarPaginasRed),
        fetchGroups().catch(() => []),
        fetchEvents().catch(() => []),
    ]);
    const conGeo = (x: { lat?: number | null; lng?: number | null }) => typeof x.lat === "number" && typeof x.lng === "number" && Number.isFinite(x.lat) && Number.isFinite(x.lng);
    const puntos: PuntoRed[] = [];
    for (const p of paginas) if (conGeo(p)) puntos.push({ id: `p-${p.id}`, tipo: "comunidad", nombre: p.name, detalle: p.placeLabel || (p.kind === "comunidad" ? "Comunidad" : p.kind === "proyecto" ? "Proyecto" : "Página"), href: `/pagina/${p.slug}`, lat: p.lat as number, lng: p.lng as number, gente: p.memberCount });
    for (const g of grupos) if (!g.isSample && conGeo(g)) puntos.push({ id: `g-${g.id}`, tipo: "grupo", nombre: g.name, detalle: g.placeLabel || "Grupo", href: `/grupo/${g.slug}`, lat: g.lat as number, lng: g.lng as number, gente: g.memberCount });
    for (const e of eventos) if (!e.isSample && conGeo(e)) puntos.push({ id: `e-${e.id}`, tipo: "evento", nombre: e.title, detalle: e.placeLabel || e.location || "Evento", href: `/evento/${e.slug}`, lat: e.lat as number, lng: e.lng as number, cuando: e.startsAt });
    return puntos;
}
