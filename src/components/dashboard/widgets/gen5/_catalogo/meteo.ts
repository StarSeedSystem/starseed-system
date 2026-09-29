"use client";
/**
 * El tiempo REAL de tu lugar para los widgets que lo necesitan (energía, tránsito, hábitat y
 * oráculo): UNA petición a Open-Meteo (sin clave) por lugar cada 30 min, compartida por todos.
 * Y el índice Kp de NOAA SWPC (observado + previsión a 3 días), compartido cada 30 min.
 *
 * El análisis (`analizarMeteo`, `analizarKp`) es PURO y se prueba sin red. Si una fuente cae,
 * el widget lo dice: aquí no hay valores de reserva inventados.
 */
import * as React from "react";
import { useWeatherLocationOpcional } from "@/modules/weather/context/weather-location-context";
import { useCompartido, type EstadoCompartido } from "./recurso";

// ── Ubicación (la del clima) ──────────────────────────────────────────────

export interface Lugar { lat: number; lon: number; nombre: string }

/** La ubicación del clima: la del contexto o, fuera de él, la guardada por el clima. */
export function useLugar(): Lugar | null {
    const ctx = useWeatherLocationOpcional();
    const [guardada, setGuardada] = React.useState<Lugar | null>(null);
    React.useEffect(() => {
        if (ctx) return;
        try {
            const j = JSON.parse(localStorage.getItem("starseed_weather_location") || "null");
            if (j && typeof j.lat === "number" && typeof j.lon === "number") setGuardada({ lat: j.lat, lon: j.lon, nombre: typeof j.name === "string" ? j.name : "" });
        } catch { /* sin almacén */ }
    }, [ctx]);
    if (ctx?.location && typeof ctx.location.lat === "number" && typeof ctx.location.lon === "number") {
        return { lat: ctx.location.lat, lon: ctx.location.lon, nombre: ctx.location.name ?? "" };
    }
    return guardada;
}

// ── Open-Meteo ────────────────────────────────────────────────────────────

export interface HoraMeteo {
    /** Epoch ms (UTC real). */
    t: number;
    temp: number;
    probLluvia: number;
    lluvia: number;
    codigo: number;
    nubes: number;
    viento: number;
    /** Irradiancia global (W/m²). */
    radiacion: number;
    uv: number;
    dia: boolean;
}

export interface DiaMeteo {
    fecha: string;
    orto: number | null;
    ocaso: number | null;
    /** Radiación acumulada del día (MJ/m²). */
    radiacionSuma: number;
    probLluviaMax: number;
    uvMax: number;
    tMax: number;
    tMin: number;
    codigo: number;
}

export interface Meteo {
    zona: string;
    ahora: { temp: number; sensacion: number; humedad: number; lluvia: number; codigo: number; nubes: number; viento: number; radiacion: number; dia: boolean };
    horas: HoraMeteo[];
    dias: DiaMeteo[];
}

const n = (v: unknown, def = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : def);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Hora local del modelo («2026-09-29T14:00») → epoch real con el desfase de la zona. */
export function aEpoch(local: unknown, desfaseSeg: number): number | null {
    if (typeof local !== "string" || !local) return null;
    const t = Date.parse(`${local.length === 16 ? `${local}:00` : local}Z`);
    return Number.isFinite(t) ? t - desfaseSeg * 1000 : null;
}

export function urlMeteo(lat: number, lon: number): string {
    return "https://api.open-meteo.com/v1/forecast"
        + `?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`
        + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,shortwave_radiation"
        + "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,shortwave_radiation,uv_index,is_day"
        + "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,shortwave_radiation_sum,precipitation_probability_max,uv_index_max"
        + "&timezone=auto&forecast_days=3";
}

/** Respuesta cruda de Open-Meteo → `Meteo`. Lanza si no trae lo mínimo (el widget lo dice). */
export function analizarMeteo(j: unknown): Meteo {
    const r = (j ?? {}) as Record<string, any>;
    if (!r.current || !r.hourly) throw new Error("La fuente no respondió con el tiempo actual");
    const desfase = n(r.utc_offset_seconds);
    const c = r.current;
    const h = r.hourly;
    const horas: HoraMeteo[] = [];
    lista(h.time).forEach((tt, i) => {
        const t = aEpoch(tt, desfase);
        if (t === null) return;
        horas.push({
            t,
            temp: n(lista(h.temperature_2m)[i]),
            probLluvia: n(lista(h.precipitation_probability)[i]),
            lluvia: n(lista(h.precipitation)[i]),
            codigo: n(lista(h.weather_code)[i]),
            nubes: n(lista(h.cloud_cover)[i]),
            viento: n(lista(h.wind_speed_10m)[i]),
            radiacion: n(lista(h.shortwave_radiation)[i]),
            uv: n(lista(h.uv_index)[i]),
            dia: n(lista(h.is_day)[i], 1) === 1,
        });
    });
    const d = r.daily ?? {};
    const dias: DiaMeteo[] = lista(d.time).map((f, i) => ({
        fecha: String(f),
        orto: aEpoch(lista(d.sunrise)[i], desfase),
        ocaso: aEpoch(lista(d.sunset)[i], desfase),
        radiacionSuma: n(lista(d.shortwave_radiation_sum)[i]),
        probLluviaMax: n(lista(d.precipitation_probability_max)[i]),
        uvMax: n(lista(d.uv_index_max)[i]),
        tMax: n(lista(d.temperature_2m_max)[i]),
        tMin: n(lista(d.temperature_2m_min)[i]),
        codigo: n(lista(d.weather_code)[i]),
    }));
    return {
        zona: typeof r.timezone === "string" ? r.timezone : "",
        ahora: {
            temp: n(c.temperature_2m),
            sensacion: n(c.apparent_temperature, n(c.temperature_2m)),
            humedad: n(c.relative_humidity_2m),
            lluvia: n(c.precipitation),
            codigo: n(c.weather_code),
            nubes: n(c.cloud_cover),
            viento: n(c.wind_speed_10m),
            radiacion: n(c.shortwave_radiation),
            dia: n(c.is_day, 1) === 1,
        },
        horas,
        dias,
    };
}

async function traerJson(url: string, ms = 9000): Promise<unknown> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
        const res = await fetch(url, { signal: ctl.signal });
        if (!res.ok) throw new Error(`La fuente respondió ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

export const TTL_METEO_MS = 30 * 60_000;

/** El tiempo real del lugar del clima (null sin ubicación). */
export function useMeteo(activo: boolean): EstadoCompartido<Meteo> & { lugar: Lugar | null } {
    const lugar = useLugar();
    const clave = lugar ? `meteo:${lugar.lat.toFixed(2)},${lugar.lon.toFixed(2)}` : null;
    const r = useCompartido<Meteo>(clave, TTL_METEO_MS, async () => analizarMeteo(await traerJson(urlMeteo(lugar!.lat, lugar!.lon))), activo);
    return { ...r, lugar };
}

/** Horas desde ahora (incluida la en curso) hasta `cuantas`. */
export function horasDesde(m: Meteo, ahora: number, cuantas: number): HoraMeteo[] {
    const i = m.horas.findIndex((h) => h.t + 3_600_000 > ahora);
    return i < 0 ? [] : m.horas.slice(i, i + cuantas);
}

/** Descripción corta del código WMO. */
export function cielo(codigo: number): string {
    if (codigo === 0) return "despejado";
    if (codigo <= 2) return "algo nuboso";
    if (codigo === 3) return "cubierto";
    if (codigo <= 48) return "niebla";
    if (codigo <= 57) return "llovizna";
    if (codigo <= 67) return "lluvia";
    if (codigo <= 77) return "nieve";
    if (codigo <= 82) return "chubascos";
    if (codigo <= 86) return "chubascos de nieve";
    return "tormenta";
}

// ── NOAA SWPC · índice Kp ─────────────────────────────────────────────────

export interface PuntoKp { t: number; kp: number; tipo: "observado" | "estimado" | "previsto" }
export interface EstadoKp { actual: PuntoKp | null; maxPrevisto: PuntoKp | null; serie: PuntoKp[] }

export const URL_KP = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";

/** Acepta los dos formatos de NOAA (filas con cabecera o lista de objetos). */
export function analizarKp(j: unknown, ahora = Date.now()): EstadoKp {
    const filas = lista(j);
    const serie: PuntoKp[] = [];
    const cabecera = Array.isArray(filas[0]) ? (filas[0] as unknown[]).map(String) : null;
    for (const f of cabecera ? filas.slice(1) : filas) {
        let tag: unknown, kp: unknown, obs: unknown;
        if (Array.isArray(f) && cabecera) {
            tag = f[cabecera.indexOf("time_tag")];
            kp = f[cabecera.indexOf("kp")];
            obs = f[cabecera.indexOf("observed")];
        } else if (f && typeof f === "object") {
            const o = f as Record<string, unknown>;
            tag = o.time_tag; kp = o.kp ?? o.kp_index; obs = o.observed;
        }
        const t = typeof tag === "string" ? Date.parse(tag.endsWith("Z") ? tag : `${tag.replace(" ", "T")}Z`) : NaN;
        const v = typeof kp === "number" ? kp : Number(kp);
        if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
        const tipo = obs === "observed" ? "observado" : obs === "estimated" ? "estimado" : "previsto";
        serie.push({ t, kp: v, tipo });
    }
    if (!serie.length) throw new Error("La fuente no devolvió el índice Kp");
    serie.sort((a, b) => a.t - b.t);
    const pasados = serie.filter((p) => p.t <= ahora);
    const futuros = serie.filter((p) => p.t > ahora && p.t <= ahora + 3 * 86_400_000);
    const actual = pasados.length ? pasados[pasados.length - 1] : null;
    const maxPrevisto = futuros.reduce<PuntoKp | null>((m, p) => (!m || p.kp > m.kp ? p : m), null);
    return { actual, maxPrevisto, serie };
}

/** Escala NOAA de tormentas geomagnéticas a partir de Kp. */
export function escalaG(kp: number): { g: number; texto: string } {
    if (kp >= 9) return { g: 5, texto: "tormenta extrema (G5)" };
    if (kp >= 8) return { g: 4, texto: "tormenta severa (G4)" };
    if (kp >= 7) return { g: 3, texto: "tormenta fuerte (G3)" };
    if (kp >= 6) return { g: 2, texto: "tormenta moderada (G2)" };
    if (kp >= 5) return { g: 1, texto: "tormenta menor (G1)" };
    if (kp >= 4) return { g: 0, texto: "campo inquieto" };
    return { g: 0, texto: "campo en calma" };
}

export function useKp(activo: boolean): EstadoCompartido<EstadoKp> {
    return useCompartido<EstadoKp>("kp:noaa", TTL_METEO_MS, async () => analizarKp(await traerJson(URL_KP)), activo);
}
