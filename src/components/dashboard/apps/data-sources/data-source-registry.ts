// ════════════════════════════════════════════════════════════════
// StarSeed OS — Registro de Fuentes de Datos Oficiales (tiempo real)
// ----------------------------------------------------------------
// Cada DataSource hace fetch REAL a una API pública SIN clave y con
// CORS abierto. Los fetchers parsean de forma DEFENSIVA y, si algo
// falla, LANZAN un error (el hook lo captura y muestra "fuente no
// disponible" + reintentar). La atribución de la fuente es OBLIGATORIA
// y se muestra siempre en el pie del widget (transparencia de origen).
//
// Fuentes (todas no-key, CORS abierto a 2024-2026):
//   • open-meteo       — Clima            (Open-Meteo)
//   • noaa-kp          — Clima espacial   (NOAA SWPC)
//   • usgs-quakes      — Sismos           (USGS)
//   • spaceflight-news — Ciencia/Espacio  (Spaceflight News API)
// ════════════════════════════════════════════════════════════════

export interface DataPoint {
    label: string;
    value: string;
    unit?: string;
    detail?: string;
}

export interface DataSource {
    id: string;
    label: string;
    category: string;
    /** Atribución de la fuente (mostrada SIEMPRE). */
    attribution: string;
    /** Periodo sugerido de auto-refresco en ms. */
    refreshMs: number;
    fetcher: () => Promise<DataPoint[]>;
}

// ── Helpers ──────────────────────────────────────────────────────
async function fetchJson(url: string): Promise<unknown> {
    const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function asNumber(v: unknown): number | null {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
}

function fmt(n: number, decimals = 1): string {
    return n.toLocaleString("es-ES", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    });
}

// Open-Meteo WMO weather codes → etiqueta breve en español.
function weatherCodeLabel(code: number | null): string {
    if (code === null) return "—";
    if (code === 0) return "Despejado";
    if (code <= 3) return "Parcialmente nublado";
    if (code <= 48) return "Niebla";
    if (code <= 57) return "Llovizna";
    if (code <= 67) return "Lluvia";
    if (code <= 77) return "Nieve";
    if (code <= 82) return "Chubascos";
    if (code <= 86) return "Chubascos de nieve";
    if (code <= 99) return "Tormenta";
    return "—";
}

// ── Fetchers ─────────────────────────────────────────────────────
async function fetchOpenMeteo(): Promise<DataPoint[]> {
    const data = (await fetchJson(
        "https://api.open-meteo.com/v1/forecast?latitude=40.4168&longitude=-3.7038&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
    )) as { current?: Record<string, unknown> };
    const c = data?.current;
    if (!c || typeof c !== "object") throw new Error("Respuesta sin datos actuales");
    const temp = asNumber(c.temperature_2m);
    const hum = asNumber(c.relative_humidity_2m);
    const wind = asNumber(c.wind_speed_10m);
    const code = asNumber(c.weather_code);
    const points: DataPoint[] = [];
    if (temp !== null) points.push({ label: "Temperatura", value: fmt(temp), unit: "°C", detail: weatherCodeLabel(code) });
    if (hum !== null) points.push({ label: "Humedad", value: fmt(hum, 0), unit: "%" });
    if (wind !== null) points.push({ label: "Viento", value: fmt(wind), unit: "km/h" });
    if (!points.length) throw new Error("Sin métricas legibles");
    return points;
}

async function fetchNoaaKp(): Promise<DataPoint[]> {
    const rows = (await fetchJson(
        "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
    )) as unknown;
    if (!Array.isArray(rows) || rows.length < 2) throw new Error("Sin filas de Kp");
    // La primera fila es la cabecera; tomamos las últimas filas de datos.
    const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.length >= 2) as unknown[][];
    if (!dataRows.length) throw new Error("Sin lecturas de Kp");
    const last = dataRows[dataRows.length - 1];
    const kp = asNumber(last[1]);
    if (kp === null) throw new Error("Kp no numérico");
    const timeTag = typeof last[0] === "string" ? last[0] : undefined;
    // Escala G de tormenta geomagnética (NOAA).
    const level =
        kp >= 9 ? "G5 · Extrema"
            : kp >= 8 ? "G4 · Severa"
                : kp >= 7 ? "G3 · Fuerte"
                    : kp >= 6 ? "G2 · Moderada"
                        : kp >= 5 ? "G1 · Menor"
                            : "Tranquilo";
    const recent = dataRows.slice(-4).map((r) => asNumber(r[1])).filter((n): n is number => n !== null);
    const points: DataPoint[] = [
        { label: "Índice Kp", value: fmt(kp), detail: level },
        { label: "Estado geomagnético", value: level, detail: timeTag ? `UTC ${timeTag}` : undefined },
    ];
    if (recent.length) {
        points.push({ label: "Tendencia (últimas)", value: recent.map((n) => fmt(n, 0)).join(" · ") });
    }
    return points;
}

async function fetchUsgsQuakes(): Promise<DataPoint[]> {
    const data = (await fetchJson(
        "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=5&orderby=time&minmagnitude=2.5",
    )) as { features?: Array<{ properties?: { mag?: unknown; place?: unknown; time?: unknown } }> };
    const features = Array.isArray(data?.features) ? data.features : [];
    if (!features.length) throw new Error("Sin sismos recientes");
    const points = features.slice(0, 5).map((f, i): DataPoint => {
        const mag = asNumber(f?.properties?.mag);
        const place = typeof f?.properties?.place === "string" ? f.properties.place : "Ubicación desconocida";
        return {
            label: mag !== null ? `M ${fmt(mag)}` : `Sismo ${i + 1}`,
            value: place,
            detail: undefined,
        };
    });
    return points;
}

async function fetchSpaceflightNews(): Promise<DataPoint[]> {
    const data = (await fetchJson(
        "https://api.spaceflightnewsapi.net/v4/articles/?limit=5",
    )) as { results?: Array<{ title?: unknown; news_site?: unknown }> };
    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) throw new Error("Sin titulares");
    return results.slice(0, 5).map((a, i): DataPoint => ({
        label: typeof a?.title === "string" && a.title.trim() ? a.title : `Titular ${i + 1}`,
        value: typeof a?.news_site === "string" ? a.news_site : "—",
        detail: typeof a?.news_site === "string" ? a.news_site : undefined,
    }));
}

// ── Registro ─────────────────────────────────────────────────────
export const DATA_SOURCES: DataSource[] = [
    {
        id: "open-meteo",
        label: "Clima · Madrid",
        category: "Clima",
        attribution: "Open-Meteo",
        refreshMs: 600_000, // 10 min
        fetcher: fetchOpenMeteo,
    },
    {
        id: "noaa-kp",
        label: "Clima espacial",
        category: "Clima espacial",
        attribution: "NOAA SWPC",
        refreshMs: 300_000, // 5 min
        fetcher: fetchNoaaKp,
    },
    {
        id: "usgs-quakes",
        label: "Sismos recientes",
        category: "Sismos",
        attribution: "USGS",
        refreshMs: 120_000, // 2 min
        fetcher: fetchUsgsQuakes,
    },
    {
        id: "spaceflight-news",
        label: "Noticias del espacio",
        category: "Ciencia / Espacio",
        attribution: "Spaceflight News API",
        refreshMs: 900_000, // 15 min
        fetcher: fetchSpaceflightNews,
    },
];

export function getDataSource(id: string): DataSource | undefined {
    return DATA_SOURCES.find((s) => s.id === id);
}
