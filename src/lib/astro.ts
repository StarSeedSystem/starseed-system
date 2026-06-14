// ════════════════════════════════════════════════════════════════
// StarSeed Astro — Cálculos astronómicos / astrológicos en vivo
// ----------------------------------------------------------------
// Biblioteca de funciones PURAS (sin estado, sin dependencias) que
// calculan fase lunar, signo solar, longitudes eclípticas aproximadas
// de Sol/Luna/planetas y día lunar a partir de una fecha.
//
// ⚠️ APROXIMACIÓN: Estas fórmulas son de BAJO ORDEN, pensadas para
// VISUALIZACIÓN y orientación, NO para efemérides de precisión.
// Los errores pueden ser de varios grados (especialmente la Luna y
// los planetas exteriores). Para astrología seria usa Swiss Ephemeris.
//
// Referencias de las fórmulas:
//  • Luna nueva de referencia: 2000-01-06 18:14 UTC.
//  • Ciclo sinódico medio: 29.53058867 días.
//  • Elementos orbitales medios época J2000 (Paul Schlyter, "How to
//    compute planetary positions"), simplificados.
// ════════════════════════════════════════════════════════════════

// ── Constantes ──────────────────────────────────────────────────
export const SYNODIC_MONTH = 29.53058867; // días
export const KNOWN_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14, 0);

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// ── Helpers de ángulos ──────────────────────────────────────────
/** Normaliza un ángulo en grados al rango [0, 360). */
export function norm360(deg: number): number {
    let d = deg % 360;
    if (d < 0) d += 360;
    return d;
}

export function deg2rad(deg: number): number {
    return deg * DEG2RAD;
}

export function rad2deg(rad: number): number {
    return rad * RAD2DEG;
}

/** sin/cos que aceptan grados (comodidad). */
function sinDeg(deg: number): number {
    return Math.sin(deg2rad(deg));
}
function cosDeg(deg: number): number {
    return Math.cos(deg2rad(deg));
}

// ── Día Juliano ─────────────────────────────────────────────────
/**
 * Día Juliano (JD) para una fecha dada (UTC).
 * Aproximación estándar válida para fechas gregorianas modernas.
 */
export function julianDay(date: Date): number {
    // Tiempo Unix en ms → JD. 2440587.5 = JD del epoch Unix (1970-01-01 00:00 UTC).
    return date.getTime() / 86400000 + 2440587.5;
}

/** Días transcurridos desde la época J2000.0 (2000-01-01 12:00 UTC). */
export function daysSinceJ2000(date: Date): number {
    return julianDay(date) - 2451545.0;
}

// ── Zodiaco ─────────────────────────────────────────────────────
export interface ZodiacSign {
    name: string;
    symbol: string;
    element: "Fuego" | "Tierra" | "Aire" | "Agua";
    /** rango de fechas aproximado (signo solar tropical), texto legible */
    dateRange: string;
}

/**
 * Los 12 signos en ORDEN ECLÍPTICO empezando en Aries (0° de longitud
 * eclíptica). Cada signo ocupa 30°.
 */
export const ZODIAC_SIGNS: ZodiacSign[] = [
    { name: "Aries", symbol: "♈", element: "Fuego", dateRange: "21 mar – 19 abr" },
    { name: "Tauro", symbol: "♉", element: "Tierra", dateRange: "20 abr – 20 may" },
    { name: "Géminis", symbol: "♊", element: "Aire", dateRange: "21 may – 20 jun" },
    { name: "Cáncer", symbol: "♋", element: "Agua", dateRange: "21 jun – 22 jul" },
    { name: "Leo", symbol: "♌", element: "Fuego", dateRange: "23 jul – 22 ago" },
    { name: "Virgo", symbol: "♍", element: "Tierra", dateRange: "23 ago – 22 sep" },
    { name: "Libra", symbol: "♎", element: "Aire", dateRange: "23 sep – 22 oct" },
    { name: "Escorpio", symbol: "♏", element: "Agua", dateRange: "23 oct – 21 nov" },
    { name: "Sagitario", symbol: "♐", element: "Fuego", dateRange: "22 nov – 21 dic" },
    { name: "Capricornio", symbol: "♑", element: "Tierra", dateRange: "22 dic – 19 ene" },
    { name: "Acuario", symbol: "♒", element: "Aire", dateRange: "20 ene – 18 feb" },
    { name: "Piscis", symbol: "♓", element: "Agua", dateRange: "19 feb – 20 mar" },
];

/**
 * Devuelve el signo zodiacal correspondiente a una longitud eclíptica
 * (0..360°). Cada signo cubre 30°, empezando en Aries = 0°.
 */
export function signFromLongitude(longitude: number): {
    sign: ZodiacSign;
    /** grados dentro del signo (0..30) */
    degreeInSign: number;
} {
    const lon = norm360(longitude);
    const idx = Math.floor(lon / 30) % 12;
    return { sign: ZODIAC_SIGNS[idx], degreeInSign: lon - idx * 30 };
}

// ── Fase lunar ──────────────────────────────────────────────────
export type MoonPhaseName =
    | "Nueva"
    | "Creciente"
    | "Cuarto Creciente"
    | "Gibosa Creciente"
    | "Llena"
    | "Gibosa Menguante"
    | "Cuarto Menguante"
    | "Menguante";

export interface MoonPhaseResult {
    /** posición en el ciclo sinódico, 0..1 (0 = nueva, 0.5 = llena) */
    fraction: number;
    /** iluminación visible del disco, 0..1 (0 = nueva, 1 = llena) */
    illumination: number;
    name: MoonPhaseName;
    emoji: string;
    /** true en fase creciente (waxing), false en menguante (waning) */
    waxing: boolean;
}

/**
 * Fase lunar aproximada por edad respecto a una luna nueva conocida.
 * Aproximación: ignora la elipticidad de la órbita (variación ±~14 h).
 */
export function moonPhase(date: Date): MoonPhaseResult {
    const days = (date.getTime() - KNOWN_NEW_MOON_UTC) / 86400000;
    let fraction = (days % SYNODIC_MONTH) / SYNODIC_MONTH;
    if (fraction < 0) fraction += 1;

    // Iluminación con curva cosenoidal: 0 en nueva, 1 en llena.
    const illumination = (1 - Math.cos(fraction * 2 * Math.PI)) / 2;
    const waxing = fraction < 0.5;

    let name: MoonPhaseName;
    let emoji: string;
    if (fraction < 0.03 || fraction >= 0.97) {
        name = "Nueva";
        emoji = "🌑";
    } else if (fraction < 0.22) {
        name = "Creciente";
        emoji = "🌒";
    } else if (fraction < 0.28) {
        name = "Cuarto Creciente";
        emoji = "🌓";
    } else if (fraction < 0.47) {
        name = "Gibosa Creciente";
        emoji = "🌔";
    } else if (fraction < 0.53) {
        name = "Llena";
        emoji = "🌕";
    } else if (fraction < 0.72) {
        name = "Gibosa Menguante";
        emoji = "🌖";
    } else if (fraction < 0.78) {
        name = "Cuarto Menguante";
        emoji = "🌗";
    } else {
        name = "Menguante";
        emoji = "🌘";
    }

    return { fraction, illumination, name, emoji, waxing };
}

/**
 * Día lunar 1..30 derivado de la fase.
 * Día 1 = luna nueva. Aproximación lineal sobre el ciclo sinódico.
 */
export function lunarDay(date: Date): number {
    const { fraction } = moonPhase(date);
    const day = Math.floor(fraction * SYNODIC_MONTH) + 1;
    return Math.min(30, Math.max(1, day));
}

// ── Longitud eclíptica del Sol ──────────────────────────────────
/**
 * Longitud eclíptica aparente del Sol (grados, 0..360).
 * Aproximación de bajo orden (precisión ~0.01°, suficiente aquí).
 */
export function sunLongitude(date: Date): number {
    const n = daysSinceJ2000(date);
    // Anomalía media del Sol.
    const g = norm360(357.529 + 0.98560028 * n);
    // Longitud media del Sol.
    const q = norm360(280.459 + 0.98564736 * n);
    // Longitud eclíptica aparente (ecuación del centro).
    const L = q + 1.915 * sinDeg(g) + 0.020 * sinDeg(2 * g);
    return norm360(L);
}

/** Signo solar (signo tropical) para una fecha — usa la longitud del Sol. */
export function sunSign(date: Date): {
    sign: ZodiacSign;
    longitude: number;
    degreeInSign: number;
} {
    const longitude = sunLongitude(date);
    const { sign, degreeInSign } = signFromLongitude(longitude);
    return { sign, longitude, degreeInSign };
}

// ── Longitud eclíptica de la Luna ───────────────────────────────
/**
 * Longitud eclíptica aproximada de la Luna (grados 0..360).
 * Incluye los principales términos periódicos (evección, variación,
 * ecuación anual, etc.). Aproximación: error típico < 1°.
 */
export function moonLongitude(date: Date): number {
    const n = daysSinceJ2000(date);
    const T = n / 36525; // siglos julianos desde J2000

    // Argumentos fundamentales (Meeus, simplificado).
    const Lp = norm360(218.316 + 13.176396 * n); // longitud media
    const M = norm360(134.963 + 13.064993 * n);  // anomalía media lunar
    const F = norm360(93.272 + 13.229350 * n);   // argumento de latitud
    const D = norm360(297.850 + 12.190749 * n);  // elongación media
    const Ms = norm360(357.529 + 0.98560028 * n); // anomalía media solar

    void T; // T disponible para refinamientos futuros; orden bajo no lo usa.

    const lon =
        Lp +
        6.289 * sinDeg(M) +
        1.274 * sinDeg(2 * D - M) +
        0.658 * sinDeg(2 * D) +
        0.214 * sinDeg(2 * M) -
        0.186 * sinDeg(Ms) -
        0.114 * sinDeg(2 * F);

    return norm360(lon);
}

// ── Planetas (Mercurio..Saturno) ────────────────────────────────
export type PlanetName =
    | "Sol"
    | "Luna"
    | "Mercurio"
    | "Venus"
    | "Marte"
    | "Júpiter"
    | "Saturno";

export interface PlanetPosition {
    body: PlanetName;
    symbol: string;
    /** longitud eclíptica geocéntrica aproximada (grados 0..360) */
    longitude: number;
    sign: ZodiacSign;
    /** grados dentro del signo (0..30) */
    degreeInSign: number;
}

const PLANET_SYMBOLS: Record<PlanetName, string> = {
    Sol: "☉",
    Luna: "☽",
    Mercurio: "☿",
    Venus: "♀",
    Marte: "♂",
    Júpiter: "♃",
    Saturno: "♄",
};

// Elementos orbitales medios (época J2000) de Schlyter, simplificados.
// N: long. nodo ascendente, i: inclinación, w: arg. perihelio,
// a: semieje (UA), e: excentricidad, M0+rate: anomalía media.
// Las tasas (por día) producen la longitud heliocéntrica; luego se
// convierte a geocéntrica restando la posición de la Tierra (≈ Sol+180).
interface OrbitalElements {
    N: (d: number) => number;
    i: (d: number) => number;
    w: (d: number) => number;
    a: number;
    e: (d: number) => number;
    M: (d: number) => number;
}

const ELEMENTS: Record<"Mercurio" | "Venus" | "Marte" | "Júpiter" | "Saturno", OrbitalElements> = {
    Mercurio: {
        N: (d) => 48.3313 + 3.24587e-5 * d,
        i: () => 7.0047,
        w: (d) => 29.1241 + 1.01444e-5 * d,
        a: 0.387098,
        e: (d) => 0.205635 + 5.59e-10 * d,
        M: (d) => 168.6562 + 4.0923344368 * d,
    },
    Venus: {
        N: (d) => 76.6799 + 2.4659e-5 * d,
        i: () => 3.3946,
        w: (d) => 54.891 + 1.38374e-5 * d,
        a: 0.72333,
        e: (d) => 0.006773 - 1.302e-9 * d,
        M: (d) => 48.0052 + 1.6021302244 * d,
    },
    Marte: {
        N: (d) => 49.5574 + 2.11081e-5 * d,
        i: () => 1.8497,
        w: (d) => 286.5016 + 2.92961e-5 * d,
        a: 1.523688,
        e: (d) => 0.093405 + 2.516e-9 * d,
        M: (d) => 18.6021 + 0.5240207766 * d,
    },
    Júpiter: {
        N: (d) => 100.4542 + 2.76854e-5 * d,
        i: () => 1.303,
        w: (d) => 273.8777 + 1.64505e-5 * d,
        a: 5.20256,
        e: (d) => 0.048498 + 4.469e-9 * d,
        M: (d) => 19.895 + 0.0830853001 * d,
    },
    Saturno: {
        N: (d) => 113.6634 + 2.3898e-5 * d,
        i: () => 2.4886,
        w: (d) => 339.3939 + 2.97661e-5 * d,
        a: 9.55475,
        e: (d) => 0.055546 - 9.499e-9 * d,
        M: (d) => 316.967 + 0.0334442282 * d,
    },
};

/** Resuelve la ecuación de Kepler (anomalía excéntrica) por iteración. */
function eccentricAnomaly(M: number, e: number): number {
    const Mr = deg2rad(norm360(M));
    let E = Mr + e * Math.sin(Mr) * (1 + e * Math.cos(Mr));
    for (let k = 0; k < 8; k++) {
        const dE = (E - e * Math.sin(E) - Mr) / (1 - e * Math.cos(E));
        E -= dE;
        if (Math.abs(dE) < 1e-7) break;
    }
    return E;
}

/**
 * Longitud eclíptica geocéntrica aproximada de un planeta interior/exterior.
 * Aproximación: convierte heliocéntrico → geocéntrico de forma vectorial
 * usando la posición del Sol. Error típico de varios grados (suficiente
 * para visualización del signo en que cae).
 */
function planetLongitude(
    name: "Mercurio" | "Venus" | "Marte" | "Júpiter" | "Saturno",
    date: Date
): number {
    const d = daysSinceJ2000(date);
    const el = ELEMENTS[name];
    const N = el.N(d);
    const i = el.i(d);
    const w = el.w(d);
    const a = el.a;
    const e = el.e(d);
    const M = el.M(d);

    // Posición heliocéntrica del planeta.
    const E = eccentricAnomaly(M, e);
    const xv = a * (Math.cos(E) - e);
    const yv = a * (Math.sqrt(1 - e * e) * Math.sin(E));
    const v = rad2deg(Math.atan2(yv, xv)); // anomalía verdadera
    const r = Math.sqrt(xv * xv + yv * yv); // distancia al Sol

    const xh =
        r *
        (cosDeg(N) * cosDeg(v + w) - sinDeg(N) * sinDeg(v + w) * cosDeg(i));
    const yh =
        r *
        (sinDeg(N) * cosDeg(v + w) + cosDeg(N) * sinDeg(v + w) * cosDeg(i));
    const zh = r * (sinDeg(v + w) * sinDeg(i));

    // Posición heliocéntrica de la Tierra (a partir de la longitud solar
    // geocéntrica: la Tierra está a 180° + a 1 UA aproximada).
    const sunLon = sunLongitude(date);
    // Distancia Tierra-Sol aproximada (UA) — órbita casi circular.
    const rs = 1.000001;
    const xs = rs * cosDeg(sunLon - 180);
    const ys = rs * sinDeg(sunLon - 180);

    // Geocéntrico = heliocéntrico planeta - heliocéntrico Tierra.
    const xg = xh - xs;
    const yg = yh - ys;
    void zh;

    return norm360(rad2deg(Math.atan2(yg, xg)));
}

/** Posiciones de los planetas visibles clásicos (geocéntricas aprox.). */
export function planetPositions(date: Date): PlanetPosition[] {
    const make = (body: PlanetName, longitude: number): PlanetPosition => {
        const { sign, degreeInSign } = signFromLongitude(longitude);
        return { body, symbol: PLANET_SYMBOLS[body], longitude, sign, degreeInSign };
    };

    return [
        make("Sol", sunLongitude(date)),
        make("Luna", moonLongitude(date)),
        make("Mercurio", planetLongitude("Mercurio", date)),
        make("Venus", planetLongitude("Venus", date)),
        make("Marte", planetLongitude("Marte", date)),
        make("Júpiter", planetLongitude("Júpiter", date)),
        make("Saturno", planetLongitude("Saturno", date)),
    ];
}

// ── Biorritmos clásicos (deterministas) ─────────────────────────
export interface Biorhythm {
    /** -1..1 */
    physical: number;
    /** -1..1 */
    emotional: number;
    /** -1..1 */
    intellectual: number;
}

/**
 * Biorritmos clásicos (físico 23 d, emocional 28 d, intelectual 33 d)
 * contados desde una fecha base. DETERMINISTA — no usa aleatoriedad.
 * Por defecto cuenta desde la época J2000 (fecha base estable y común
 * para todos los usuarios que no aporten su fecha de nacimiento).
 */
export function biorhythm(
    date: Date,
    birthDate: Date = new Date(Date.UTC(2000, 0, 1))
): Biorhythm {
    const days = (date.getTime() - birthDate.getTime()) / 86400000;
    return {
        physical: Math.sin((2 * Math.PI * days) / 23),
        emotional: Math.sin((2 * Math.PI * days) / 28),
        intellectual: Math.sin((2 * Math.PI * days) / 33),
    };
}

/**
 * Coherencia global determinista 0..1, derivada de los biorritmos y la
 * iluminación lunar. Sustituto sin aleatoriedad de un Math.random().
 */
export function vitalCoherence(date: Date): number {
    const bio = biorhythm(date);
    const moon = moonPhase(date).illumination;
    // Media de los biorritmos remapeada a 0..1, mezclada con la luna.
    const bioAvg = (bio.physical + bio.emotional + bio.intellectual) / 3; // -1..1
    const bio01 = (bioAvg + 1) / 2;
    const coherence = 0.55 * bio01 + 0.25 * moon + 0.2;
    return Math.min(1, Math.max(0, coherence));
}
