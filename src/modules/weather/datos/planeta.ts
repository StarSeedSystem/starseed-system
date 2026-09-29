/**
 * Datos oficiales del planeta y del espacio (sin clave, CORS abierto): sismos de USGS y
 * noticias espaciales de Spaceflight News API. Mismo patrón que el resto: analizadores PUROS
 * y fuentes compartidas con caché ≥ 15 min.
 */
import { crearFuente, pedirJson } from "./cache-compartida";
import { num } from "./open-meteo";

export interface Sismo { id: string; t: number; magnitud: number; lugar: string; url: string | null; lat: number; lon: number; profundidad: number | null; tsunami: boolean; alerta: string | null }
export interface Noticia { id: string; titulo: string; url: string; medio: string; t: number; resumen: string | null }

export function analizarSismos(j: unknown): Sismo[] {
    const f = (j as { features?: unknown })?.features;
    if (!Array.isArray(f)) throw new Error("USGS devolvió un formato inesperado");
    const lista: Sismo[] = [];
    for (const x of f) {
        const p = (x as { properties?: Record<string, unknown> })?.properties ?? {};
        const c = ((x as { geometry?: { coordinates?: unknown[] } })?.geometry?.coordinates ?? []) as unknown[];
        const mag = num(p.mag), t = num(p.time), lon = num(c[0]), lat = num(c[1]);
        if (mag === null || t === null || lat === null || lon === null) continue;
        const url = typeof p.url === "string" && /^https:\/\//.test(p.url) ? p.url : null;
        lista.push({
            id: String((x as { id?: unknown }).id ?? `${t}-${lat}-${lon}`), t, magnitud: mag, lugar: typeof p.place === "string" ? p.place : "Lugar sin nombre",
            url, lat, lon, profundidad: num(c[2]), tsunami: p.tsunami === 1, alerta: typeof p.alert === "string" ? p.alert : null,
        });
    }
    return lista.sort((a, b) => b.t - a.t);
}

export function analizarNoticias(j: unknown): Noticia[] {
    const r = (j as { results?: unknown })?.results;
    if (!Array.isArray(r)) throw new Error("Spaceflight News devolvió un formato inesperado");
    return r.flatMap((x) => {
        const o = x as Record<string, unknown>;
        const url = typeof o.url === "string" && /^https:\/\//.test(o.url) ? o.url : null;
        const t = typeof o.published_at === "string" ? Date.parse(o.published_at) : NaN;
        if (!url || typeof o.title !== "string" || !Number.isFinite(t)) return [];
        return [{ id: String(o.id ?? url), titulo: o.title, url, medio: typeof o.news_site === "string" ? o.news_site : "", t, resumen: typeof o.summary === "string" ? o.summary : null }];
    });
}

/** Distancia de gran círculo (km). */
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function colorMagnitud(m: number): string {
    return m >= 7 ? "#d946ef" : m >= 6 ? "#f43f5e" : m >= 5 ? "#fb923c" : "#facc15";
}

export const fuenteSismos = crearFuente<void, Sismo[]>({
    nombre: "sismos",
    ttlMs: 15 * 60_000,
    clave: () => "m45-dia",
    cargar: async (_a, senal) => analizarSismos(await pedirJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson", senal)),
});

export const fuenteNoticiasEspacio = crearFuente<void, Noticia[]>({
    nombre: "noticias-espacio",
    ttlMs: 30 * 60_000,
    clave: () => "ultimas",
    cargar: async (_a, senal) => analizarNoticias(await pedirJson("https://api.spaceflightnewsapi.net/v4/articles/?limit=8", senal)),
});
