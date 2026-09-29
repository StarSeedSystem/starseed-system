/**
 * Open-Meteo (sin clave, CORS abierto): pronóstico, horas, días, UV y calidad del aire para la
 * ubicación del usuario. Se pide SIEMPRE en unidades métricas y con marcas Unix; la conversión
 * a °F o mph es cosa de la vista, así la caché sirve para cualquier preferencia.
 *
 * Los analizadores son PUROS y tolerantes: un campo que falta vale `null`, nunca un número
 * plausible inventado.
 */
import { claveCoordenadas, crearFuente, pedirJson } from "./cache-compartida";

// ── Modelo ────────────────────────────────────────────────────────────

export interface ActualClima {
    t: number;
    temp: number | null;
    sensacion: number | null;
    humedad: number | null;
    rocio: number | null;
    esDia: boolean;
    lluvia: number | null;
    codigo: number | null;
    nubes: number | null;
    presion: number | null;
    viento: number | null;
    dirViento: number | null;
    rachas: number | null;
    uv: number | null;
    visibilidad: number | null;
}

export interface HoraClima {
    t: number;
    temp: number | null;
    sensacion: number | null;
    humedad: number | null;
    rocio: number | null;
    probLluvia: number | null;
    lluvia: number | null;
    codigo: number | null;
    nubes: number | null;
    visibilidad: number | null;
    viento: number | null;
    dirViento: number | null;
    rachas: number | null;
    uv: number | null;
    esDia: boolean;
    presion: number | null;
}

export interface DiaClima {
    /** Medianoche local del día (ms). */
    t: number;
    codigo: number | null;
    max: number | null;
    min: number | null;
    orto: number | null;
    ocaso: number | null;
    luzSeg: number | null;
    uvMax: number | null;
    lluviaMm: number | null;
    probLluvia: number | null;
    vientoMax: number | null;
    rachasMax: number | null;
    dirDominante: number | null;
}

export interface ClimaReal {
    lat: number;
    lon: number;
    /** Huso horario IANA de la ubicación (para pintar horas locales del sitio). */
    zona: string;
    elevacion: number | null;
    actual: ActualClima;
    /** 24 h pasadas + 48 h por venir, en orden. */
    horas: HoraClima[];
    dias: DiaClima[];
}

export interface AireReal {
    t: number;
    europeo: number | null;
    eeuu: number | null;
    pm25: number | null;
    pm10: number | null;
    no2: number | null;
    o3: number | null;
    so2: number | null;
    co: number | null;
    polvo: number | null;
    /** Pólenes (granos/m³); solo Europa, `null` fuera. */
    polen: { nombre: string; valor: number }[];
    horas: { t: number; europeo: number | null; eeuu: number | null; pm25: number | null }[];
}

// ── Utilidades ────────────────────────────────────────────────────────

export function num(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function serie(obj: Record<string, unknown> | undefined, campo: string): unknown[] {
    const v = obj?.[campo];
    return Array.isArray(v) ? v : [];
}

const ms = (v: unknown) => {
    const n = num(v);
    return n === null ? null : n * 1000;
};

// ── URLs ──────────────────────────────────────────────────────────────

const ACTUAL = "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility,dew_point_2m";
const HORAS = "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day,pressure_msl";
const DIAS = "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant";

export function urlPronostico(lat: number, lon: number): string {
    const [la, lo] = claveCoordenadas(lat, lon).split(",");
    return `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}`
        + `&current=${ACTUAL}&hourly=${HORAS}&daily=${DIAS}`
        + `&timezone=auto&timeformat=unixtime&past_hours=24&forecast_hours=48&forecast_days=7`;
}

const POLENES: [string, string][] = [
    ["alder_pollen", "Aliso"], ["birch_pollen", "Abedul"], ["grass_pollen", "Gramíneas"],
    ["olive_pollen", "Olivo"], ["ragweed_pollen", "Ambrosía"], ["mugwort_pollen", "Artemisa"],
];

export function urlAire(lat: number, lon: number): string {
    const [la, lo] = claveCoordenadas(lat, lon).split(",");
    return `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${la}&longitude=${lo}`
        + `&current=european_aqi,us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide,dust,${POLENES.map((p) => p[0]).join(",")}`
        + `&hourly=european_aqi,us_aqi,pm2_5&timezone=auto&timeformat=unixtime&forecast_hours=24`;
}

// ── Analizadores ──────────────────────────────────────────────────────

export function analizarPronostico(j: unknown, lat: number, lon: number): ClimaReal {
    const r = (j ?? {}) as Record<string, unknown>;
    const c = (r.current ?? null) as Record<string, unknown> | null;
    if (!c || num(c.time) === null) throw new Error("Open-Meteo no trajo el tiempo actual");
    const zona = typeof r.timezone === "string" && r.timezone ? r.timezone : "UTC";
    const actual: ActualClima = {
        t: (num(c.time) as number) * 1000,
        temp: num(c.temperature_2m),
        sensacion: num(c.apparent_temperature),
        humedad: num(c.relative_humidity_2m),
        rocio: num(c.dew_point_2m),
        esDia: c.is_day !== 0,
        lluvia: num(c.precipitation),
        codigo: num(c.weather_code),
        nubes: num(c.cloud_cover),
        presion: num(c.pressure_msl),
        viento: num(c.wind_speed_10m),
        dirViento: num(c.wind_direction_10m),
        rachas: num(c.wind_gusts_10m),
        uv: num(c.uv_index),
        visibilidad: num(c.visibility),
    };
    const h = (r.hourly ?? {}) as Record<string, unknown>;
    const ht = serie(h, "time");
    const col = (campo: string) => serie(h, campo);
    const [tp, sn, hu, ro, pp, pr, co, nu, vi, ve, dv, ra, uv, di, pm] = [
        "temperature_2m", "apparent_temperature", "relative_humidity_2m", "dew_point_2m", "precipitation_probability",
        "precipitation", "weather_code", "cloud_cover", "visibility", "wind_speed_10m", "wind_direction_10m",
        "wind_gusts_10m", "uv_index", "is_day", "pressure_msl",
    ].map(col);
    const horas: HoraClima[] = [];
    ht.forEach((t, i) => {
        const tms = ms(t);
        if (tms === null) return;
        horas.push({
            t: tms, temp: num(tp[i]), sensacion: num(sn[i]), humedad: num(hu[i]), rocio: num(ro[i]),
            probLluvia: num(pp[i]), lluvia: num(pr[i]), codigo: num(co[i]), nubes: num(nu[i]), visibilidad: num(vi[i]),
            viento: num(ve[i]), dirViento: num(dv[i]), rachas: num(ra[i]), uv: num(uv[i]), esDia: di[i] !== 0, presion: num(pm[i]),
        });
    });
    const d = (r.daily ?? {}) as Record<string, unknown>;
    const dcol = (campo: string) => serie(d, campo);
    const [dc, dmx, dmn, dor, doc, dlu, duv, dll, dpp, dvm, drm, ddd] = [
        "weather_code", "temperature_2m_max", "temperature_2m_min", "sunrise", "sunset", "daylight_duration",
        "uv_index_max", "precipitation_sum", "precipitation_probability_max", "wind_speed_10m_max",
        "wind_gusts_10m_max", "wind_direction_10m_dominant",
    ].map(dcol);
    const dias: DiaClima[] = [];
    dcol("time").forEach((t, i) => {
        const tms = ms(t);
        if (tms === null) return;
        dias.push({
            t: tms, codigo: num(dc[i]), max: num(dmx[i]), min: num(dmn[i]), orto: ms(dor[i]), ocaso: ms(doc[i]),
            luzSeg: num(dlu[i]), uvMax: num(duv[i]), lluviaMm: num(dll[i]), probLluvia: num(dpp[i]),
            vientoMax: num(dvm[i]), rachasMax: num(drm[i]), dirDominante: num(ddd[i]),
        });
    });
    return { lat, lon, zona, elevacion: num(r.elevation), actual, horas, dias };
}

export function analizarAire(j: unknown): AireReal {
    const r = (j ?? {}) as Record<string, unknown>;
    const c = (r.current ?? null) as Record<string, unknown> | null;
    if (!c || num(c.time) === null) throw new Error("Open-Meteo no trajo la calidad del aire");
    const h = (r.hourly ?? {}) as Record<string, unknown>;
    const eu = serie(h, "european_aqi"), us = serie(h, "us_aqi"), p25 = serie(h, "pm2_5");
    const horas = serie(h, "time")
        .map((t, i) => ({ t: ms(t), europeo: num(eu[i]), eeuu: num(us[i]), pm25: num(p25[i]) }))
        .filter((x): x is { t: number; europeo: number | null; eeuu: number | null; pm25: number | null } => x.t !== null);
    const polen = POLENES
        .map(([campo, nombre]) => ({ nombre, valor: num(c[campo]) }))
        .filter((p): p is { nombre: string; valor: number } => p.valor !== null);
    return {
        t: (num(c.time) as number) * 1000,
        europeo: num(c.european_aqi), eeuu: num(c.us_aqi), pm25: num(c.pm2_5), pm10: num(c.pm10),
        no2: num(c.nitrogen_dioxide), o3: num(c.ozone), so2: num(c.sulphur_dioxide), co: num(c.carbon_monoxide),
        polvo: num(c.dust), polen, horas,
    };
}

// ── Consultas sobre el modelo ─────────────────────────────────────────

/** Índice de la hora en curso (la última que ya empezó). */
export function indiceAhora(horas: HoraClima[], ahora = Date.now()): number {
    let i = -1;
    for (let k = 0; k < horas.length; k++) if (horas[k].t <= ahora) i = k;
    return Math.max(0, i);
}

/** Las próximas `n` horas empezando por la actual. */
export function proximasHoras(horas: HoraClima[], n: number, ahora = Date.now()): HoraClima[] {
    const i = indiceAhora(horas, ahora);
    return horas.slice(i, i + n);
}

/** La misma hora de ayer (para «2° más que ayer»), si la hay. */
export function horaDeAyer(horas: HoraClima[], ahora = Date.now()): HoraClima | null {
    const objetivo = ahora - 86_400_000;
    let mejor: HoraClima | null = null;
    for (const h of horas) if (h.t <= objetivo && (!mejor || h.t > mejor.t)) mejor = h;
    return mejor && objetivo - mejor.t < 3_600_000 ? mejor : null;
}

/** El día de hoy en la zona del sitio (el primero cuyo intervalo contiene `ahora`). */
export function diaDeHoy(dias: DiaClima[], ahora = Date.now()): DiaClima | null {
    for (let k = dias.length - 1; k >= 0; k--) if (dias[k].t <= ahora) return dias[k];
    return dias[0] ?? null;
}

// ── Fuentes compartidas ───────────────────────────────────────────────

export interface Coordenadas { lat: number; lon: number }

export const fuentePronostico = crearFuente<Coordenadas, ClimaReal>({
    nombre: "pronostico",
    ttlMs: 20 * 60_000,
    clave: ({ lat, lon }) => claveCoordenadas(lat, lon),
    cargar: async ({ lat, lon }, senal) => analizarPronostico(await pedirJson(urlPronostico(lat, lon), senal), lat, lon),
});

export const fuenteAire = crearFuente<Coordenadas, AireReal>({
    nombre: "aire",
    ttlMs: 45 * 60_000,
    clave: ({ lat, lon }) => claveCoordenadas(lat, lon),
    cargar: async ({ lat, lon }, senal) => analizarAire(await pedirJson(urlAire(lat, lon), senal)),
});
