/**
 * Datos del mapa del clima (PURO, sin React ni Leaflet): el radar de lluvia de RainViewer y una
 * rejilla de puntos de Open-Meteo alrededor de tu sitio para las capas de temperatura y viento.
 * Las dos son públicas y SIN clave (la versión anterior llevaba una clave de OpenWeatherMap
 * escrita en el código: fuera). Una petición por fuente, compartida y cacheada ≥ 15 min.
 */
import { claveCoordenadas, crearFuente, pedirJson } from "./cache-compartida";
import { num } from "./open-meteo";

// ── Radar (RainViewer) ────────────────────────────────────────────────

export interface FotoRadar { t: number; ruta: string }
export interface DatosRadar { host: string; fotos: FotoRadar[] }

export const URL_RADAR = "https://api.rainviewer.com/public/weather-maps.json";

export function analizarRadar(j: unknown): DatosRadar {
    const r = (j ?? {}) as { host?: unknown; radar?: { past?: unknown } };
    const host = typeof r.host === "string" && r.host.startsWith("https://") ? r.host : "https://tilecache.rainviewer.com";
    const pasadas = Array.isArray(r.radar?.past) ? (r.radar?.past as unknown[]) : [];
    const fotos = pasadas
        .map((f) => {
            const o = (f ?? {}) as { time?: unknown; path?: unknown };
            const t = num(o.time);
            if (t === null) return null;
            const ruta = typeof o.path === "string" && /^\/v2\/radar\/[\w-]+$/.test(o.path) ? o.path : `/v2/radar/${t}`;
            return { t: t * 1000, ruta };
        })
        .filter((f): f is FotoRadar => f !== null)
        .sort((a, b) => a.t - b.t);
    if (!fotos.length) throw new Error("RainViewer respondió sin imágenes de radar");
    return { host, fotos };
}

/** Plantilla de teselas de una foto (esquema de color 4, suavizado y nieve). */
export function urlTeselaRadar(d: DatosRadar, f: FotoRadar): string {
    return `${d.host}${f.ruta}/256/{z}/{x}/{y}/4/1_1.png`;
}

export const fuenteRadar = crearFuente<"global", DatosRadar>({
    nombre: "radar",
    ttlMs: 15 * 60_000,
    clave: () => "global",
    cargar: async (_a, senal) => analizarRadar(await pedirJson(URL_RADAR, senal)),
});

// ── Rejilla de Open-Meteo ─────────────────────────────────────────────

export interface Coordenada { lat: number; lon: number }
export interface PuntoRejilla extends Coordenada { temp: number | null; viento: number | null; dir: number | null; codigo: number | null }

/** Centro redondeado a medio grado: vecinos cercanos comparten la misma rejilla y la misma caché. */
export function centroRejilla(lat: number, lon: number): Coordenada {
    return { lat: Math.round(lat * 2) / 2, lon: Math.round(lon * 2) / 2 };
}

/** `n × n` puntos separados `paso` grados alrededor del centro (latitud acotada a ±85°). */
export function rejillaAlrededor(c: Coordenada, n = 5, paso = 0.8): Coordenada[] {
    const mitad = (n - 1) / 2;
    const puntos: Coordenada[] = [];
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < n; k++) {
            const lat = Math.max(-85, Math.min(85, c.lat + (i - mitad) * paso));
            let lon = c.lon + (k - mitad) * paso;
            if (lon > 180) lon -= 360;
            if (lon < -180) lon += 360;
            puntos.push({ lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 });
        }
    }
    return puntos;
}

export function urlRejilla(puntos: Coordenada[]): string {
    return "https://api.open-meteo.com/v1/forecast"
        + `?latitude=${puntos.map((p) => p.lat).join(",")}&longitude=${puntos.map((p) => p.lon).join(",")}`
        + "&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code&timezone=auto";
}

/** Open-Meteo devuelve una lista (varios puntos) o un objeto (uno); falta = null. */
export function analizarRejilla(j: unknown, puntos: Coordenada[]): PuntoRejilla[] {
    const lista = Array.isArray(j) ? j : [j];
    if (!lista.length) throw new Error("Open-Meteo no trajo la rejilla");
    return puntos.map((p, i) => {
        const c = ((lista[i] ?? {}) as { current?: Record<string, unknown> }).current ?? {};
        return { ...p, temp: num(c.temperature_2m), viento: num(c.wind_speed_10m), dir: num(c.wind_direction_10m), codigo: num(c.weather_code) };
    });
}

export const fuenteRejilla = crearFuente<Coordenada, PuntoRejilla[]>({
    nombre: "rejilla",
    ttlMs: 30 * 60_000,
    clave: (c) => claveCoordenadas(c.lat, c.lon, 1),
    cargar: async (c, senal) => {
        const puntos = rejillaAlrededor(c);
        return analizarRejilla(await pedirJson(urlRejilla(puntos), senal), puntos);
    },
});

/** Rumbo hacia el que SOPLA el viento (la meteorología da de dónde viene). */
export function rumboHacia(dir: number | null): number | null {
    return dir === null ? null : (dir + 180) % 360;
}
