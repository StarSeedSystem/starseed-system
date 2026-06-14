/**
 * geocoding.ts — Funciones puras de geocodificación usando servicios gratuitos sin API key.
 *
 * Fuentes:
 *  - Open-Meteo Geocoding API (búsqueda directa, CORS OK, sin key).
 *      https://geocoding-api.open-meteo.com/v1/search
 *      Devuelve nombre, país, admin1, lat, lon, timezone y elevation.
 *  - Nominatim (OpenStreetMap) para reverse geocoding (lat/lon -> nombre).
 *      https://nominatim.openstreetmap.org/reverse
 *
 * Todas las funciones usan AbortController para no colgar y devuelven valores
 * seguros (arrays vacíos / null) ante errores. No lanzan excepciones salvo que
 * se indique explícitamente.
 */

export interface GeoResult {
    lat: number;
    lon: number;
    /** Nombre legible corto, ej. "Cuernavaca, Morelos" */
    name: string;
    /** País (texto), si está disponible */
    country?: string;
    /** Código de país ISO (ej. "MX"), si está disponible */
    countryCode?: string;
    /** Región / estado de primer nivel, si está disponible */
    admin1?: string;
    /** Huso horario IANA, ej. "America/Mexico_City" */
    timezone?: string;
    /** Elevación en metros sobre el nivel del mar */
    elevation?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;

/** fetch con timeout vía AbortController. Devuelve null si falla o expira. */
async function safeFetch(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        return res;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Búsqueda directa de ubicaciones por texto usando Open-Meteo Geocoding.
 * Devuelve hasta `count` resultados reales. Array vacío ante error o sin resultados.
 */
export async function searchPlaces(query: string, count = 5): Promise<GeoResult[]> {
    const q = query.trim();
    if (!q) return [];

    const url =
        `https://geocoding-api.open-meteo.com/v1/search` +
        `?name=${encodeURIComponent(q)}&count=${count}&language=es&format=json`;

    const res = await safeFetch(url);
    if (!res) return [];

    try {
        const data = await res.json();
        const list: any[] = Array.isArray(data?.results) ? data.results : [];
        return list.map(formatOpenMeteoResult);
    } catch {
        return [];
    }
}

/** Construye un GeoResult a partir de un item de Open-Meteo. */
function formatOpenMeteoResult(item: any): GeoResult {
    const namePieces = [item?.name, item?.admin1].filter(
        (p: unknown): p is string => typeof p === 'string' && p.length > 0
    );
    return {
        lat: Number(item?.latitude),
        lon: Number(item?.longitude),
        name: namePieces.join(', ') || (item?.name ?? 'Ubicación'),
        country: typeof item?.country === 'string' ? item.country : undefined,
        countryCode: typeof item?.country_code === 'string' ? item.country_code : undefined,
        admin1: typeof item?.admin1 === 'string' ? item.admin1 : undefined,
        timezone: typeof item?.timezone === 'string' ? item.timezone : undefined,
        elevation: typeof item?.elevation === 'number' ? item.elevation : undefined,
    };
}

/**
 * Reverse geocoding (lat/lon -> nombre) usando Nominatim.
 * Devuelve un GeoResult con nombre legible o null ante error.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<GeoResult | null> {
    const url =
        `https://nominatim.openstreetmap.org/reverse` +
        `?lat=${lat}&lon=${lon}&format=json&accept-language=es&zoom=10`;

    const res = await safeFetch(url);
    if (!res) return null;

    try {
        const data = await res.json();
        const addr = data?.address ?? {};
        const place =
            addr.city ||
            addr.town ||
            addr.village ||
            addr.municipality ||
            addr.county ||
            addr.state ||
            'Tu ubicación';
        const region = addr.state && addr.state !== place ? addr.state : undefined;
        const name = region ? `${place}, ${region}` : place;

        return {
            lat,
            lon,
            name,
            country: typeof addr.country === 'string' ? addr.country : undefined,
            countryCode:
                typeof addr.country_code === 'string'
                    ? addr.country_code.toUpperCase()
                    : undefined,
            admin1: typeof addr.state === 'string' ? addr.state : undefined,
        };
    } catch {
        return null;
    }
}

/**
 * Enriquece un punto con timezone y elevation reales vía Open-Meteo Forecast API
 * (auto timezone + elevación del modelo). Útil tras geolocalización, donde
 * Nominatim no aporta estos campos. Devuelve {} ante error.
 */
export async function fetchTimezoneAndElevation(
    lat: number,
    lon: number
): Promise<{ timezone?: string; elevation?: number }> {
    const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=1&current=temperature_2m`;

    const res = await safeFetch(url);
    if (!res) return {};

    try {
        const data = await res.json();
        return {
            timezone: typeof data?.timezone === 'string' ? data.timezone : undefined,
            elevation: typeof data?.elevation === 'number' ? data.elevation : undefined,
        };
    } catch {
        return {};
    }
}
