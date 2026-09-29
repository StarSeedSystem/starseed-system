/**
 * Carta natal REAL (paquete B · Ola 0929) — PURO, sin red.
 *
 * A partir de TUS datos de nacimiento (fecha, hora opcional y lugar) calcula las posiciones
 * eclípticas del Sol, la Luna y los planetas clásicos (src/lib/astro.ts, precisión de grados:
 * de sobra para una carta), el Ascendente y el Medio Cielo (tiempo sidéreo local), casas iguales
 * desde el Ascendente, los aspectos natales y los tránsitos de hoy sobre tu carta.
 * Sin hora de nacimiento no hay Ascendente ni casas, y se dice.
 */
import { julianDay, planetPositions, signFromLongitude, type PlanetName } from "@/lib/astro";

export interface DatosNacimiento {
    /** AAAA-MM-DD */
    fecha: string;
    /** HH:MM (hora local del lugar) o null si no se sabe. */
    hora: string | null;
    lugar: { nombre: string; lat: number; lon: number; zona: string | null } | null;
}

export interface Cuerpo { cuerpo: PlanetName | "Ascendente" | "Medio Cielo"; simbolo: string; lon: number; signo: string; indiceSigno: number; grado: number; casa: number | null }

export interface Carta {
    instante: Date;
    cuerpos: Cuerpo[];
    asc: number | null;
    mc: number | null;
    /** true si falta la hora (Luna aproximada, sin Ascendente ni casas). */
    sinHora: boolean;
}

export type TipoAspecto = "conjunción" | "oposición" | "trígono" | "cuadratura" | "sextil";
export interface Aspecto { a: string; b: string; tipo: TipoAspecto; orbe: number; exacto: number }

export const ASPECTOS: { tipo: TipoAspecto; angulo: number; orbe: number; color: string }[] = [
    { tipo: "conjunción", angulo: 0, orbe: 7, color: "#fde68a" },
    { tipo: "oposición", angulo: 180, orbe: 7, color: "#f43f5e" },
    { tipo: "trígono", angulo: 120, orbe: 6, color: "#34d399" },
    { tipo: "cuadratura", angulo: 90, orbe: 6, color: "#fb7185" },
    { tipo: "sextil", angulo: 60, orbe: 4, color: "#38bdf8" },
];

const SELECTOR_TEXTO = "︎";
export const SIMBOLO: Record<string, string> = {
    Sol: "☉", Luna: "☽", Mercurio: "☿", Venus: "♀", Marte: "♂", Júpiter: "♃", Saturno: "♄", Ascendente: "AC", "Medio Cielo": "MC",
};
export const GLIFO_SIGNO = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"].map((g) => g + SELECTOR_TEXTO);
export const NOMBRE_SIGNO = ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"];
export const ELEMENTO_SIGNO: ("fuego" | "tierra" | "aire" | "agua")[] = ["fuego", "tierra", "aire", "agua", "fuego", "tierra", "aire", "agua", "fuego", "tierra", "aire", "agua"];

const RAD = Math.PI / 180;
export const norm = (g: number) => ((g % 360) + 360) % 360;

/** Diferencia angular mínima (0-180). */
export function separacion(a: number, b: number): number {
    const d = Math.abs(norm(a) - norm(b)) % 360;
    return d > 180 ? 360 - d : d;
}

/** Desfase (ms) de una zona IANA en un instante: hora local de la zona − UTC. */
export function desfaseZona(instante: number, zona: string): number {
    try {
        const f = new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const p = Object.fromEntries(f.formatToParts(new Date(instante)).map((x) => [x.type, x.value]));
        const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
        return local - Math.floor(instante / 1000) * 1000;
    } catch {
        return 0;
    }
}

/**
 * Instante UTC del nacimiento. Con zona IANA se convierte la hora local de ESE lugar (con su
 * horario de verano de aquella fecha); sin zona, se aproxima por la longitud (15° = 1 h).
 * Sin hora, se toma el mediodía local (la Luna queda a ±6° y no hay Ascendente).
 */
export function instanteNacimiento(d: DatosNacimiento): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.fecha);
    if (!m) return null;
    const [hh, mm] = d.hora && /^\d{1,2}:\d{2}$/.test(d.hora) ? d.hora.split(":").map(Number) : [12, 0];
    const pared = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm);
    if (!Number.isFinite(pared)) return null;
    if (d.lugar?.zona) {
        let utc = pared - desfaseZona(pared, d.lugar.zona);
        utc = pared - desfaseZona(utc, d.lugar.zona);
        return new Date(utc);
    }
    if (d.lugar) return new Date(pared - (d.lugar.lon / 15) * 3_600_000);
    return new Date(pared);
}

/** Ascendente y Medio Cielo (longitudes eclípticas) para un instante y un lugar. */
export function angulos(instante: Date, lat: number, lon: number): { asc: number; mc: number } {
    const jd = julianDay(instante);
    const T = (jd - 2451545.0) / 36525;
    const gmst = norm(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000);
    const ramc = norm(gmst + lon) * RAD;
    const eps = (23.4392911 - 0.0130042 * T) * RAD;
    const phi = Math.max(-66, Math.min(66, lat)) * RAD;
    const mc = norm(Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps)) / RAD);
    const asc = norm(Math.atan2(Math.cos(ramc), -(Math.sin(eps) * Math.tan(phi) + Math.cos(eps) * Math.sin(ramc))) / RAD);
    return { asc, mc };
}

function cuerpoDe(nombre: Cuerpo["cuerpo"], lon: number, asc: number | null): Cuerpo {
    const { sign, degreeInSign } = signFromLongitude(lon);
    const i = Math.floor(norm(lon) / 30);
    return {
        cuerpo: nombre,
        simbolo: (SIMBOLO[nombre] ?? "·") + (nombre === "Ascendente" || nombre === "Medio Cielo" ? "" : SELECTOR_TEXTO),
        lon: norm(lon),
        signo: sign.name,
        indiceSigno: i,
        grado: degreeInSign,
        casa: asc === null ? null : Math.floor(norm(lon - asc) / 30) + 1,
    };
}

/** Posiciones de un instante (sin lugar: sin ángulos). */
export function cielo(instante: Date): Cuerpo[] {
    return planetPositions(instante).map((p) => cuerpoDe(p.body, p.longitude, null));
}

/** La carta completa de tus datos de nacimiento, o null si no son válidos. */
export function calcularCarta(d: DatosNacimiento): Carta | null {
    const instante = instanteNacimiento(d);
    if (!instante) return null;
    const sinHora = !d.hora;
    const ang = !sinHora && d.lugar ? angulos(instante, d.lugar.lat, d.lugar.lon) : null;
    const asc = ang?.asc ?? null;
    const cuerpos = planetPositions(instante).map((p) => cuerpoDe(p.body, p.longitude, asc));
    if (ang) {
        cuerpos.push(cuerpoDe("Ascendente", ang.asc, asc));
        cuerpos.push(cuerpoDe("Medio Cielo", ang.mc, asc));
    }
    return { instante, cuerpos, asc, mc: ang?.mc ?? null, sinHora };
}

/** Aspectos entre dos listas (natal×natal si son la misma, o tránsitos×natal), del más exacto al menos. */
export function aspectos(a: Cuerpo[], b: Cuerpo[], mismo = false): Aspecto[] {
    const out: Aspecto[] = [];
    a.forEach((x, i) => {
        b.forEach((y, j) => {
            if (mismo && j <= i) return;
            if (x.cuerpo === "Medio Cielo" || y.cuerpo === "Medio Cielo") return;
            const s = separacion(x.lon, y.lon);
            for (const asp of ASPECTOS) {
                const orbe = Math.abs(s - asp.angulo);
                if (orbe <= asp.orbe) {
                    out.push({ a: x.cuerpo, b: y.cuerpo, tipo: asp.tipo, orbe, exacto: 1 - orbe / asp.orbe });
                    break;
                }
            }
        });
    });
    return out.sort((p, q) => p.orbe - q.orbe);
}

/** Reparto de los planetas por elemento (sin ángulos). */
export function elementos(c: Cuerpo[]): Record<"fuego" | "tierra" | "aire" | "agua", number> {
    const r = { fuego: 0, tierra: 0, aire: 0, agua: 0 };
    for (const x of c) if (x.cuerpo !== "Ascendente" && x.cuerpo !== "Medio Cielo") r[ELEMENTO_SIGNO[x.indiceSigno]] += 1;
    return r;
}

/** «Sol en Tauro 21°» */
export function frasePosicion(x: Cuerpo): string {
    return `${x.cuerpo} en ${x.signo} ${Math.floor(x.grado)}°`;
}

/** Validación de los datos del formulario. */
export function validarNacimiento(d: Partial<DatosNacimiento>, hoy = new Date()): string | null {
    if (!d.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) return "Indica tu fecha de nacimiento.";
    const t = Date.parse(`${d.fecha}T12:00:00Z`);
    if (!Number.isFinite(t) || t > hoy.getTime()) return "La fecha no puede ser futura.";
    if (t < Date.UTC(1800, 0, 1)) return "La fecha es demasiado antigua para este cálculo.";
    if (d.hora && !/^\d{1,2}:\d{2}$/.test(d.hora)) return "La hora debe ser HH:MM.";
    return null;
}
