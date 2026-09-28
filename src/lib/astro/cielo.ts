/**
 * El cielo REAL de este momento y este lugar (PURO, sin red): posición del Sol, orto y ocaso,
 * fase e iluminación de la Luna y el signo zodiacal (trópico) donde están el Sol y la Luna.
 * Fórmulas de baja precisión de Meeus/SunCalc: minutos en el orto y ~1° en la Luna, de sobra
 * para un widget. Nada se inventa: sin ubicación, lo que depende de ella vuelve null.
 */

const RAD = Math.PI / 180;
const DIA_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLICUIDAD = RAD * 23.4397;

const dias = (fecha: Date) => fecha.getTime() / DIA_MS - 0.5 + J1970 - J2000;
const desdeJuliano = (j: number) => new Date((j + 0.5 - J1970) * DIA_MS);
const ascension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(OBLICUIDAD) - Math.tan(b) * Math.sin(OBLICUIDAD), Math.cos(l));
const declinacion = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(OBLICUIDAD) + Math.cos(b) * Math.sin(OBLICUIDAD) * Math.sin(l));
const anomaliaSolar = (d: number) => RAD * (357.5291 + 0.98560028 * d);
function longitudEclipticaSol(M: number): number {
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    return M + C + RAD * 102.9372 + Math.PI;
}
function coordenadasSol(d: number) {
    const L = longitudEclipticaSol(anomaliaSolar(d));
    return { lon: L, dec: declinacion(L, 0), ra: ascension(L, 0) };
}
function coordenadasLuna(d: number) {
    const L = RAD * (218.316 + 13.176396 * d);
    const M = RAD * (134.963 + 13.064993 * d);
    const F = RAD * (93.272 + 13.22935 * d);
    const lon = L + RAD * 6.289 * Math.sin(M);
    const lat = RAD * 5.128 * Math.sin(F);
    return { lon, ra: ascension(lon, lat), dec: declinacion(lon, lat), dist: 385001 - 20905 * Math.cos(M) };
}
const normalizar = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/** Altura del Sol sobre el horizonte, en grados. */
export function alturaSol(fecha: Date, lat: number, lon: number): number {
    const d = dias(fecha), s = coordenadasSol(d), phi = RAD * lat;
    const H = RAD * (280.16 + 360.9856235 * d) - RAD * -lon - s.ra;
    return Math.asin(Math.sin(phi) * Math.sin(s.dec) + Math.cos(phi) * Math.cos(s.dec) * Math.cos(H)) / RAD;
}

/** Orto, mediodía solar y ocaso del día de `fecha` (null si es noche o día polar). */
export function horasDelSol(fecha: Date, lat: number, lon: number): { orto: Date | null; mediodia: Date; ocaso: Date | null } {
    const lw = RAD * -lon, phi = RAD * lat, J0 = 0.0009;
    const n = Math.round(dias(fecha) - J0 - lw / (2 * Math.PI));
    const ds = J0 + lw / (2 * Math.PI) + n;
    const M = anomaliaSolar(ds), L = longitudEclipticaSol(M), dec = declinacion(L, 0);
    const jMediodia = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const cosW = (Math.sin(RAD * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cosW < -1 || cosW > 1) return { orto: null, mediodia: desdeJuliano(jMediodia), ocaso: null };
    const w = Math.acos(cosW);
    const a = J0 + (w + lw) / (2 * Math.PI) + n;
    const jOcaso = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    return { orto: desdeJuliano(jMediodia - (jOcaso - jMediodia)), mediodia: desdeJuliano(jMediodia), ocaso: desdeJuliano(jOcaso) };
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

/** Próxima luna llena o nueva a partir de `fecha` (búsqueda por horas en 31 días; ±1 h). */
export function proximaFase(fecha: Date, objetivo: "llena" | "nueva"): Date {
    const meta = objetivo === "llena" ? 0.5 : 0;
    const distancia = (f: number) => { const x = Math.abs(f - meta) % 1; return Math.min(x, 1 - x); };
    let mejor = fecha.getTime(), dMin = Infinity;
    for (let h = 1; h <= 31 * 24; h++) {
        const t = fecha.getTime() + h * 3_600_000;
        const d = distancia(faseLunar(new Date(t)).fase);
        if (d < dMin) { dMin = d; mejor = t; }
    }
    return new Date(mejor);
}

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

/** Signo zodiacal trópico en el que están el Sol y la Luna en este instante. */
export function signosDelCielo(fecha: Date): { sol: Signo; luna: Signo } {
    const d = dias(fecha);
    return { sol: signoDe(coordenadasSol(d).lon), luna: signoDe(coordenadasLuna(d).lon) };
}
