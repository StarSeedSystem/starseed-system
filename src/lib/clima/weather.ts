// ════════════════════════════════════════════════════════════════════════════
// lib/clima/weather.ts — Helpers de clima terrestre (Open-Meteo, sin API key)
// ----------------------------------------------------------------------------
// Funciones puras de fetch para la sección "Tiempo de clima" (/clima):
//   • fetchForecast(lat, lon)  → clima actual + 24h por hora + 7 días.
//   • searchCity(name)         → geocodificación directa (Open-Meteo Geocoding).
//   • describeWeather(code)    → mapa WMO weather_code → icono + texto (ES).
//
// Todo tolerante: AbortController para no colgar, try/catch, valores seguros
// (null / []) ante error. No depende de `window` (SSR-safe). Sin claves.
// ════════════════════════════════════════════════════════════════════════════

// ───────────────────────────── Tipos ────────────────────────────────────────

export interface ClimaCurrent {
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    precipitation: number;
    weatherCode: number;
    windSpeed: number;
    isDay: boolean;
}

export interface ClimaHour {
    /** ISO time del modelo (timezone local de la ubicación) */
    time: string;
    temperature: number;
    weatherCode: number;
}

export interface ClimaDay {
    /** ISO date (YYYY-MM-DD) */
    date: string;
    weatherCode: number;
    tempMax: number;
    tempMin: number;
}

export interface ClimaForecast {
    latitude: number;
    longitude: number;
    timezone: string;
    current: ClimaCurrent;
    hourly: ClimaHour[];
    daily: ClimaDay[];
    fetchedAt: string;
}

export interface ClimaPlace {
    lat: number;
    lon: number;
    /** Nombre legible corto, ej. "Cuernavaca, Morelos" */
    name: string;
    country?: string;
    countryCode?: string;
    admin1?: string;
    timezone?: string;
}

// ─────────────────────────── fetch con timeout ──────────────────────────────

const DEFAULT_TIMEOUT_MS = 8000;

async function fetchJson<T = unknown>(
    url: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ─────────────────────────── Pronóstico actual ──────────────────────────────

interface OpenMeteoResponse {
    latitude?: number;
    longitude?: number;
    timezone?: string;
    current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        apparent_temperature?: number;
        is_day?: number;
        precipitation?: number;
        weather_code?: number;
        wind_speed_10m?: number;
    };
    hourly?: {
        time?: string[];
        temperature_2m?: number[];
        weather_code?: number[];
    };
    daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
    };
}

const num = (v: unknown, fallback = 0): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * Clima REAL desde Open-Meteo Forecast: actual + 24h por hora (desde la hora
 * actual) + 7 días. Devuelve null si la red falla por completo.
 */
export async function fetchForecast(
    lat: number,
    lon: number,
): Promise<ClimaForecast | null> {
    const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m` +
        `&hourly=temperature_2m,weather_code` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
        `&timezone=auto`;

    const data = await fetchJson<OpenMeteoResponse>(url);
    if (!data || !data.current) return null;

    const c = data.current;
    const current: ClimaCurrent = {
        temperature: num(c.temperature_2m),
        apparentTemperature: num(c.apparent_temperature, num(c.temperature_2m)),
        humidity: num(c.relative_humidity_2m),
        precipitation: num(c.precipitation),
        weatherCode: num(c.weather_code),
        windSpeed: num(c.wind_speed_10m),
        isDay: num(c.is_day, 1) === 1,
    };

    // ── Horario: 24 horas desde la hora actual ──
    const hourly: ClimaHour[] = [];
    const hTimes = data.hourly?.time ?? [];
    const hTemp = data.hourly?.temperature_2m ?? [];
    const hCode = data.hourly?.weather_code ?? [];
    if (hTimes.length) {
        const now = Date.now();
        let start = hTimes.findIndex((t) => new Date(t).getTime() >= now - 3600000);
        if (start < 0) start = 0;
        const end = Math.min(start + 24, hTimes.length);
        for (let i = start; i < end; i++) {
            hourly.push({
                time: hTimes[i],
                temperature: num(hTemp[i]),
                weatherCode: num(hCode[i]),
            });
        }
    }

    // ── Diario: hasta 7 días ──
    const daily: ClimaDay[] = [];
    const dTimes = data.daily?.time ?? [];
    const dCode = data.daily?.weather_code ?? [];
    const dMax = data.daily?.temperature_2m_max ?? [];
    const dMin = data.daily?.temperature_2m_min ?? [];
    for (let i = 0; i < dTimes.length && i < 7; i++) {
        daily.push({
            date: dTimes[i],
            weatherCode: num(dCode[i]),
            tempMax: num(dMax[i]),
            tempMin: num(dMin[i]),
        });
    }

    return {
        latitude: num(data.latitude, lat),
        longitude: num(data.longitude, lon),
        timezone: typeof data.timezone === "string" ? data.timezone : "auto",
        current,
        hourly,
        daily,
        fetchedAt: new Date().toISOString(),
    };
}

// ─────────────────────────── Búsqueda de ciudad ─────────────────────────────

interface GeoApiItem {
    name?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    country_code?: string;
    admin1?: string;
    timezone?: string;
}

/**
 * Geocodificación directa por texto (Open-Meteo Geocoding, sin key).
 * Devuelve hasta `count` resultados; array vacío ante error o sin resultados.
 */
export async function searchCity(name: string, count = 6): Promise<ClimaPlace[]> {
    const q = name.trim();
    if (!q) return [];

    const url =
        `https://geocoding-api.open-meteo.com/v1/search` +
        `?name=${encodeURIComponent(q)}&count=${count}&language=es&format=json`;

    const data = await fetchJson<{ results?: GeoApiItem[] }>(url);
    const list = Array.isArray(data?.results) ? data!.results! : [];

    return list
        .filter((it) => typeof it.latitude === "number" && typeof it.longitude === "number")
        .map((it) => {
            const pieces = [it.name, it.admin1].filter(
                (p): p is string => typeof p === "string" && p.length > 0,
            );
            return {
                lat: num(it.latitude),
                lon: num(it.longitude),
                name: pieces.join(", ") || (it.name ?? "Ubicación"),
                country: typeof it.country === "string" ? it.country : undefined,
                countryCode: typeof it.country_code === "string" ? it.country_code : undefined,
                admin1: typeof it.admin1 === "string" ? it.admin1 : undefined,
                timezone: typeof it.timezone === "string" ? it.timezone : undefined,
            } satisfies ClimaPlace;
        });
}

// ──────────────────────── Mapa WMO weather_code ─────────────────────────────
// Claves de icono = nombres de lucide-react garantizados en la versión usada.
// El panel resuelve la clave → componente con un ICON_MAP propio.

export type ClimaIconKey =
    | "Sun" | "Moon" | "CloudSun" | "CloudMoon" | "Cloud" | "Cloudy"
    | "CloudFog" | "CloudDrizzle" | "CloudRain" | "CloudSnow" | "Snowflake"
    | "CloudLightning";

export interface ClimaCondition {
    /** Descripción en español, ej. "Parcialmente nublado" */
    label: string;
    /** Clave de icono diurno */
    icon: ClimaIconKey;
    /** Clave de icono nocturno (variante) */
    iconNight: ClimaIconKey;
    /** Acento de color sugerido (hex/tailwind-friendly) */
    accent: string;
}

/**
 * Traduce un código WMO (`weather_code`) a descripción + iconos + acento.
 * Cobertura completa de la tabla WMO de Open-Meteo. Fallback elegante.
 */
export function describeWeather(code: number): ClimaCondition {
    const map: Record<number, ClimaCondition> = {
        0: { label: "Despejado", icon: "Sun", iconNight: "Moon", accent: "#fbbf24" },
        1: { label: "Mayormente despejado", icon: "CloudSun", iconNight: "CloudMoon", accent: "#fcd34d" },
        2: { label: "Parcialmente nublado", icon: "CloudSun", iconNight: "CloudMoon", accent: "#cbd5e1" },
        3: { label: "Nublado", icon: "Cloudy", iconNight: "Cloudy", accent: "#94a3b8" },
        45: { label: "Niebla", icon: "CloudFog", iconNight: "CloudFog", accent: "#a3b8cc" },
        48: { label: "Niebla con escarcha", icon: "CloudFog", iconNight: "CloudFog", accent: "#a3b8cc" },
        51: { label: "Llovizna ligera", icon: "CloudDrizzle", iconNight: "CloudDrizzle", accent: "#7dd3fc" },
        53: { label: "Llovizna moderada", icon: "CloudDrizzle", iconNight: "CloudDrizzle", accent: "#38bdf8" },
        55: { label: "Llovizna intensa", icon: "CloudDrizzle", iconNight: "CloudDrizzle", accent: "#0ea5e9" },
        56: { label: "Llovizna helada ligera", icon: "CloudDrizzle", iconNight: "CloudDrizzle", accent: "#67e8f9" },
        57: { label: "Llovizna helada intensa", icon: "CloudDrizzle", iconNight: "CloudDrizzle", accent: "#22d3ee" },
        61: { label: "Lluvia ligera", icon: "CloudRain", iconNight: "CloudRain", accent: "#60a5fa" },
        63: { label: "Lluvia moderada", icon: "CloudRain", iconNight: "CloudRain", accent: "#3b82f6" },
        65: { label: "Lluvia fuerte", icon: "CloudRain", iconNight: "CloudRain", accent: "#2563eb" },
        66: { label: "Lluvia helada ligera", icon: "CloudRain", iconNight: "CloudRain", accent: "#38bdf8" },
        67: { label: "Lluvia helada fuerte", icon: "CloudRain", iconNight: "CloudRain", accent: "#0ea5e9" },
        71: { label: "Nevada ligera", icon: "CloudSnow", iconNight: "CloudSnow", accent: "#e0f2fe" },
        73: { label: "Nevada moderada", icon: "CloudSnow", iconNight: "CloudSnow", accent: "#bae6fd" },
        75: { label: "Nevada fuerte", icon: "CloudSnow", iconNight: "CloudSnow", accent: "#7dd3fc" },
        77: { label: "Granos de nieve", icon: "Snowflake", iconNight: "Snowflake", accent: "#e0f2fe" },
        80: { label: "Chubascos ligeros", icon: "CloudRain", iconNight: "CloudRain", accent: "#60a5fa" },
        81: { label: "Chubascos moderados", icon: "CloudRain", iconNight: "CloudRain", accent: "#3b82f6" },
        82: { label: "Chubascos violentos", icon: "CloudRain", iconNight: "CloudRain", accent: "#1d4ed8" },
        85: { label: "Chubascos de nieve ligeros", icon: "CloudSnow", iconNight: "CloudSnow", accent: "#bae6fd" },
        86: { label: "Chubascos de nieve fuertes", icon: "CloudSnow", iconNight: "CloudSnow", accent: "#7dd3fc" },
        95: { label: "Tormenta", icon: "CloudLightning", iconNight: "CloudLightning", accent: "#a78bfa" },
        96: { label: "Tormenta con granizo ligero", icon: "CloudLightning", iconNight: "CloudLightning", accent: "#8b5cf6" },
        99: { label: "Tormenta con granizo fuerte", icon: "CloudLightning", iconNight: "CloudLightning", accent: "#7c3aed" },
    };
    return (
        map[code] ?? {
            label: "Sin datos",
            icon: "Cloud",
            iconNight: "Cloud",
            accent: "#94a3b8",
        }
    );
}

// ─────────────────────────── Formateadores ──────────────────────────────────

/** Hora corta local (ej. "14:00") a partir de un ISO o "YYYY-MM-DDTHH:mm". */
export function formatHour(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        const m = /T(\d{2}:\d{2})/.exec(iso);
        return m ? m[1] : "—";
    }
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/** Día abreviado (ej. "lun") a partir de un ISO date; "Hoy" para la fecha actual. */
export function formatWeekday(isoDate: string, index: number): string {
    if (index === 0) return "Hoy";
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-ES", { weekday: "short" });
}

/** Redondea una temperatura a entero con símbolo de grados. */
export function formatTemp(t: number): string {
    return `${Math.round(t)}°`;
}
