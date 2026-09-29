/**
 * Energía del Sol · piezas PURAS (Ola 0929-C).
 *
 * Todo sale de la radiación REAL de Open-Meteo para tu lugar (`gen5/_catalogo/meteo.ts`):
 * - `radiacion` horaria (W/m², media de la hora ANTERIOR: el valor de las 13:00 es 12:00–13:00);
 * - `radiacionSuma` diaria (MJ/m²).
 * La producción es una estimación honesta por cada kWp de paneles: kWh/m² × rendimiento (80 %).
 */
import type { Meteo } from "../gen5/_catalogo/meteo";

export const RENDIMIENTO = 0.8;
const HORA = 3_600_000;

/** MJ/m² del día → kWh que daría 1 kWp de paneles (con el rendimiento típico del sistema). */
export function kwhPorKwp(mjm2: number): number {
    return Math.max(0, (mjm2 / 3.6) * RENDIMIENTO);
}

/** «2026-09-29» de un instante en la zona del lugar (o en la del navegador si no es válida). */
export function fechaLocal(t: number, zona?: string): string {
    try {
        return new Intl.DateTimeFormat("en-CA", { timeZone: zona || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
    } catch {
        return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
    }
}

/** «13:00» en la hora del lugar. */
export function horaLocal(t: number, zona?: string): string {
    try {
        return new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: zona || undefined });
    } catch {
        return new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    }
}

export interface PuntoSol { t: number; w: number }

export interface DiaSolar {
    fecha: string;
    /** Puntos de la curva (fin de cada hora) con algo de luz, más un cero a cada lado. */
    puntos: PuntoSol[];
    orto: number | null;
    ocaso: number | null;
    pico: PuntoSol | null;
    /** La franja de abundancia: horas seguidas alrededor del pico con ≥ 70 % de su radiación. */
    franja: { desde: number; hasta: number } | null;
    kwh: number;
}

export function diaSolar(m: Meteo, indice: number): DiaSolar | null {
    const d = m.dias[indice];
    if (!d) return null;
    const delDia = m.horas.filter((h) => fechaLocal(h.t - 1, m.zona) === d.fecha);
    const conLuz = delDia.map((h) => ({ t: h.t, w: Math.max(0, h.radiacion) }));
    const iPrimero = conLuz.findIndex((p) => p.w > 0);
    let iUltimo = -1;
    for (let i = conLuz.length - 1; i >= 0; i--) if (conLuz[i].w > 0) { iUltimo = i; break; }
    const puntos = iPrimero < 0 ? [] : conLuz.slice(Math.max(0, iPrimero - 1), Math.min(conLuz.length, iUltimo + 2));
    let pico: PuntoSol | null = null;
    for (const p of puntos) if (!pico || p.w > pico.w) pico = p;
    if (pico && pico.w <= 0) pico = null;
    return { fecha: d.fecha, puntos, orto: d.orto, ocaso: d.ocaso, pico, franja: franjaDe(puntos, pico), kwh: kwhPorKwp(d.radiacionSuma) };
}

export function franjaDe(puntos: PuntoSol[], pico: PuntoSol | null, umbral = 0.7): { desde: number; hasta: number } | null {
    if (!pico) return null;
    const i = puntos.indexOf(pico);
    let a = i, b = i;
    while (a > 0 && puntos[a - 1].w >= pico.w * umbral) a--;
    while (b < puntos.length - 1 && puntos[b + 1].w >= pico.w * umbral) b++;
    return { desde: puntos[a].t - HORA, hasta: puntos[b].t };
}

/** Cambio relativo de mañana respecto a hoy, en % entero (null si hoy no hay sol). */
export function cambioPct(hoy: number, manana: number): number | null {
    if (hoy <= 0.05) return null;
    return Math.round(((manana - hoy) / hoy) * 100);
}

export function kwhTexto(v: number): string {
    return v.toLocaleString("es-ES", { maximumFractionDigits: v < 10 ? 1 : 0, minimumFractionDigits: v < 10 ? 1 : 0 });
}
