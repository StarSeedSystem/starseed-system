"use client";
/**
 * Lo que el cielo da al Oikos (paquete B · Ola 0929).
 *
 * Datos REALES y públicos, sin clave: Open-Meteo (la misma fuente del Clima del OS) — radiación
 * solar diaria (MJ/m² → kWh/m²), horas de sol y lluvia (mm = L/m²) de hoy y los próximos 6 días
 * en la ubicación del Clima. Una petición por lugar y hora como mucho (caché compartida, TTL 60 min).
 * Las captaciones son ESTIMACIONES con supuestos a la vista (superficie y rendimiento que eliges).
 */

export interface DiaOikos {
    fecha: string;
    /** Radiación solar sobre plano horizontal, kWh/m². */
    solKwh: number;
    /** Lluvia, L/m² (= mm). */
    lluviaL: number;
    /** Horas de sol. */
    solHoras: number;
}

export interface CieloOikos { dias: DiaOikos[]; lugar: string }

export const RENDIMIENTO_PANEL = 0.18;
export const APROVECHAMIENTO_TEJADO = 0.8;

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** Respuesta de Open-Meteo → días del Oikos (PURO). */
export function leerRespuestaOikos(j: unknown): DiaOikos[] {
    const d = (j as { daily?: Record<string, unknown[]> } | null)?.daily;
    if (!d || !Array.isArray(d.time)) return [];
    return (d.time as string[]).map((fecha, i) => ({
        fecha,
        solKwh: num(d.shortwave_radiation_sum?.[i]) / 3.6,
        lluviaL: num(d.precipitation_sum?.[i]),
        solHoras: num(d.sunshine_duration?.[i]) / 3600,
    }));
}

/** Energía estimada (kWh) de `m2` de paneles con rendimiento `r` para `kwhM2` de radiación. */
export function energiaPaneles(kwhM2: number, m2: number, r = RENDIMIENTO_PANEL): number {
    return Math.max(0, kwhM2 * m2 * r);
}

/** Agua estimada (L) de `m2` de tejado con aprovechamiento `a` para `litrosM2` de lluvia. */
export function aguaTejado(litrosM2: number, m2: number, a = APROVECHAMIENTO_TEJADO): number {
    return Math.max(0, litrosM2 * m2 * a);
}

/** Día de la semana corto en español («lun», «mar»…) de una fecha ISO (AAAA-MM-DD). */
export function diaCorto(fecha: string): string {
    const d = new Date(`${fecha}T12:00:00`);
    return Number.isNaN(d.getTime()) ? fecha : d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");
}

export async function cargarCieloOikos(lat: number, lon: number, lugar: string): Promise<CieloOikos> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`
        + "&daily=shortwave_radiation_sum,precipitation_sum,sunshine_duration&timezone=auto&forecast_days=7";
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 9000) : null;
    try {
        const r = await fetch(url, { signal: ctl?.signal });
        if (!r.ok) throw new Error("El servicio del cielo no responde ahora.");
        const dias = leerRespuestaOikos(await r.json());
        if (dias.length === 0) throw new Error("El servicio del cielo no trajo días.");
        return { dias, lugar };
    } finally {
        if (t) clearTimeout(t);
    }
}
