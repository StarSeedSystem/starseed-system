/**
 * El cielo REAL de este momento y este lugar (PURO, sin red): posición del Sol, orto y ocaso,
 * horas doradas, fase e iluminación de la Luna (con su salida y su puesta), el signo zodiacal
 * (trópico) de cada astro, las posiciones de los planetas (¿retrógrado?), el ascendente y el
 * medio cielo, la hora planetaria, las próximas fases, estaciones y eclipses.
 *
 * Fórmulas de baja precisión de Meeus (Astronomical Algorithms, cap. 47, 49, 54), SunCalc y los
 * elementos orbitales aproximados del JPL (Standish, 1800-2050): minutos en el orto y en las
 * fases, décimas de grado en la Luna y ~1° en los planetas, de sobra para un widget y
 * comprobado en las pruebas con efemérides conocidas. Nada se inventa: sin ubicación, lo que
 * depende de ella vuelve null.
 */

const RAD = Math.PI / 180;
const DIA_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLICUIDAD = RAD * 23.4397;
/** ΔT (TT − UT) en 2024-2027, en días: ~69 s. */
const DELTA_T_DIAS = 69 / 86_400;

const dias = (fecha: Date) => fecha.getTime() / DIA_MS - 0.5 + J1970 - J2000;
const desdeJuliano = (j: number) => new Date((j + 0.5 - J1970) * DIA_MS);
const ascension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(OBLICUIDAD) - Math.tan(b) * Math.sin(OBLICUIDAD), Math.cos(l));
const declinacion = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(OBLICUIDAD) + Math.cos(b) * Math.sin(OBLICUIDAD) * Math.sin(l));
const anomaliaSolar = (d: number) => RAD * (357.5291 + 0.98560028 * d);
/** Longitud eclíptica APARENTE del Sol, referida al equinoccio de la fecha (Meeus, cap. 25:
 *  ~0,01°). La de SunCalc era de J2000 y sin la deriva del perihelio: signos y estaciones
 *  llegaban medio día tarde. */
function longitudSol(d: number): number {
    const T = d / 36525;
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    const M = RAD * (357.52911 + 35999.05029 * T - 0.0001537 * T * T);
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
    return RAD * (L0 + C - 0.00569 - 0.00478 * Math.sin(RAD * (125.04 - 1934.136 * T)));
}
function coordenadasSol(d: number) {
    const L = longitudSol(d);
    return { lon: L, dec: declinacion(L, 0), ra: ascension(L, 0) };
}
/** La Luna con sus seis términos mayores (evección, variación, ecuación anual…): ~0,3°. */
function coordenadasLuna(d: number) {
    const L = RAD * (218.316 + 13.176396 * d);
    const M = RAD * (134.963 + 13.064993 * d);
    const F = RAD * (93.272 + 13.22935 * d);
    const D = RAD * (297.8502 + 12.19074912 * d);
    const Ms = anomaliaSolar(d);
    const lon = L + RAD * (6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D)
        + 0.214 * Math.sin(2 * M) - 0.186 * Math.sin(Ms) - 0.114 * Math.sin(2 * F));
    const lat = RAD * (5.128 * Math.sin(F) + 0.281 * Math.sin(M + F) + 0.278 * Math.sin(M - F) + 0.173 * Math.sin(2 * D - F));
    const dist = 385001 - 20905 * Math.cos(M) - 3699 * Math.cos(2 * D - M) - 2956 * Math.cos(2 * D);
    return { lon, lat, ra: ascension(lon, lat), dec: declinacion(lon, lat), dist };
}
const normalizar = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
/** Ángulo en grados a [0, 360). */
export const normalizarGrados = (g: number) => ((g % 360) + 360) % 360;
/** Diferencia angular en grados, en (−180, 180]. */
const diferencia = (a: number, b: number) => { const x = normalizarGrados(a - b); return x > 180 ? x - 360 : x; };

/** Tiempo sidéreo local (radianes) en `fecha` a la longitud `lon` (grados, este positivo). */
export function tiempoSidereoLocal(fecha: Date, lon: number): number {
    return RAD * (280.16 + 360.9856235 * dias(fecha) + lon);
}

/** Altura (grados) de un astro de ascensión recta `ra` y declinación `dec` (radianes). */
export function alturaDe(ra: number, dec: number, fecha: Date, lat: number, lon: number): number {
    const H = tiempoSidereoLocal(fecha, lon) - ra, phi = RAD * lat;
    return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / RAD;
}

/** De eclíptica (grados) a ecuatoriales (radianes). */
export function ecuatorialDesdeEcliptica(lonGrados: number, latGrados = 0): { ra: number; dec: number } {
    return { ra: ascension(RAD * lonGrados, RAD * latGrados), dec: declinacion(RAD * lonGrados, RAD * latGrados) };
}

/** Altura del Sol sobre el horizonte, en grados. */
export function alturaSol(fecha: Date, lat: number, lon: number): number {
    const s = coordenadasSol(dias(fecha));
    return alturaDe(s.ra, s.dec, fecha, lat, lon);
}

/** Altura geocéntrica de la Luna sobre el horizonte, en grados. */
export function alturaLuna(fecha: Date, lat: number, lon: number): number {
    const m = coordenadasLuna(dias(fecha));
    return alturaDe(m.ra, m.dec, fecha, lat, lon);
}

/** Cuándo cruza el Sol la altura `h0` (grados) el día de `fecha` (null si no llega o no baja). */
export function tiemposAltura(fecha: Date, lat: number, lon: number, h0: number): { sube: Date | null; mediodia: Date; baja: Date | null } {
    const lw = RAD * -lon, phi = RAD * lat, J0 = 0.0009;
    const n = Math.round(dias(fecha) - J0 - lw / (2 * Math.PI));
    const ds = J0 + lw / (2 * Math.PI) + n;
    const M = anomaliaSolar(ds), L = longitudSol(ds), dec = declinacion(L, 0);
    const jMediodia = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const cosW = (Math.sin(RAD * h0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cosW < -1 || cosW > 1) return { sube: null, mediodia: desdeJuliano(jMediodia), baja: null };
    const w = Math.acos(cosW);
    const a = J0 + (w + lw) / (2 * Math.PI) + n;
    const jBaja = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    return { sube: desdeJuliano(jMediodia - (jBaja - jMediodia)), mediodia: desdeJuliano(jMediodia), baja: desdeJuliano(jBaja) };
}

/** Orto, mediodía solar y ocaso del día de `fecha` (null si es noche o día polar). */
export function horasDelSol(fecha: Date, lat: number, lon: number): { orto: Date | null; mediodia: Date; ocaso: Date | null } {
    const t = tiemposAltura(fecha, lat, lon, -0.833);
    return { orto: t.sube, mediodia: t.mediodia, ocaso: t.baja };
}

export interface Tramo { inicio: Date; fin: Date }

/** Horas doradas del día: el Sol entre −4° y +6° (null si ese día no cruza esas alturas). */
export function horasDoradas(fecha: Date, lat: number, lon: number): { manana: Tramo | null; tarde: Tramo | null } {
    const alto = tiemposAltura(fecha, lat, lon, 6), bajo = tiemposAltura(fecha, lat, lon, -4);
    return {
        manana: bajo.sube && alto.sube ? { inicio: bajo.sube, fin: alto.sube } : null,
        tarde: alto.baja && bajo.baja ? { inicio: alto.baja, fin: bajo.baja } : null,
    };
}

export interface FaseLunar {
    /** 0 = nueva, 0.25 = cuarto creciente, 0.5 = llena, 0.75 = cuarto menguante. */
    fase: number;
    /** Fracción iluminada, 0-1. */
    iluminada: number;
    creciente: boolean;
    nombre: string;
}

export function faseLunar(fecha: Date): FaseLunar {
    const d = dias(fecha), s = coordenadasSol(d), m = coordenadasLuna(d), distSol = 149598000;
    const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(distSol * Math.sin(phi), m.dist - distSol * Math.cos(phi));
    const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    const fase = 0.5 + (0.5 * inc * (ang < 0 ? -1 : 1)) / Math.PI;
    return { fase, iluminada: (1 + Math.cos(inc)) / 2, creciente: fase < 0.5, nombre: nombreFase(fase) };
}

export function nombreFase(f: number): string {
    if (f < 0.03 || f > 0.97) return "Luna nueva";
    if (f < 0.22) return "Luna creciente";
    if (f < 0.28) return "Cuarto creciente";
    if (f < 0.47) return "Gibosa creciente";
    if (f < 0.53) return "Luna llena";
    if (f < 0.72) return "Gibosa menguante";
    if (f < 0.78) return "Cuarto menguante";
    return "Luna menguante";
}

/** Siguiente salida y puesta de la Luna en las próximas 30 h (null si no ocurre). */
export function salidaPuestaLuna(fecha: Date, lat: number, lon: number): { salida: Date | null; puesta: Date | null } {
    const H0 = 0.125, PASO = 10 * 60_000;
    let salida: Date | null = null, puesta: Date | null = null;
    let t0 = fecha.getTime(), h0 = alturaLuna(fecha, lat, lon) - H0;
    for (let i = 1; i <= 180 && (!salida || !puesta); i++) {
        const t1 = fecha.getTime() + i * PASO, h1 = alturaLuna(new Date(t1), lat, lon) - H0;
        if (h0 < 0 && h1 >= 0 && !salida) salida = new Date(t0 + (PASO * -h0) / (h1 - h0));
        if (h0 >= 0 && h1 < 0 && !puesta) puesta = new Date(t0 + (PASO * h0) / (h0 - h1));
        t0 = t1; h0 = h1;
    }
    return { salida, puesta };
}

// ── Fases e eclipses (Meeus, cap. 49 y 54) ─────────────────────────────────────────────────

const sen = (g: number) => Math.sin(RAD * g);
const cosen = (g: number) => Math.cos(RAD * g);

function lunacionMedia(k: number) {
    const T = k / 1236.85;
    return {
        T,
        jde: 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4,
        E: 1 - 0.002516 * T - 0.0000074 * T * T,
        M: 2.5534 + 29.1053567 * k - 0.0000014 * T * T - 0.00000011 * T ** 3,
        Mp: 201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T ** 3 - 0.000000058 * T ** 4,
        F: 160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T ** 3 + 0.000000011 * T ** 4,
        Om: 124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T ** 3,
    };
}

const juDesdeJde = (jde: number) => new Date((jde - DELTA_T_DIAS - 2440587.5) * DIA_MS);
const kAproximado = (fecha: Date) => ((fecha.getTime() / DIA_MS + 2440587.5 - J2000) / 365.25) * 12.3685;

export type TipoFase = "nueva" | "creciente" | "llena" | "menguante";

/** Instante de la fase principal de la lunación `k` (entero = nueva, +.25, +.5, +.75). */
function instanteFase(k: number): Date {
    const { jde, E, M, Mp, F, Om } = lunacionMedia(k);
    const q = ((k % 1) + 1) % 1;
    let c: number;
    if (q < 0.1 || q > 0.9 || Math.abs(q - 0.5) < 0.1) {
        const llena = Math.abs(q - 0.5) < 0.1;
        c = (llena ? -0.40614 : -0.4072) * sen(Mp) + (llena ? 0.17302 : 0.17241) * E * sen(M) + (llena ? 0.01614 : 0.01608) * sen(2 * Mp)
            + (llena ? 0.01043 : 0.01039) * sen(2 * F) + (llena ? 0.00734 : 0.00739) * E * sen(Mp - M) - (llena ? 0.00515 : 0.00514) * E * sen(Mp + M)
            + (llena ? 0.00209 : 0.00208) * E * E * sen(2 * M) - 0.00111 * sen(Mp - 2 * F) - 0.00057 * sen(Mp + 2 * F) + 0.00056 * E * sen(2 * Mp + M)
            - 0.00042 * sen(3 * Mp) + 0.00042 * E * sen(M + 2 * F) + 0.00038 * E * sen(M - 2 * F) - 0.00024 * E * sen(2 * Mp - M) - 0.00017 * sen(Om);
    } else {
        c = -0.62801 * sen(Mp) + 0.17172 * E * sen(M) - 0.01183 * E * sen(Mp + M) + 0.00862 * sen(2 * Mp) + 0.00804 * sen(2 * F)
            + 0.00454 * E * sen(Mp - M) + 0.00204 * E * E * sen(2 * M) - 0.0018 * sen(Mp - 2 * F) - 0.0007 * sen(Mp + 2 * F) - 0.0004 * sen(3 * Mp)
            - 0.00034 * E * sen(2 * Mp - M) + 0.00032 * E * sen(M + 2 * F) + 0.00032 * E * sen(M - 2 * F) - 0.00028 * E * E * sen(Mp + 2 * M)
            + 0.00027 * E * sen(2 * Mp + M) - 0.00017 * sen(Om);
        const W = 0.00306 - 0.00038 * E * cosen(M) + 0.00026 * cosen(Mp) - 0.00002 * cosen(Mp - M) + 0.00002 * cosen(Mp + M) + 0.00002 * cosen(2 * F);
        c += q < 0.5 ? W : -W;
    }
    return juDesdeJde(jde + c);
}

const TIPO_POR_CUARTO: TipoFase[] = ["nueva", "creciente", "llena", "menguante"];

/** Las próximas `n` fases principales a partir de `fecha`, en orden. */
export function proximasFases(fecha: Date, n = 4): { tipo: TipoFase; fecha: Date }[] {
    const salida: { tipo: TipoFase; fecha: Date }[] = [];
    let k = Math.floor(kAproximado(fecha)) - 1;
    for (let i = 0; i < 4 * 16 && salida.length < n; i++, k += 0.25) {
        const f = instanteFase(k);
        if (f.getTime() > fecha.getTime()) salida.push({ tipo: TIPO_POR_CUARTO[Math.round((((k % 1) + 1) % 1) * 4) % 4], fecha: f });
    }
    return salida;
}

/** Próxima luna llena o nueva a partir de `fecha` (Meeus: minutos de error). */
export function proximaFase(fecha: Date, objetivo: "llena" | "nueva"): Date {
    return proximasFases(fecha, 4).find((f) => f.tipo === objetivo)!.fecha;
}

export type ClaseEclipse = "total" | "anular" | "hibrido" | "parcial" | "penumbral";
export interface Eclipse { tipo: "sol" | "luna"; clase: ClaseEclipse; fecha: Date; gamma: number; magnitud: number | null }

/** Eclipse (si lo hay) en la lunación `k`: entero = de Sol, +.5 = de Luna. */
function eclipseEn(k: number): Eclipse | null {
    const { T, jde, E, M, Mp, F, Om } = lunacionMedia(k);
    if (Math.abs(sen(F)) > 0.36) return null;
    const solar = Math.abs(k % 1) < 0.25;
    const F1 = F - 0.02665 * sen(Om);
    const A1 = 299.77 + 0.107408 * k - 0.009173 * T * T;
    const correccion = (solar ? -0.4075 * sen(Mp) + 0.1721 * E * sen(M) : -0.4065 * sen(Mp) + 0.1727 * E * sen(M))
        + 0.0161 * sen(2 * Mp) - 0.0097 * sen(2 * F1) + 0.0073 * E * sen(Mp - M) - 0.005 * E * sen(Mp + M) - 0.0023 * sen(Mp - 2 * F1)
        + 0.0021 * E * sen(2 * M) + 0.0012 * sen(Mp + 2 * F1) + 0.0006 * E * sen(2 * Mp + M) - 0.0004 * sen(3 * Mp) - 0.0003 * E * sen(M + 2 * F1)
        + 0.0003 * sen(A1) - 0.0002 * E * sen(M - 2 * F1) - 0.0002 * E * sen(2 * Mp - M) - 0.0002 * sen(Om);
    const P = 0.207 * E * sen(M) + 0.0024 * E * sen(2 * M) - 0.0392 * sen(Mp) + 0.0116 * sen(2 * Mp) - 0.0073 * E * sen(Mp + M) + 0.0067 * E * sen(Mp - M) + 0.0118 * sen(2 * F1);
    const Q = 5.2207 - 0.0048 * E * cosen(M) + 0.002 * E * cosen(2 * M) - 0.3299 * cosen(Mp) - 0.006 * E * cosen(Mp + M) + 0.0041 * E * cosen(Mp - M);
    const W = Math.abs(cosen(F1));
    const gamma = (P * cosen(F1) + Q * sen(F1)) * (1 - 0.0048 * W);
    const u = 0.0059 + 0.0046 * E * cosen(M) - 0.0182 * cosen(Mp) + 0.0004 * cosen(2 * Mp) - 0.0005 * cosen(M + Mp);
    const fecha = juDesdeJde(jde + correccion), g = Math.abs(gamma);
    if (solar) {
        if (g > 1.5433 + u) return null;
        if (g < 0.9972) {
            if (u < 0) return { tipo: "sol", clase: "total", fecha, gamma, magnitud: null };
            if (u > 0.0047) return { tipo: "sol", clase: "anular", fecha, gamma, magnitud: null };
            return { tipo: "sol", clase: u < 0.00464 * Math.sqrt(1 - gamma * gamma) ? "hibrido" : "anular", fecha, gamma, magnitud: null };
        }
        if (g < 0.9972 + Math.abs(u)) return { tipo: "sol", clase: u < 0 ? "total" : "anular", fecha, gamma, magnitud: null };
        return { tipo: "sol", clase: "parcial", fecha, gamma, magnitud: (1.5433 + u - g) / (0.5461 + 2 * u) };
    }
    const penumbra = (1.5573 + u - g) / 0.545, umbra = (1.0128 - u - g) / 0.545;
    if (penumbra < 0) return null;
    return { tipo: "luna", clase: umbra < 0 ? "penumbral" : umbra < 1 ? "parcial" : "total", fecha, gamma, magnitud: umbra < 0 ? penumbra : umbra };
}

/** Próximo eclipse (de Sol, de Luna o cualquiera) en los próximos ~2 años. Visible o no desde aquí. */
export function proximoEclipse(fecha: Date, tipo?: "sol" | "luna"): Eclipse | null {
    let k = Math.floor(kAproximado(fecha)) - 1;
    for (let i = 0; i < 60; i++, k += 0.5) {
        if (tipo === "sol" && Math.abs(k % 1) > 0.25) continue;
        if (tipo === "luna" && Math.abs(k % 1) < 0.25) continue;
        const e = eclipseEn(k);
        if (e && e.fecha.getTime() > fecha.getTime()) return e;
    }
    return null;
}

export function nombreEclipse(e: Eclipse): string {
    const clase = { total: "total", anular: "anular", hibrido: "híbrido", parcial: "parcial", penumbral: "penumbral" }[e.clase];
    return `Eclipse ${clase} de ${e.tipo === "sol" ? "Sol" : "Luna"}`;
}

// ── Estaciones ─────────────────────────────────────────────────────────────────────────────

const lonSolGrados = (fecha: Date) => normalizarGrados(longitudSol(dias(fecha)) / RAD);

/** Próximo equinoccio o solsticio: cuando la longitud del Sol cruza 0°, 90°, 180° o 270°. */
export function proximaEstacion(fecha: Date): { fecha: Date; lon: 0 | 90 | 180 | 270; tipo: "equinoccio" | "solsticio" } {
    const meta = (Math.floor(lonSolGrados(fecha) / 90 + 1e-9) + 1) * 90;
    const objetivo = normalizarGrados(meta) as 0 | 90 | 180 | 270;
    const falta = (t: number) => diferencia(lonSolGrados(new Date(t)), objetivo);
    let a = fecha.getTime(), b = a;
    for (let i = 1; i <= 100; i++) { b = a + i * DIA_MS; if (falta(b) >= 0) break; }
    a = b - DIA_MS;
    for (let i = 0; i < 30 && b - a > 60_000; i++) { const m = (a + b) / 2; if (falta(m) >= 0) b = m; else a = m; }
    return { fecha: new Date(b), lon: objetivo, tipo: objetivo % 180 === 0 ? "equinoccio" : "solsticio" };
}

/** Nombre de la estación que EMPIEZA en ese cruce, según el hemisferio (norte si no se sabe). */
export function nombreEstacion(lon: 0 | 90 | 180 | 270, lat: number | null = null): string {
    const sur = lat !== null && lat < 0;
    const norte = { 0: "primavera", 90: "verano", 180: "otoño", 270: "invierno" } as const;
    const nombres = { primavera: "otoño", verano: "invierno", otoño: "primavera", invierno: "verano" } as const;
    return sur ? nombres[norte[lon]] : norte[lon];
}

// ── Signos ─────────────────────────────────────────────────────────────────────────────────

export const SIGNOS = [
    { nombre: "Aries", glifo: "♈︎", elemento: "fuego" },
    { nombre: "Tauro", glifo: "♉︎", elemento: "tierra" },
    { nombre: "Géminis", glifo: "♊︎", elemento: "aire" },
    { nombre: "Cáncer", glifo: "♋︎", elemento: "agua" },
    { nombre: "Leo", glifo: "♌︎", elemento: "fuego" },
    { nombre: "Virgo", glifo: "♍︎", elemento: "tierra" },
    { nombre: "Libra", glifo: "♎︎", elemento: "aire" },
    { nombre: "Escorpio", glifo: "♏︎", elemento: "agua" },
    { nombre: "Sagitario", glifo: "♐︎", elemento: "fuego" },
    { nombre: "Capricornio", glifo: "♑︎", elemento: "tierra" },
    { nombre: "Acuario", glifo: "♒︎", elemento: "aire" },
    { nombre: "Piscis", glifo: "♓︎", elemento: "agua" },
] as const;
export type Signo = (typeof SIGNOS)[number];

/** Color Trinity de cada elemento: fuego ámbar, tierra esmeralda, aire violeta, agua azul. */
export const COLOR_ELEMENTO: Record<Signo["elemento"], string> = { fuego: "#FFBF00", tierra: "#10B981", aire: "#b69cff", agua: "#38a7ff" };

const signoDe = (lonRad: number): Signo => SIGNOS[Math.floor((normalizar(lonRad) / RAD) / 30) % 12];
/** Signo de una longitud eclíptica en grados. */
export const signoDeGrados = (g: number): Signo => SIGNOS[Math.floor(normalizarGrados(g) / 30) % 12];

/** Signo zodiacal trópico en el que están el Sol y la Luna en este instante. */
export function signosDelCielo(fecha: Date): { sol: Signo; luna: Signo } {
    const d = dias(fecha);
    return { sol: signoDe(coordenadasSol(d).lon), luna: signoDe(coordenadasLuna(d).lon) };
}

/** Cuándo entra el Sol en el siguiente signo (búsqueda por días y luego por horas; ±1 h). */
export function proximoCambioDeSigno(fecha: Date): { fecha: Date; signo: Signo } {
    const actual = signosDelCielo(fecha).sol.nombre;
    let t = fecha.getTime();
    for (let d = 1; d <= 32; d++) {
        const f = new Date(fecha.getTime() + d * DIA_MS);
        if (signosDelCielo(f).sol.nombre !== actual) { t = f.getTime() - DIA_MS; break; }
    }
    for (let h = 0; h <= 25; h++) {
        const f = new Date(t + h * 3_600_000);
        const s = signosDelCielo(f).sol;
        if (s.nombre !== actual) return { fecha: f, signo: s };
    }
    return { fecha: new Date(t + DIA_MS), signo: signosDelCielo(new Date(t + DIA_MS)).sol };
}

// ── Ascendente y medio cielo ───────────────────────────────────────────────────────────────

/** Longitud eclíptica (grados) del ascendente: el punto de la eclíptica que sale por el este. */
export function ascendente(fecha: Date, lat: number, lon: number): number {
    const th = tiempoSidereoLocal(fecha, lon), phi = RAD * lat;
    return normalizarGrados(Math.atan2(Math.cos(th), -(Math.sin(th) * Math.cos(OBLICUIDAD) + Math.tan(phi) * Math.sin(OBLICUIDAD))) / RAD);
}

/** Longitud eclíptica (grados) del medio cielo: el punto de la eclíptica que culmina. */
export function medioCielo(fecha: Date, lon: number): number {
    const th = tiempoSidereoLocal(fecha, lon);
    return normalizarGrados(Math.atan2(Math.sin(th), Math.cos(th) * Math.cos(OBLICUIDAD)) / RAD);
}

// ── Planetas (elementos aproximados del JPL, eclíptica J2000 → de la fecha) ────────────────

export type ClavePlaneta = "sol" | "luna" | "mercurio" | "venus" | "marte" | "jupiter" | "saturno" | "urano" | "neptuno";

export const PLANETAS: { clave: ClavePlaneta; nombre: string; glifo: string; color: string }[] = [
    { clave: "sol", nombre: "Sol", glifo: "☉", color: "#FFBF00" },
    { clave: "luna", nombre: "Luna", glifo: "☽", color: "#e9e4d4" },
    { clave: "mercurio", nombre: "Mercurio", glifo: "☿", color: "#9fdcff" },
    { clave: "venus", nombre: "Venus", glifo: "♀︎", color: "#f5a3c7" },
    { clave: "marte", nombre: "Marte", glifo: "♂︎", color: "#ff6b4a" },
    { clave: "jupiter", nombre: "Júpiter", glifo: "♃", color: "#ffd27a" },
    { clave: "saturno", nombre: "Saturno", glifo: "♄", color: "#c9b27a" },
    { clave: "urano", nombre: "Urano", glifo: "♅", color: "#7fe3d8" },
    { clave: "neptuno", nombre: "Neptuno", glifo: "♆", color: "#7c9cff" },
];

/** a, ȧ, e, ė, I, İ, L, L̇, ϖ, ϖ̇, Ω, Ω̇ (UA, grados; tasas por siglo juliano). */
const ELEMENTOS: Record<"mercurio" | "venus" | "tierra" | "marte" | "jupiter" | "saturno" | "urano" | "neptuno", number[]> = {
    mercurio: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.2503235, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
    venus: [0.72333566, 0.0000039, 0.00677672, -0.00004107, 3.39467605, -0.0007889, 181.9790995, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
    tierra: [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
    marte: [1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
    jupiter: [5.202887, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
    saturno: [9.53667594, -0.0012506, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
    urano: [19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.9542763, 0.40805281, 74.01692503, 0.04240589],
    neptuno: [30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664],
};

function heliocentrica(el: number[], T: number): [number, number, number] {
    const a = el[0] + el[1] * T, e = el[2] + el[3] * T, I = RAD * (el[4] + el[5] * T);
    const L = el[6] + el[7] * T, peri = el[8] + el[9] * T, nodo = el[10] + el[11] * T;
    const w = RAD * (peri - nodo), O = RAD * nodo;
    const M = RAD * diferencia(L - peri, 0);
    let E = M + e * Math.sin(M);
    for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
    return [
        (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
        (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
        sw * sI * xp + cw * sI * yp,
    ];
}

/** Longitud eclíptica geocéntrica (grados, eclíptica de la fecha) de un astro. */
export function longitudGeocentrica(clave: ClavePlaneta, fecha: Date): number {
    const d = dias(fecha);
    if (clave === "sol") return normalizarGrados(coordenadasSol(d).lon / RAD);
    if (clave === "luna") return normalizarGrados(coordenadasLuna(d).lon / RAD);
    const T = d / 36525;
    const [px, py] = heliocentrica(ELEMENTOS[clave], T), [tx, ty] = heliocentrica(ELEMENTOS.tierra, T);
    return normalizarGrados(Math.atan2(py - ty, px - tx) / RAD + 1.396971 * T);
}

export interface PosicionPlaneta {
    clave: ClavePlaneta; nombre: string; glifo: string; color: string;
    /** Longitud eclíptica, grados [0, 360). */
    lon: number;
    signo: Signo;
    /** Grado dentro del signo, 0-29. */
    grado: number;
    retrogrado: boolean;
}

/** Dónde está cada astro ahora (Sol, Luna y los siete planetas), con su signo y si retrograda. */
export function posicionesPlanetas(fecha: Date): PosicionPlaneta[] {
    const medio = 12 * 3_600_000;
    return PLANETAS.map((p) => {
        const lon = longitudGeocentrica(p.clave, fecha);
        const retrogrado = p.clave !== "sol" && p.clave !== "luna"
            && diferencia(longitudGeocentrica(p.clave, new Date(fecha.getTime() + medio)), longitudGeocentrica(p.clave, new Date(fecha.getTime() - medio))) < 0;
        return { ...p, lon, signo: signoDeGrados(lon), grado: Math.floor(lon % 30), retrogrado };
    });
}

// ── Hora planetaria (orden caldeo) ─────────────────────────────────────────────────────────

/** Orden caldeo, del más lento al más rápido. */
export const CALDEO: ClavePlaneta[] = ["saturno", "jupiter", "marte", "sol", "venus", "mercurio", "luna"];
/** Regente de cada día de la semana (`getDay()`: 0 = domingo, día del Sol). */
const REGENTES: ClavePlaneta[] = ["sol", "luna", "marte", "mercurio", "jupiter", "venus", "saturno"];

/** Planeta que rige el día civil de `fecha` (no depende del lugar). */
export function regenteDelDia(fecha: Date): ClavePlaneta {
    return REGENTES[fecha.getDay()];
}

export interface HoraPlanetaria {
    planeta: ClavePlaneta;
    /** 0-11 horas del día (orto → ocaso), 12-23 de la noche (ocaso → orto). */
    indice: number;
    deDia: boolean;
    inicio: Date;
    fin: Date;
    regenteDia: ClavePlaneta;
}

/** La hora planetaria de `fecha` en este lugar: el día y la noche se parten en doce horas
 *  desiguales cada uno, y cada hora la rige el siguiente planeta del orden caldeo. */
export function horaPlanetaria(fecha: Date, lat: number, lon: number): HoraPlanetaria | null {
    const t = fecha.getTime();
    const hoy = horasDelSol(fecha, lat, lon);
    if (!hoy.orto || !hoy.ocaso) return null;
    let inicio: number, fin: number, base: number, dia: Date;
    if (t >= hoy.orto.getTime() && t < hoy.ocaso.getTime()) {
        inicio = hoy.orto.getTime(); fin = hoy.ocaso.getTime(); base = 0; dia = hoy.orto;
    } else if (t >= hoy.ocaso.getTime()) {
        const manana = horasDelSol(new Date(t + DIA_MS), lat, lon).orto;
        if (!manana) return null;
        inicio = hoy.ocaso.getTime(); fin = manana.getTime(); base = 12; dia = hoy.orto;
    } else {
        const ayer = horasDelSol(new Date(t - DIA_MS), lat, lon);
        if (!ayer.orto || !ayer.ocaso) return null;
        inicio = ayer.ocaso.getTime(); fin = hoy.orto.getTime(); base = 12; dia = ayer.orto;
    }
    const largo = (fin - inicio) / 12;
    const parte = Math.min(11, Math.max(0, Math.floor((t - inicio) / largo)));
    const regenteDia = regenteDelDia(dia);
    const indice = base + parte;
    return {
        planeta: CALDEO[(CALDEO.indexOf(regenteDia) + indice) % 7],
        indice, deDia: base === 0,
        inicio: new Date(inicio + parte * largo), fin: new Date(inicio + (parte + 1) * largo),
        regenteDia,
    };
}
