"use client";
/**
 * ¿Qué sembrar esta semana aquí? (paquete B · Ola 0929)
 *
 * Datos REALES y públicos, sin clave: Open-Meteo (la fuente del Clima del OS) — temperatura del
 * suelo a 6 cm (media diaria de los datos horarios), mínimas, máximas y lluvia de los próximos 7
 * días en tu ubicación del Clima. Una petición por lugar y hora como mucho (caché compartida).
 * Las reglas de siembra son conocimiento agronómico general y están a la vista (umbral de suelo,
 * helada, calor): orientan, no sustituyen el saber de tu huerta ni tu variedad.
 */

export interface DiaSiembra { fecha: string; sueloC: number | null; minC: number; maxC: number; lluviaL: number }

export interface Cultivo {
    nombre: string;
    /** Temperatura mínima del suelo para germinar/arraigar (°C). */
    suelo: number;
    /** true si aguanta heladas ligeras. */
    heladas: boolean;
    /** Mínima nocturna segura si no aguanta heladas (°C). */
    minSegura: number;
    /** Máxima por encima de la cual sufre (se espiga, aborta flor…). */
    maxSufre: number;
    /** Semanas aproximadas a la cosecha. */
    semanas: number;
}

export const CULTIVOS: Cultivo[] = [
    { nombre: "Espinaca", suelo: 2, heladas: true, minSegura: -5, maxSufre: 24, semanas: 6 },
    { nombre: "Habas", suelo: 4, heladas: true, minSegura: -5, maxSufre: 25, semanas: 16 },
    { nombre: "Ajo", suelo: 3, heladas: true, minSegura: -8, maxSufre: 30, semanas: 30 },
    { nombre: "Lechuga", suelo: 4, heladas: true, minSegura: -2, maxSufre: 27, semanas: 7 },
    { nombre: "Guisante", suelo: 5, heladas: true, minSegura: -3, maxSufre: 25, semanas: 11 },
    { nombre: "Rábano", suelo: 5, heladas: true, minSegura: -2, maxSufre: 28, semanas: 4 },
    { nombre: "Acelga", suelo: 5, heladas: true, minSegura: -2, maxSufre: 30, semanas: 8 },
    { nombre: "Zanahoria", suelo: 7, heladas: true, minSegura: -2, maxSufre: 30, semanas: 11 },
    { nombre: "Cebolla", suelo: 7, heladas: true, minSegura: -3, maxSufre: 32, semanas: 18 },
    { nombre: "Col y brócoli", suelo: 7, heladas: true, minSegura: -3, maxSufre: 27, semanas: 12 },
    { nombre: "Maíz", suelo: 12, heladas: false, minSegura: 5, maxSufre: 36, semanas: 13 },
    { nombre: "Tomate", suelo: 15, heladas: false, minSegura: 8, maxSufre: 35, semanas: 12 },
    { nombre: "Calabacín", suelo: 16, heladas: false, minSegura: 8, maxSufre: 36, semanas: 8 },
    { nombre: "Judía", suelo: 16, heladas: false, minSegura: 8, maxSufre: 33, semanas: 9 },
    { nombre: "Pepino", suelo: 16, heladas: false, minSegura: 10, maxSufre: 35, semanas: 9 },
    { nombre: "Pimiento", suelo: 18, heladas: false, minSegura: 10, maxSufre: 35, semanas: 14 },
    { nombre: "Albahaca", suelo: 18, heladas: false, minSegura: 10, maxSufre: 36, semanas: 8 },
];

export type Veredicto = "ahora" | "casi" | "esperar";
export interface Consejo { cultivo: Cultivo; veredicto: Veredicto; motivo: string }

export interface ResumenSemana { sueloMedio: number | null; minima: number; maxima: number; diaHelada: string | null; lluvia: number }

const num = (v: unknown): number | null => {
    const n = Number(v);
    return v === null || v === undefined || !Number.isFinite(n) ? null : n;
};

/** Respuesta de Open-Meteo → días (media diaria del suelo a partir de las horas). PURO. */
export function leerRespuestaSiembra(j: unknown): DiaSiembra[] {
    const r = j as { daily?: Record<string, unknown[]>; hourly?: Record<string, unknown[]> } | null;
    const d = r?.daily, h = r?.hourly;
    if (!d || !Array.isArray(d.time)) return [];
    const porDia = new Map<string, number[]>();
    if (h && Array.isArray(h.time) && Array.isArray(h.soil_temperature_6cm)) {
        (h.time as string[]).forEach((t, i) => {
            const v = num(h.soil_temperature_6cm[i]);
            if (v === null) return;
            const dia = String(t).slice(0, 10);
            const lista = porDia.get(dia) ?? [];
            lista.push(v);
            porDia.set(dia, lista);
        });
    }
    return (d.time as string[]).map((fecha, i) => {
        const suelo = porDia.get(fecha);
        return {
            fecha,
            sueloC: suelo && suelo.length ? suelo.reduce((s, x) => s + x, 0) / suelo.length : null,
            minC: num(d.temperature_2m_min?.[i]) ?? 0,
            maxC: num(d.temperature_2m_max?.[i]) ?? 0,
            lluviaL: num(d.precipitation_sum?.[i]) ?? 0,
        };
    });
}

export function resumenSemana(dias: DiaSiembra[]): ResumenSemana {
    const suelos = dias.map((d) => d.sueloC).filter((x): x is number => x !== null);
    const helada = dias.find((d) => d.minC <= 0);
    return {
        sueloMedio: suelos.length ? suelos.reduce((s, x) => s + x, 0) / suelos.length : null,
        minima: Math.min(...dias.map((d) => d.minC)),
        maxima: Math.max(...dias.map((d) => d.maxC)),
        diaHelada: helada ? helada.fecha : null,
        lluvia: dias.reduce((s, d) => s + d.lluviaL, 0),
    };
}

const f0 = (v: number) => `${Math.round(v)}°`;

/** Qué hacer con cada cultivo esta semana, con su motivo. PURO. */
export function consejos(s: ResumenSemana, cultivos: Cultivo[] = CULTIVOS): Consejo[] {
    const orden: Record<Veredicto, number> = { ahora: 0, casi: 1, esperar: 2 };
    return cultivos.map((c): Consejo => {
        if (!c.heladas && s.minima < c.minSegura) return { cultivo: c, veredicto: "esperar", motivo: `noches de ${f0(s.minima)}: necesita ≥ ${f0(c.minSegura)}` };
        if (c.heladas && s.minima < c.minSegura) return { cultivo: c, veredicto: "esperar", motivo: `helada fuerte (${f0(s.minima)})` };
        if (s.maxima > c.maxSufre) return { cultivo: c, veredicto: s.maxima - c.maxSufre <= 3 ? "casi" : "esperar", motivo: `máximas de ${f0(s.maxima)}: sufre por encima de ${f0(c.maxSufre)}` };
        if (s.sueloMedio === null) return { cultivo: c, veredicto: "casi", motivo: "sin dato del suelo: mira el aire" };
        if (s.sueloMedio >= c.suelo) return { cultivo: c, veredicto: "ahora", motivo: `suelo a ${f0(s.sueloMedio)} (≥ ${f0(c.suelo)})` };
        if (c.suelo - s.sueloMedio <= 3) return { cultivo: c, veredicto: "casi", motivo: `suelo a ${f0(s.sueloMedio)} de ${f0(c.suelo)}` };
        return { cultivo: c, veredicto: "esperar", motivo: `suelo frío: ${f0(s.sueloMedio)} de ${f0(c.suelo)}` };
    }).sort((a, b) => orden[a.veredicto] - orden[b.veredicto] || a.cultivo.semanas - b.cultivo.semanas);
}

export async function cargarSiembra(lat: number, lon: number): Promise<DiaSiembra[]> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`
        + "&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&hourly=soil_temperature_6cm&timezone=auto&forecast_days=7";
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 9000) : null;
    try {
        const r = await fetch(url, { signal: ctl?.signal });
        if (!r.ok) throw new Error("El servicio del tiempo no responde ahora.");
        const dias = leerRespuestaSiembra(await r.json());
        if (dias.length === 0) throw new Error("El servicio del tiempo no trajo días.");
        return dias;
    } finally {
        if (t) clearTimeout(t);
    }
}
