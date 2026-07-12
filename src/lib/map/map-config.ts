// src/lib/map/map-config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Configuración del MAPA soberano del Hub (SOP: centro-creacion-sync-permisos.md §12).
//
//   · Capas BASE: OSM estándar · Satélite (Esri World Imagery) · Topográfico
//     (OpenTopoMap) · Oscuro (Carto dark_all). Todas son teselas públicas SIN
//     clave; la atribución de cada fuente es OBLIGATORIA y viaja con la capa.
//   · Superposiciones de CLIMA REAL multi-fuente: radar de lluvia RainViewer
//     (API pública sin clave, con animación de frames) + NASA GIBS satelital
//     (WMTS GoogleMapsCompatible, fecha del día anterior).
//   · Persistencia del estado del mapa (centro/zoom/capas) en
//     `starseed.map.view.v1` (candidata a SYNCED_KEYS — se añade en settings-sync
//     por el flujo de integración, NO aquí).
//   · Crédito global: "Datos © OpenStreetMap · inspirado en Organic Maps".
//
// Filosofía del repo: SSR-safe (helpers de storage con guardas), nunca lanza.
// ─────────────────────────────────────────────────────────────────────────────

// ── Claves de persistencia (reportadas para SYNCED_KEYS) ─────────────────────

/** Estado del mapa: centro, zoom, capa base, superposiciones y capas de datos. */
export const MAP_VIEW_KEY = "starseed.map.view.v1";
/** Config de compartición de ubicación (off | red | usuarios/grupos). */
export const MAP_LOCATION_KEY = "starseed.map.location.v1";

// ── Estado de vista persistido ───────────────────────────────────────────────

export interface MapViewState {
    lat: number;
    lng: number;
    zoom: number;
    /** id de BASE_LAYERS activo. */
    base: string;
    /** ids de superposiciones de clima activas (rainviewer / gibs-*). */
    overlaysOn: string[];
    /** Opacidad 0..1 por id de superposición. */
    overlayOpacity: Record<string, number>;
    /** Capas de datos de la red: posts/proposals/events/places/peers. */
    dataLayers: Record<string, boolean>;
}

export const DEFAULT_MAP_VIEW: MapViewState = {
    // Centro por defecto: península ibérica (vista amplia, sin asumir GPS).
    lat: 40.4168,
    lng: -3.7038,
    zoom: 5,
    base: "osm",
    overlaysOn: [],
    overlayOpacity: { rainviewer: 0.7, "gibs-truecolor": 0.75, "gibs-viirs": 0.75, "gibs-clouds": 0.6 },
    dataLayers: { posts: true, proposals: true, events: true, places: true, peers: true },
};

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Lee el estado persistido del mapa (merge defensivo sobre los defaults). */
export function loadMapView(): MapViewState {
    if (!isClient()) return { ...DEFAULT_MAP_VIEW };
    try {
        const raw = localStorage.getItem(MAP_VIEW_KEY);
        if (!raw) return { ...DEFAULT_MAP_VIEW };
        const parsed = JSON.parse(raw) as Partial<MapViewState>;
        return {
            ...DEFAULT_MAP_VIEW,
            ...parsed,
            overlayOpacity: { ...DEFAULT_MAP_VIEW.overlayOpacity, ...(parsed.overlayOpacity ?? {}) },
            dataLayers: { ...DEFAULT_MAP_VIEW.dataLayers, ...(parsed.dataLayers ?? {}) },
            overlaysOn: Array.isArray(parsed.overlaysOn) ? parsed.overlaysOn : [],
        };
    } catch {
        return { ...DEFAULT_MAP_VIEW };
    }
}

/** Persiste el estado del mapa. Nunca lanza. */
export function saveMapView(view: MapViewState): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(MAP_VIEW_KEY, JSON.stringify(view));
    } catch {
        /* cuota llena / privado: el mapa sigue funcionando sin persistir */
    }
}

// ── Capas BASE (teselas públicas, atribución obligatoria) ────────────────────

export interface BaseLayerDef {
    id: string;
    label: string;
    desc: string;
    /** Plantilla de teselas Leaflet ({s}/{z}/{x}/{y}/{r}). */
    url: string;
    /** HTML de atribución (obligatorio — se muestra en el control del mapa). */
    attribution: string;
    maxZoom: number;
    subdomains?: string;
}

export const BASE_LAYERS: BaseLayerDef[] = [
    {
        id: "osm",
        label: "OSM estándar",
        desc: "Mapa colaborativo de OpenStreetMap",
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
        maxZoom: 19,
    },
    {
        id: "satelite",
        label: "Satélite",
        desc: "Imágenes Esri World Imagery",
        // Ojo al orden {z}/{y}/{x} de ArcGIS (distinto de OSM).
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, GIS User Community",
        maxZoom: 19,
    },
    {
        id: "topo",
        label: "Topográfico",
        desc: "Relieve y senderos (OpenTopoMap)",
        url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, SRTM · Estilo: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)',
        maxZoom: 17,
    },
    {
        id: "oscuro",
        label: "Oscuro",
        desc: "Carto dark_all (a juego con el OS)",
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
        maxZoom: 20,
        subdomains: "abcd",
    },
];

export const BASE_LAYER_BY_ID: Record<string, BaseLayerDef> = Object.fromEntries(
    BASE_LAYERS.map((b) => [b.id, b]),
);

/**
 * URL de una tesela CONCRETA para usar de miniatura en el selector de capas
 * (z5 sobre la península ibérica). Sustituye tokens uno a uno para respetar
 * plantillas con orden {z}/{y}/{x} (Esri).
 */
export function previewTileUrl(def: BaseLayerDef): string {
    return def.url
        .replace("{s}", (def.subdomains ?? "abc")[0] ?? "a")
        .replace("{r}", "")
        .replace("{z}", "5")
        .replace("{x}", "15")
        .replace("{y}", "12");
}

// ── Clima real · RainViewer (radar de lluvia, sin clave) ─────────────────────

export const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";

export interface RainFrame {
    /** Epoch (s) del frame. */
    time: number;
    /** Path relativo del frame (se antepone el host). */
    path: string;
}

export interface RainViewerData {
    host: string;
    /** Frames pasados + nowcast, en orden cronológico. */
    frames: RainFrame[];
    /** Índice del frame "ahora" (último pasado). */
    nowIndex: number;
}

/**
 * Descarga el índice público de RainViewer (sin clave). Devuelve null si falla
 * (sin red / CORS): la capa simplemente no se enciende y la UI lo comunica.
 */
export async function fetchRainViewer(): Promise<RainViewerData | null> {
    try {
        const res = await fetch(RAINVIEWER_API, { cache: "no-store" });
        if (!res.ok) return null;
        const json = (await res.json()) as {
            host?: string;
            radar?: { past?: RainFrame[]; nowcast?: RainFrame[] };
        };
        const host = json.host || "https://tilecache.rainviewer.com";
        const past = Array.isArray(json.radar?.past) ? json.radar!.past! : [];
        const nowcast = Array.isArray(json.radar?.nowcast) ? json.radar!.nowcast! : [];
        const frames = [...past, ...nowcast].filter((f) => f && typeof f.path === "string");
        if (frames.length === 0) return null;
        return { host, frames, nowIndex: Math.max(0, past.length - 1) };
    } catch {
        return null;
    }
}

/** Plantilla Leaflet de teselas de radar para un frame (color 2, con suavizado). */
export function rainTileUrl(host: string, framePath: string): string {
    return `${host}${framePath}/256/{z}/{x}/{y}/2/1_1.png`;
}

export const RAINVIEWER_ATTRIBUTION =
    'Radar &copy; <a href="https://www.rainviewer.com/api.html" target="_blank" rel="noopener">RainViewer</a>';

// ── Clima real · NASA GIBS (WMTS GoogleMapsCompatible, sin clave) ────────────

export interface GibsLayerDef {
    id: string;
    label: string;
    desc: string;
    /** Identificador WMTS del layer en GIBS. */
    layer: string;
    /** Nivel máximo del TileMatrixSet GoogleMapsCompatible_Level{N}. */
    level: number;
    ext: "jpg" | "png";
}

export const GIBS_LAYERS: GibsLayerDef[] = [
    {
        id: "gibs-truecolor",
        label: "NASA · Satélite (Terra)",
        desc: "Color real MODIS Terra (día anterior)",
        layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
        level: 9,
        ext: "jpg",
    },
    {
        id: "gibs-viirs",
        label: "NASA · Satélite (VIIRS)",
        desc: "Color real VIIRS/SNPP (día anterior)",
        layer: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
        level: 9,
        ext: "jpg",
    },
    {
        id: "gibs-clouds",
        label: "NASA · Nubes",
        desc: "Temperatura de tope de nube (MODIS)",
        // Capa de nubes GIBS; si el nivel/fecha no está publicado aún, las
        // teselas ausentes simplemente no se pintan (errorTileUrl vacío).
        layer: "MODIS_Terra_Cloud_Top_Temp_Day",
        level: 7,
        ext: "png",
    },
];

export const GIBS_LAYER_BY_ID: Record<string, GibsLayerDef> = Object.fromEntries(
    GIBS_LAYERS.map((g) => [g.id, g]),
);

/**
 * Fecha (UTC) para GIBS en formato YYYY-MM-DD. Por defecto AYER: las imágenes
 * "best" del día en curso suelen estar incompletas hasta pasadas unas horas.
 */
export function gibsDate(daysBack = 1): string {
    const d = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
}

/** Plantilla Leaflet WMTS de GIBS (nótese el orden {z}/{y}/{x}). */
export function gibsTileUrl(def: GibsLayerDef, date = gibsDate()): string {
    return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${def.layer}/default/${date}/GoogleMapsCompatible_Level${def.level}/{z}/{y}/{x}.${def.ext}`;
}

export const GIBS_ATTRIBUTION =
    'Imágenes &copy; <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA EOSDIS GIBS</a>';

// ── Crédito global (obligatorio) ─────────────────────────────────────────────

export const ORGANIC_MAPS_REPO = "https://github.com/organicmaps/organicmaps";

/** Crédito que se añade SIEMPRE al control de atribución del mapa. */
export const MAP_CREDIT_HTML =
    'Datos &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · inspirado en <a href="' +
    ORGANIC_MAPS_REPO +
    '" target="_blank" rel="noopener">Organic Maps</a>';

// ── Búsqueda de lugares · Nominatim (OSM) ────────────────────────────────────

export interface PlaceHit {
    label: string;
    lat: number;
    lng: number;
    /** Tipo devuelto por Nominatim (city, road, …), informativo. */
    kind?: string;
}

/**
 * Busca lugares con Nominatim (servicio público de OSM). Uso EDUCADO exigido
 * por su política: la UI debe llamar con debounce (≥600ms) y pocas peticiones;
 * el navegador no permite fijar User-Agent, pero envía Referer del OS, y
 * limitamos resultados. Nunca lanza: [] ante cualquier fallo.
 */
export async function searchPlaces(q: string, limit = 6): Promise<PlaceHit[]> {
    const term = (q ?? "").trim();
    if (term.length < 2) return [];
    try {
        const url =
            "https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&accept-language=es&limit=" +
            String(limit) +
            "&q=" +
            encodeURIComponent(term);
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return [];
        const rows = (await res.json()) as Array<{
            display_name?: string;
            lat?: string;
            lon?: string;
            type?: string;
        }>;
        return (Array.isArray(rows) ? rows : [])
            .map((r) => ({
                label: r.display_name || "",
                lat: Number(r.lat),
                lng: Number(r.lon),
                kind: r.type,
            }))
            .filter((p) => p.label && Number.isFinite(p.lat) && Number.isFinite(p.lng));
    } catch {
        return [];
    }
}

// ── Utilidades compartidas del mapa ──────────────────────────────────────────

/** Escapa texto para interpolarlo en HTML de popups/divIcons (anti-XSS). */
export function escapeHtml(s: string): string {
    return (s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** "hace X min/h/d" en español, a partir de un epoch ms o ISO. */
export function timeAgo(input: number | string): string {
    const t = typeof input === "number" ? input : Date.parse(input);
    if (!Number.isFinite(t)) return "";
    const diff = Math.max(0, Date.now() - t);
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "ahora mismo";
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} d`;
}
