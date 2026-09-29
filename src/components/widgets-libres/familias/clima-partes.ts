/**
 * Clima del inicio (ola 0929 · F): UNA petición por lugar cada 20 min como mucho, compartida
 * entre todas las instancias del widget y entre recargas (memoria + localStorage), con las
 * peticiones en vuelo deduplicadas. La fuente es la misma de siempre (`fetchWeatherData`:
 * Open-Meteo sin clave); si la respuesta no es real (sin «open-meteo» en `_sources`) se
 * recuerda solo 5 min y el widget dice «sin dato». Lo puro (código WMO, próximas horas, lluvia
 * a la vista) se prueba solo.
 */
import { fetchWeatherData } from "@/lib/weather-mock";

export type Cielo = "sol" | "luna" | "sol-nubes" | "luna-nubes" | "nubes" | "lluvia" | "tormenta" | "nieve" | "niebla";

/** Código WMO de Open-Meteo → estado del cielo (1-2: poco nuboso, con el astro asomando). */
export function cieloPorCodigo(codigo: number | undefined | null, esDia = true): Cielo | null {
    if (codigo === undefined || codigo === null || Number.isNaN(codigo)) return null;
    if (codigo === 0) return esDia ? "sol" : "luna";
    if (codigo <= 2) return esDia ? (codigo === 1 ? "sol" : "sol-nubes") : (codigo === 1 ? "luna" : "luna-nubes");
    if (codigo === 3) return "nubes";
    if (codigo === 45 || codigo === 48) return "niebla";
    if (codigo >= 95) return "tormenta";
    if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return "nieve";
    return "lluvia";
}

export const NOMBRE_CIELO: Record<Cielo, string> = {
    sol: "Despejado", luna: "Noche despejada", "sol-nubes": "Poco nuboso", "luna-nubes": "Noche con nubes", nubes: "Nublado",
    lluvia: "Lluvia", tormenta: "Tormenta", nieve: "Nieve", niebla: "Niebla",
};

export interface DatosClima {
    current?: Record<string, number | undefined>;
    daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[]; sunrise?: string[]; sunset?: string[] };
    hourly?: { time?: string[]; temperature_2m?: number[]; precipitation_probability?: number[] };
}

export interface Instantanea { t: number; clave: string; real: boolean; datos: DatosClima | null }

const CLAVE_LS = "starseed.inicio.clima.v1";
export const TTL_REAL_MS = 20 * 60_000;
export const TTL_FALLO_MS = 5 * 60_000;
/** Refresco mientras se ve: cada 30 min (nunca menos de 15). */
export const REFRESCO_MS = 30 * 60_000;

const memoria = new Map<string, Instantanea>();
const enVuelo = new Map<string, Promise<Instantanea>>();

export const claveCoords = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;
export const fresca = (x: Instantanea | undefined, ahora: number) => !!x && ahora - x.t < (x.real ? TTL_REAL_MS : TTL_FALLO_MS);

function leerLS(): Record<string, Instantanea> {
    try { return JSON.parse(localStorage.getItem(CLAVE_LS) || "{}") ?? {}; } catch { return {}; }
}
function escribirLS(x: Instantanea): void {
    try {
        const todo = { ...leerLS(), [x.clave]: x };
        // Solo los cuatro lugares más recientes: el almacén no crece.
        const quedan = Object.values(todo).sort((a, b) => b.t - a.t).slice(0, 4);
        localStorage.setItem(CLAVE_LS, JSON.stringify(Object.fromEntries(quedan.map((i) => [i.clave, i]))));
    } catch { /* sin almacén: queda la memoria */ }
}

/** Lo último guardado para ese lugar (fresco o no), sin red. */
export function climaGuardado(lat: number, lon: number): Instantanea | null {
    const k = claveCoords(lat, lon);
    return memoria.get(k) ?? leerLS()[k] ?? null;
}

/** Solo lo que el widget pinta (el resto de la respuesta no se guarda). */
function recortar(j: unknown): DatosClima | null {
    const t = (j as { terrestrial?: DatosClima })?.terrestrial ?? (j as DatosClima);
    if (!t) return null;
    return { current: t.current, daily: t.daily, hourly: t.hourly };
}

/** El clima de ese lugar: de la memoria o el almacén si está fresco; si no, UNA petición. */
export async function climaCompartido(lat: number, lon: number, opciones: { forzar?: boolean } = {}): Promise<Instantanea> {
    const clave = claveCoords(lat, lon), ahora = Date.now();
    if (!opciones.forzar) {
        const m = memoria.get(clave);
        if (fresca(m, ahora)) return m!;
        const g = leerLS()[clave];
        if (fresca(g, ahora)) { memoria.set(clave, g); return g; }
    }
    const vuelo = enVuelo.get(clave);
    if (vuelo) return vuelo;
    const p = fetchWeatherData(lat, lon)
        .then((j: { _sources?: unknown }) => {
            const real = !Array.isArray(j?._sources) || (j._sources as string[]).includes("open-meteo");
            return { t: Date.now(), clave, real, datos: real ? recortar(j) : null };
        })
        .catch(() => ({ t: Date.now(), clave, real: false, datos: null }))
        .then((x: Instantanea) => { memoria.set(clave, x); escribirLS(x); enVuelo.delete(clave); return x; });
    enVuelo.set(clave, p);
    return p;
}

/** Solo pruebas: olvida la memoria y lo que hay en vuelo. */
export function _olvidarClima(): void {
    memoria.clear();
    enVuelo.clear();
}

/** Las próximas `n` horas: hora, temperatura y probabilidad de lluvia. */
export function proximasHoras(d: DatosClima | null, n = 12): { hora: string; temp: number; lluvia: number | null }[] {
    const h = d?.hourly;
    if (!h?.time || !h.temperature_2m) return [];
    return h.time.slice(0, n).map((hora, i) => ({ hora, temp: h.temperature_2m![i], lluvia: typeof h.precipitation_probability?.[i] === "number" ? h.precipitation_probability![i] : null }))
        .filter((x) => typeof x.temp === "number");
}

/** «Lluvia probable a las 17:00» si alguna de las próximas horas pasa del 50 %. */
export function avisoLluvia(horas: { hora: string; lluvia: number | null }[], umbral = 50): string | null {
    const h = horas.find((x) => (x.lluvia ?? 0) >= umbral);
    return h ? `Lluvia probable a las ${h.hora} (${h.lluvia} %)` : null;
}

/** Los próximos días (sin hoy): día, máxima, mínima y lluvia. */
export function proximosDias(d: DatosClima | null, n = 4): { dia: string; max: number; min: number; lluvia: number | null }[] {
    const x = d?.daily;
    if (!x?.time || !x.temperature_2m_max || !x.temperature_2m_min) return [];
    return x.time.slice(1, 1 + n).map((dia, i) => ({
        dia, max: x.temperature_2m_max![i + 1], min: x.temperature_2m_min![i + 1],
        lluvia: typeof x.precipitation_probability_max?.[i + 1] === "number" ? x.precipitation_probability_max![i + 1] : null,
    })).filter((y) => typeof y.max === "number" && typeof y.min === "number");
}

/** Rumbo del viento en palabras (N, NE, E…). */
export function rumbo(grados: number | undefined): string {
    if (typeof grados !== "number") return "";
    return ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(((grados % 360) + 360) % 360 / 45) % 8];
}
