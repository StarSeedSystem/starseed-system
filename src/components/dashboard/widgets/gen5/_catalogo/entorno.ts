"use client";
/**
 * Tu entorno REAL (Ola 0929-C): lo que hay a pie de tu lugar según OpenStreetMap (Overpass,
 * libre y sin clave). Una sola consulta por zona (~1 km) cada 12 h, compartida entre el Radar de
 * Abundancia (lo gratuito y común: agua, libros, huertos, reparar, compartir…) y el Flujo de
 * Tránsito (paradas, estaciones, bicis y coches compartidos), y solo con el widget a la vista.
 *
 * Datos © colaboradores de OpenStreetMap (ODbL): los widgets lo citan.
 */
import * as React from "react";
import { useLugar, type Lugar } from "./meteo";
import { useCompartido, type EstadoCompartido } from "./recurso";

export type TipoSitio =
    | "agua" | "libros" | "compartir" | "reparar" | "salud" | "huerto" | "encuentro" | "aseo"
    | "bus" | "metro" | "tren" | "tranvia" | "bici" | "coche";

export const COMUNES: TipoSitio[] = ["agua", "libros", "compartir", "reparar", "huerto", "encuentro", "salud", "aseo"];
export const MOVILIDAD: TipoSitio[] = ["metro", "tren", "tranvia", "bus", "bici", "coche"];

export interface Sitio {
    /** «node/123», «way/45»… (id de OpenStreetMap). */
    id: string;
    tipo: TipoSitio;
    nombre: string | null;
    lat: number;
    lon: number;
    /** Línea, operador o referencia útil, si la hay. */
    detalle: string | null;
}

export interface SitioCerca extends Sitio {
    /** Metros en línea recta. */
    dist: number;
    /** Rumbo desde ti, en grados (0 = norte, sentido horario). */
    rumbo: number;
}

/** Radio de la consulta alrededor del centro de la zona (cubre ~1 km alrededor de ti). */
export const RADIO_M = 1600;
/** Hasta dónde enseñan los widgets («a pie»). */
export const ALCANCE_M = 1000;
export const TTL_ENTORNO_MS = 12 * 3_600_000;
export const URL_OVERPASS = "https://overpass-api.de/api/interpreter";

export function consultaEntorno(lat: number, lon: number, radio = RADIO_M): string {
    const a = `(around:${radio},${lat.toFixed(5)},${lon.toFixed(5)})`;
    return `[out:json][timeout:20];(`
        + `node${a}[amenity=drinking_water];node${a}[amenity=public_bookcase];nwr${a}[amenity=library];`
        + `node${a}[amenity=give_box];nwr${a}[amenity=food_sharing];nwr${a}[social_facility=food_bank];`
        + `node${a}[amenity=bicycle_repair_station];nwr${a}[repair=assisted_self_service];`
        + `node${a}[emergency=defibrillator];nwr${a}[leisure=garden]["garden:type"=community];nwr${a}[amenity=community_centre];`
        + `nwr${a}[amenity=toilets][fee=no];`
        + `node${a}[highway=bus_stop];node${a}[railway=tram_stop];nwr${a}[railway=station];node${a}[railway=halt];`
        + `node${a}[railway=subway_entrance];node${a}[amenity=bicycle_rental];node${a}[amenity=car_sharing];`
        + `);out center 400;`;
}

/** Qué es un elemento de OSM, por sus etiquetas (null = no nos interesa). */
export function tipoDeEtiquetas(t: Record<string, string>): TipoSitio | null {
    if (t.amenity === "drinking_water") return "agua";
    if (t.amenity === "public_bookcase" || t.amenity === "library") return "libros";
    if (t.amenity === "give_box" || t.amenity === "food_sharing" || t.social_facility === "food_bank") return "compartir";
    if (t.amenity === "bicycle_repair_station" || t.repair === "assisted_self_service") return "reparar";
    if (t.emergency === "defibrillator") return "salud";
    if (t.leisure === "garden" && t["garden:type"] === "community") return "huerto";
    if (t.amenity === "community_centre") return "encuentro";
    if (t.amenity === "toilets") return "aseo";
    if (t.railway === "subway_entrance" || t.station === "subway" || t.subway === "yes") return "metro";
    if (t.railway === "tram_stop") return "tranvia";
    if (t.railway === "station" || t.railway === "halt") return "tren";
    if (t.highway === "bus_stop") return "bus";
    if (t.amenity === "bicycle_rental") return "bici";
    if (t.amenity === "car_sharing") return "coche";
    return null;
}

export function analizarEntorno(j: unknown): Sitio[] {
    const els = (j as { elements?: unknown })?.elements;
    if (!Array.isArray(els)) throw new Error("La fuente no respondió con lugares");
    const out: Sitio[] = [];
    for (const e of els as Array<Record<string, any>>) {
        const t = (e?.tags ?? {}) as Record<string, string>;
        const tipo = tipoDeEtiquetas(t);
        const lat = typeof e.lat === "number" ? e.lat : e.center?.lat;
        const lon = typeof e.lon === "number" ? e.lon : e.center?.lon;
        if (!tipo || typeof lat !== "number" || typeof lon !== "number") continue;
        const nombre = (t.name || t["name:es"] || "").trim() || null;
        const detalle = (t.route_ref || t.ref || t.network || t.operator || "").trim() || null;
        out.push({ id: `${e.type}/${e.id}`, tipo, nombre, lat, lon, detalle: detalle ? detalle.slice(0, 60) : null });
    }
    return out;
}

const R = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;

export function distancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function rumbo(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
    const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Distancia y rumbo desde ti, ordenado por cercanía, y sin duplicados de parada (las dos
 * aceras de la misma parada, con el mismo nombre y tipo, cuentan una vez: la más cercana).
 */
export function cercanos(sitios: Sitio[], lat: number, lon: number): SitioCerca[] {
    const con = sitios.map((s) => ({ ...s, dist: distancia(lat, lon, s.lat, s.lon), rumbo: rumbo(lat, lon, s.lat, s.lon) }))
        .sort((a, b) => a.dist - b.dist);
    const vistos = new Set<string>();
    return con.filter((s) => {
        if (!s.nombre || !MOVILIDAD.includes(s.tipo)) return true;
        const k = `${s.tipo}|${s.nombre.toLowerCase()}`;
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
    });
}

/** Minutos a pie (80 m/min, con un 25 % extra porque las calles no van en línea recta). */
export function minutosAPie(m: number): number {
    return Math.max(1, Math.round((m * 1.25) / 80));
}

export function distanciaTexto(m: number): string {
    return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} km`;
}

export function urlOsm(s: Pick<Sitio, "id">): string {
    return `https://www.openstreetmap.org/${s.id}`;
}

async function traer(lat: number, lon: number): Promise<Sitio[]> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 25_000);
    try {
        const res = await fetch(`${URL_OVERPASS}?data=${encodeURIComponent(consultaEntorno(lat, lon))}`, { signal: ctl.signal });
        if (!res.ok) throw new Error(`La fuente respondió ${res.status}`);
        return analizarEntorno(await res.json());
    } finally {
        clearTimeout(t);
    }
}

export interface EstadoEntorno extends EstadoCompartido<Sitio[]> {
    lugar: Lugar | null;
    /** Ordenado por cercanía a tu lugar (vacío mientras no hay datos). */
    cerca: SitioCerca[];
}

/** Tu entorno a pie (compartido). La zona se redondea a ~1 km para compartir la consulta. */
export function useEntorno(activo: boolean): EstadoEntorno {
    const lugar = useLugar();
    const zLat = lugar ? Math.round(lugar.lat * 100) / 100 : null;
    const zLon = lugar ? Math.round(lugar.lon * 100) / 100 : null;
    const clave = zLat !== null && zLon !== null ? `entorno:${zLat.toFixed(2)},${zLon.toFixed(2)}` : null;
    const r = useCompartido<Sitio[]>(clave, TTL_ENTORNO_MS, () => traer(zLat!, zLon!), activo);
    const lat = lugar?.lat, lon = lugar?.lon;
    const cerca = React.useMemo(() => (r.datos && lat !== undefined && lon !== undefined ? cercanos(r.datos, lat, lon).filter((s) => s.dist <= ALCANCE_M * 1.2) : []), [r.datos, lat, lon]);
    return { ...r, lugar, cerca };
}
