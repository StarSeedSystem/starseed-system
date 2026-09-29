/**
 * Oráculo de Probabilidades · piezas PURAS (Ola 0929-C).
 *
 * Solo probabilidades REALES de modelos públicos, dichas como tales (no certezas):
 * - lluvia (hoy, mañana, pasado): `precipitation_probability` de Open-Meteo;
 * - apagones de radio (R1+) y tormentas de radiación solar (S1+): escalas de NOAA SWPC
 *   (`noaa-scales.json`, probabilidad para los próximos 3 días);
 * - tormenta geomagnética: el Kp previsto de NOAA (escala G, sin porcentaje: NOAA no lo da).
 */
import type { EstadoKp, Meteo } from "../gen5/_catalogo/meteo";
import { escalaG } from "../gen5/_catalogo/meteo";
import { fechaLocal } from "./energy-grid-partes";

export const URL_ESCALAS = "https://services.swpc.noaa.gov/products/noaa-scales.json";

export interface DiaEscalas { fecha: string; radioMenor: number | null; radioMayor: number | null; radiacion: number | null; g: number | null }

const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
};

/** `noaa-scales.json` → los días de previsión (1, 2 y 3). Lanza si no trae ninguno. */
export function analizarEscalas(j: unknown): DiaEscalas[] {
    const o = (j ?? {}) as Record<string, any>;
    const out: DiaEscalas[] = [];
    for (const k of ["1", "2", "3"]) {
        const d = o[k];
        if (!d || typeof d !== "object") continue;
        out.push({
            fecha: typeof d.DateStamp === "string" ? d.DateStamp : "",
            radioMenor: num(d.R?.MinorProb),
            radioMayor: num(d.R?.MajorProb),
            radiacion: num(d.S?.Prob),
            g: num(d.G?.Scale),
        });
    }
    if (!out.length) throw new Error("La fuente no devolvió la previsión del espacio");
    return out;
}

export type Clase = "tierra" | "cielo" | "espacio";

export interface Presagio {
    id: string;
    pregunta: string;
    /** La pregunta en dos o tres palabras, para los tamaños estrechos. */
    corta: string;
    /** 0–1, o null si la fuente da una escala y no una probabilidad. */
    prob: number | null;
    /** Texto de la respuesta cuando no hay probabilidad (p. ej. «G1 prevista»). */
    respuesta?: string;
    horizonte: string;
    fuente: string;
    clase: Clase;
}

/** Máxima probabilidad de lluvia en las horas que quedan del día en el lugar. */
export function lluviaRestoDeHoy(m: Meteo, ahora: number): number | null {
    const hoy = fechaLocal(ahora, m.zona);
    const h = m.horas.filter((x) => x.t > ahora && fechaLocal(x.t - 1, m.zona) === hoy);
    return h.length ? Math.max(...h.map((x) => x.probLluvia)) / 100 : null;
}

export function presagios(meteo: Meteo | null, escalas: DiaEscalas[] | null, kp: EstadoKp | null, ahora: number): Presagio[] {
    const out: Presagio[] = [];
    if (meteo) {
        const hoy = lluviaRestoDeHoy(meteo, ahora);
        if (hoy !== null) out.push({ id: "lluvia-hoy", pregunta: "¿Lloverá lo que queda de hoy?", corta: "Lluvia hoy", prob: hoy, horizonte: "resto del día", fuente: "Open-Meteo", clase: "tierra" });
        const d1 = meteo.dias[1], d2 = meteo.dias[2];
        if (d1) out.push({ id: "lluvia-manana", pregunta: "¿Lloverá mañana?", corta: "Lluvia mañana", prob: d1.probLluviaMax / 100, horizonte: "mañana", fuente: "Open-Meteo", clase: "tierra" });
        if (d2) out.push({ id: "lluvia-pasado", pregunta: "¿Lloverá pasado mañana?", corta: "Lluvia pasado mañana", prob: d2.probLluviaMax / 100, horizonte: "pasado mañana", fuente: "Open-Meteo", clase: "tierra" });
    }
    if (escalas?.length) {
        const r = Math.max(...escalas.map((d) => d.radioMenor ?? -1));
        const s = Math.max(...escalas.map((d) => d.radiacion ?? -1));
        if (r >= 0) out.push({ id: "radio", pregunta: "¿Apagón de radio por el Sol (R1+)?", corta: "Apagón de radio", prob: r / 100, horizonte: "3 días", fuente: "NOAA SWPC", clase: "espacio" });
        if (s >= 0) out.push({ id: "radiacion", pregunta: "¿Tormenta de radiación solar (S1+)?", corta: "Radiación solar", prob: s / 100, horizonte: "3 días", fuente: "NOAA SWPC", clase: "espacio" });
    }
    if (kp?.maxPrevisto) {
        const e = escalaG(kp.maxPrevisto.kp);
        out.push({
            id: "geomagnetica", pregunta: "¿Tormenta geomagnética (auroras)?", corta: "Auroras", prob: null,
            respuesta: e.g > 0 ? `G${e.g} prevista (Kp ${kp.maxPrevisto.kp.toLocaleString("es-ES", { maximumFractionDigits: 1 })})` : `No prevista (Kp máx. ${kp.maxPrevisto.kp.toLocaleString("es-ES", { maximumFractionDigits: 1 })})`,
            horizonte: "3 días", fuente: "NOAA SWPC", clase: "cielo",
        });
    }
    return out;
}

/** El presagio más probable (para el centro del orbe y los tamaños pequeños). */
export function destacado(ps: Presagio[]): Presagio | null {
    return ps.filter((p) => p.prob !== null).sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0))[0] ?? ps[0] ?? null;
}

export function pct(p: number): string {
    return `${Math.round(p * 100)} %`;
}
