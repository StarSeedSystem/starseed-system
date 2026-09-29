/**
 * Mapa de Energía · piezas PURAS (Ola 0929-C).
 *
 * El cielo es REAL y se calcula sin red (`@/lib/astro`, `@/lib/astro/cielo`): posición de los
 * siete cuerpos clásicos en el zodiaco trópico y la fase de la Luna. El biorritmo (ciclos
 * clásicos de 23, 28 y 33 días) solo tiene sentido desde TU fecha de nacimiento: si no la das,
 * no se inventa ninguna (antes contaba desde el año 2000 para todo el mundo). La fecha se
 * guarda solo en este dispositivo.
 */
import { biorhythm, type Biorhythm } from "@/lib/astro";

export const CLAVE_NACIMIENTO = "starseed.astro.nacimiento.v1";

export const EFECTO: Record<string, string> = {
    Sol: "Identidad y voluntad",
    Luna: "Emoción e intuición",
    Mercurio: "Mente y comunicación",
    Venus: "Vínculo y belleza",
    Marte: "Impulso y coraje",
    "Júpiter": "Expansión y sentido",
    Saturno: "Estructura y maestría",
};

export const CORTO: Record<string, string> = { Sol: "Sol", Luna: "Lu", Mercurio: "Me", Venus: "Ve", Marte: "Ma", "Júpiter": "Jú", Saturno: "Sa" };

/**
 * Longitud eclíptica (grados) → punto en la rueda: Aries a la izquierda (ascendente simbólico)
 * y el zodiaco en sentido antihorario, como en una carta.
 */
export function enRueda(lonGrados: number, r: number, c: number): { x: number; y: number } {
    const a = Math.PI + (lonGrados * Math.PI) / 180;
    return { x: c + Math.cos(a) * r, y: c - Math.sin(a) * r };
}

/** Silueta iluminada de la Luna (hemisferio norte: creciente iluminada a la derecha). */
export function trazoLuna(c: number, cy: number, r: number, iluminada: number, creciente: boolean): string {
    const k = Math.min(1, Math.max(0, iluminada));
    const rx = Math.abs(1 - 2 * k) * r;
    const primero = creciente ? 1 : 0;
    const segundo = creciente ? (k < 0.5 ? 0 : 1) : (k < 0.5 ? 1 : 0);
    return `M${c} ${cy - r}A${r} ${r} 0 1 ${primero} ${c} ${cy + r}A${rx.toFixed(2)} ${r} 0 1 ${segundo} ${c} ${cy - r}Z`;
}

/** «1987-06-21» válida, no futura y desde 1900. */
export function fechaValida(v: string, hoy = new Date()): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const t = Date.parse(`${v}T12:00:00Z`);
    return Number.isFinite(t) && t <= hoy.getTime() && t >= Date.UTC(1900, 0, 1);
}

export function leerNacimiento(): string | null {
    try {
        const v = localStorage.getItem(CLAVE_NACIMIENTO);
        return v && fechaValida(v) ? v : null;
    } catch { return null; }
}

export function guardarNacimiento(v: string | null) {
    try {
        if (v) localStorage.setItem(CLAVE_NACIMIENTO, v);
        else localStorage.removeItem(CLAVE_NACIMIENTO);
    } catch { /* sin almacén: vale en memoria */ }
}

/** Los tres ciclos de hoy y la curva de ±`dias` días alrededor. */
export function ciclos(nacimiento: string, hoy: Date, dias = 7): { hoy: Biorhythm; curva: { d: number; b: Biorhythm }[] } {
    const base = new Date(`${nacimiento}T12:00:00Z`);
    const curva: { d: number; b: Biorhythm }[] = [];
    for (let d = -dias; d <= dias; d += 0.5) curva.push({ d, b: biorhythm(new Date(hoy.getTime() + d * 86_400_000), base) });
    return { hoy: biorhythm(hoy, base), curva };
}

export function pctCiclo(v: number): number {
    return Math.round(((v + 1) / 2) * 100);
}
