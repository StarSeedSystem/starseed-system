// ════════════════════════════════════════════════════════════════
// StarSeed Widget Data — Registro de Proveedores de Datos
// ────────────────────────────────────────────────────────────────
// Catálogo de fuentes de datos seleccionables POR widget y POR dominio.
// Primera versión funcional: describe las opciones disponibles y cuál es
// la opción por defecto de cada dominio. La elección concreta se persiste
// por widget (ver `widget-data-source-control.tsx`).
//
// Importar SIEMPRE este archivo directamente, no a través del barrel
// `index.ts`, para no alterar la superficie pública existente.
// ════════════════════════════════════════════════════════════════

/** Dominios de datos que un widget puede consumir. */
export type DataDomain =
    | 'weather'
    | 'air_quality'
    | 'space_weather'
    | 'finance'
    | 'news'
    | 'maps'
    | 'astro';

/** Descripción de un proveedor de datos seleccionable. */
export interface DataProvider {
    /** Identificador estable (se persiste en localStorage). */
    id: string;
    /** Etiqueta legible para la UI. */
    label: string;
    /** Dominio al que pertenece. */
    domain: DataDomain;
    /** ¿Es gratuito de usar? */
    free: boolean;
    /** ¿Requiere una API key para funcionar? */
    needsKey: boolean;
    /** Descripción corta para tooltip / popover. */
    description: string;
    /** Página principal del proveedor (opcional). */
    homepage?: string;
}

/**
 * Catálogo de proveedores reales gratuitos por dominio.
 * El primer proveedor listado de cada dominio que tenga `id` coincidente
 * con DEFAULT_PROVIDER_BY_DOMAIN se trata como el predeterminado.
 */
export const DATA_PROVIDERS: DataProvider[] = [
    // ── Weather (clima terrestre) ──────────────────────────────
    {
        id: 'open-meteo',
        label: 'Open-Meteo',
        domain: 'weather',
        free: true,
        needsKey: false,
        description: 'Clima terrestre, UV y astronomía. Sin API key. Fuente por defecto.',
        homepage: 'https://open-meteo.com',
    },
    {
        id: 'wttr',
        label: 'wttr.in',
        domain: 'weather',
        free: true,
        needsKey: false,
        description: 'Servicio meteorológico ligero basado en consola. Sin API key.',
        homepage: 'https://wttr.in',
    },
    {
        id: 'mock',
        label: 'Mock (demo)',
        domain: 'weather',
        free: true,
        needsKey: false,
        description: 'Datos sintéticos locales para desarrollo y demos. Sin red.',
    },

    // ── Air Quality (calidad del aire) ─────────────────────────
    {
        id: 'open-meteo-aq',
        label: 'Open-Meteo Air Quality',
        domain: 'air_quality',
        free: true,
        needsKey: false,
        description: 'AQI, PM2.5, PM10, ozono y más. Sin API key. Fuente por defecto.',
        homepage: 'https://open-meteo.com/en/docs/air-quality-api',
    },
    {
        id: 'openaq',
        label: 'OpenAQ',
        domain: 'air_quality',
        free: true,
        needsKey: false,
        description: 'Mediciones abiertas de estaciones de calidad del aire globales.',
        homepage: 'https://openaq.org',
    },

    // ── Space Weather (clima espacial) ─────────────────────────
    {
        id: 'noaa-swpc',
        label: 'NOAA SWPC',
        domain: 'space_weather',
        free: true,
        needsKey: false,
        description: 'Índice Kp, viento solar y rayos X. Sin API key. Fuente por defecto.',
        homepage: 'https://www.swpc.noaa.gov',
    },

    // ── Finance (finanzas / cartera) ───────────────────────────
    {
        id: 'supabase-starseed',
        label: 'Supabase StarSeed',
        domain: 'finance',
        free: true,
        needsKey: false,
        description: 'Cuenta soberana StarSeed (cartera + bolsa beta). Fuente por defecto.',
    },
    {
        id: 'mock',
        label: 'Mock (demo)',
        domain: 'finance',
        free: true,
        needsKey: false,
        description: 'Datos financieros sintéticos para desarrollo y demos.',
    },

    // ── Maps (mapas) ───────────────────────────────────────────
    {
        id: 'openstreetmap',
        label: 'OpenStreetMap',
        domain: 'maps',
        free: true,
        needsKey: false,
        description: 'Cartografía libre y abierta. Fuente por defecto.',
        homepage: 'https://www.openstreetmap.org',
    },

    // ── Astro (astronomía / efemérides) ────────────────────────
    {
        id: 'local-astro',
        label: 'Cálculo local',
        domain: 'astro',
        free: true,
        needsKey: false,
        description: 'Efemérides calculadas en el dispositivo (fase lunar, etc.). Sin red.',
    },
];

/** Proveedor por defecto de cada dominio. */
const DEFAULT_PROVIDER_BY_DOMAIN: Record<DataDomain, string> = {
    weather: 'open-meteo',
    air_quality: 'open-meteo-aq',
    space_weather: 'noaa-swpc',
    finance: 'supabase-starseed',
    news: 'mock',
    maps: 'openstreetmap',
    astro: 'local-astro',
};

/** Devuelve todos los proveedores registrados para un dominio. */
export function providersForDomain(domain: DataDomain): DataProvider[] {
    return DATA_PROVIDERS.filter((p) => p.domain === domain);
}

/**
 * Busca un proveedor por id, restringido opcionalmente a un dominio
 * (importante porque algunos ids como 'mock' se repiten entre dominios).
 */
export function getProvider(id: string, domain?: DataDomain): DataProvider | undefined {
    return DATA_PROVIDERS.find(
        (p) => p.id === id && (domain === undefined || p.domain === domain),
    );
}

/** Devuelve el proveedor por defecto (objeto) de un dominio. */
export function defaultProviderForDomain(domain: DataDomain): DataProvider {
    const defId = DEFAULT_PROVIDER_BY_DOMAIN[domain];
    const found = getProvider(defId, domain) ?? providersForDomain(domain)[0];
    return found;
}

/** Devuelve el id del proveedor por defecto de un dominio. */
export function defaultProviderIdForDomain(domain: DataDomain): string {
    return defaultProviderForDomain(domain)?.id ?? DEFAULT_PROVIDER_BY_DOMAIN[domain];
}
