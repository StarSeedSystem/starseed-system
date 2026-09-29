/**
 * Respuestas con la FORMA real de Open-Meteo y NOAA SWPC (capturadas el 2026-09-29) para las
 * pruebas de «Clima y cosmos». Vive fuera de `__tests__` para que vitest no la tome por prueba.
 */

const HORA = 3600;

/** Pronóstico de Open-Meteo (timeformat=unixtime, past_hours=24, forecast_hours=48). */
export function pronosticoJson(ahoraMs = Date.now(), codigo = 2) {
    const ahora = Math.floor(ahoraMs / 1000);
    const h0 = ahora - (ahora % HORA) - 24 * HORA;
    const horas = Array.from({ length: 72 }, (_, i) => h0 + i * HORA);
    const temp = horas.map((_, i) => Math.round((20 + 7 * Math.sin(((i - 9) / 24) * 2 * Math.PI)) * 10) / 10);
    const medianoche = ahora - (ahora % 86400);
    const dias = Array.from({ length: 7 }, (_, i) => medianoche + i * 86400);
    return {
        latitude: 39.5, longitude: -0.375, timezone: "Europe/Madrid", utc_offset_seconds: 7200, elevation: 20,
        current: {
            time: ahora - (ahora % 900), interval: 900, temperature_2m: 22.4, relative_humidity_2m: 56, apparent_temperature: 24.1,
            is_day: 1, precipitation: 0, weather_code: codigo, cloud_cover: 64, pressure_msl: 1017.4, wind_speed_10m: 14.2,
            wind_direction_10m: 133, wind_gusts_10m: 31.5, uv_index: 5.6, visibility: 39460, dew_point_2m: 14.2,
        },
        hourly: {
            time: horas,
            temperature_2m: temp,
            apparent_temperature: temp.map((t) => t + 1.5),
            relative_humidity_2m: horas.map((_, i) => 50 + (i % 12) * 3),
            dew_point_2m: horas.map(() => 14),
            precipitation_probability: horas.map((_, i) => (i % 24 > 16 ? 70 : 5)),
            precipitation: horas.map(() => 0),
            weather_code: horas.map((_, i) => (i % 24 > 16 ? 61 : 2)),
            cloud_cover: horas.map(() => 40),
            visibility: horas.map(() => 24000),
            wind_speed_10m: horas.map((_, i) => 8 + (i % 10)),
            wind_direction_10m: horas.map(() => 130),
            wind_gusts_10m: horas.map((_, i) => 20 + (i % 10)),
            uv_index: horas.map((_, i) => Math.max(0, Math.round(8 * Math.sin((((i % 24) - 7) / 13) * Math.PI) * 10) / 10)),
            is_day: horas.map((_, i) => ((i % 24) > 6 && (i % 24) < 20 ? 1 : 0)),
            pressure_msl: horas.map(() => 1016),
        },
        daily: {
            time: dias,
            weather_code: [2, 3, 95, 61, 0, 1, 2],
            temperature_2m_max: [27.2, 26.1, 23.4, 21.9, 24.8, 25.5, 26],
            temperature_2m_min: [16.1, 15.4, 14.9, 13.2, 12.8, 14.1, 15],
            sunrise: dias.map((d) => d + 5 * HORA + 55 * 60),
            sunset: dias.map((d) => d + 17 * HORA + 45 * 60),
            daylight_duration: dias.map(() => 42600),
            uv_index_max: [6.1, 5.8, 3.2, 4, 6.4, 6.2, 6],
            precipitation_sum: [0, 0, 12.4, 3.1, 0, 0, 0],
            precipitation_probability_max: [5, 10, 90, 60, 0, 5, 10],
            wind_speed_10m_max: [18, 22, 35, 28, 15, 14, 16],
            wind_gusts_10m_max: [35, 40, 72, 50, 30, 28, 30],
            wind_direction_10m_dominant: [130, 120, 250, 270, 90, 100, 110],
        },
    };
}

export function aireJson(ahoraMs = Date.now()) {
    const ahora = Math.floor(ahoraMs / 1000);
    const h0 = ahora - (ahora % HORA);
    const horas = Array.from({ length: 24 }, (_, i) => h0 + i * HORA);
    return {
        timezone: "Europe/Madrid",
        current: {
            time: h0, interval: 3600, european_aqi: 34, us_aqi: 48, pm10: 18.2, pm2_5: 9.4, nitrogen_dioxide: 21.3,
            ozone: 82, sulphur_dioxide: 3.1, carbon_monoxide: 180, dust: 4, grass_pollen: 3.2, olive_pollen: 0.4, birch_pollen: null,
        },
        hourly: {
            time: horas,
            european_aqi: horas.map((_, i) => 30 + (i % 8) * 4),
            us_aqi: horas.map((_, i) => 40 + (i % 8) * 5),
            pm2_5: horas.map(() => 9),
        },
    };
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);

export function kpPrevisionJson(ahoraMs = Date.now()) {
    const b0 = Math.floor(ahoraMs / 10_800_000) * 10_800_000 - 8 * 10_800_000;
    return Array.from({ length: 20 }, (_, i) => {
        const t = b0 + i * 10_800_000;
        return { time_tag: iso(t), kp: i === 6 ? 5.33 : 2 + (i % 3) * 0.67, observed: t <= ahoraMs - 10_800_000 ? "observed" : t <= ahoraMs ? "estimated" : "predicted", noaa_scale: i === 6 ? "G1" : null };
    });
}

export function kpMinutoJson(ahoraMs = Date.now()) {
    return [{ time_tag: iso(ahoraMs - 120_000), kp_index: 3, estimated_kp: 3.33, kp: "3P" }];
}

export function escalasJson() {
    const b = (g: string) => ({ DateStamp: "2026-09-29", TimeStamp: "12:35:00", R: { Scale: "0", Text: "none", MinorProb: "10", MajorProb: "1" }, S: { Scale: "0", Text: "none", Prob: "1" }, G: { Scale: g, Text: "none" } });
    return { "-1": b("1"), "0": b("0"), "1": b("0"), "2": b("1"), "3": b("0") };
}

export function vientoVelocidadJson(ahoraMs = Date.now()) {
    return [{ proton_speed: 512, time_tag: `${iso(ahoraMs - 180_000)}Z` }];
}
export function vientoCampoJson(ahoraMs = Date.now()) {
    return [{ bt: 7, bz_gsm: -6, time_tag: `${iso(ahoraMs - 240_000)}Z` }];
}

export function plasmaJson(ahoraMs = Date.now()) {
    const filas: Record<string, unknown>[] = [];
    for (let m = 0; m < 24 * 60; m += 10) {
        const t = ahoraMs - m * 60_000;
        filas.push({ time_tag: iso(t), active: true, source: "SOLAR1", proton_speed: 480 + (m % 90), proton_density: 4 + (m % 7) / 2, proton_temperature: 90000 });
        filas.push({ time_tag: iso(t), active: false, source: "ACE", proton_speed: 999, proton_density: 99, proton_temperature: 1 });
    }
    return filas;
}

export function rayosJson(ahoraMs = Date.now()) {
    return Array.from({ length: 72 }, (_, i) => {
        const t = ahoraMs - (72 - i) * 300_000;
        return [
            { time_tag: `${iso(t)}Z`, satellite: 18, flux: i === 60 ? 2.4e-5 : 3.2e-7, energy: "0.1-0.8nm" },
            { time_tag: `${iso(t)}Z`, satellite: 18, flux: 1e-9, energy: "0.05-0.4nm" },
        ];
    }).flat();
}

export function llamaradasJson(ahoraMs = Date.now()) {
    return [
        { begin_time: `${iso(ahoraMs - 3 * 86_400_000)}Z`, max_time: `${iso(ahoraMs - 3 * 86_400_000 + 600_000)}Z`, end_time: `${iso(ahoraMs - 3 * 86_400_000 + 1_200_000)}Z`, max_class: "C4.1", begin_class: "B8.0", max_xrlong: 4.1e-6 },
        { begin_time: `${iso(ahoraMs - 5 * 3_600_000)}Z`, max_time: `${iso(ahoraMs - 5 * 3_600_000 + 480_000)}Z`, end_time: "Unk", max_class: "M2.4", begin_class: "C3.0", max_xrlong: 2.4e-5 },
    ];
}

export function regionesJson() {
    return [
        { observed_date: "2026-09-28", region: 4520, location: "N10E20", area: 90, number_spots: 5, mag_class: "B", c_flare_probability: 20, m_flare_probability: 5, x_flare_probability: 1 },
        { observed_date: "2026-09-29", region: 4521, location: "S07W56", area: 240, number_spots: 12, mag_class: "BG", c_flare_probability: 45, m_flare_probability: 15, x_flare_probability: 2 },
        { observed_date: "2026-09-29", region: 4522, location: "N12E40", area: 60, number_spots: 3, mag_class: "B", c_flare_probability: 10, m_flare_probability: 1, x_flare_probability: 1 },
    ];
}

export function magnetometroJson(ahoraMs = Date.now()) {
    return Array.from({ length: 72 }, (_, i) => ({
        time_tag: `${iso(ahoraMs - (72 - i) * 300_000)}Z`, satellite: 19, He: 34 + i * 0.1, Hp: 90 + 12 * Math.sin(i / 8), Hn: 2, total: 100, arcjet_flag: false,
    }));
}

export function ovationJson() {
    const coords: number[][] = [];
    for (let lon = 0; lon < 360; lon++) {
        for (let lat = -90; lat <= 90; lat++) {
            const v = Math.abs(lat) >= 62 && Math.abs(lat) <= 72 ? 40 : Math.abs(lat) >= 55 && Math.abs(lat) < 62 ? 8 : 0;
            coords.push([lon, lat, v]);
        }
    }
    return { "Observation Time": "2026-09-29T12:19:00Z", "Forecast Time": "2026-09-29T13:48:00Z", coordinates: coords };
}

/** Respuesta falsa de `fetch` según la URL: todas las fuentes de clima y cosmos. */
export function respuestaPara(url: string, ahoraMs = Date.now()): unknown {
    if (url.includes("air-quality-api")) return aireJson(ahoraMs);
    if (url.includes("api.open-meteo.com")) return pronosticoJson(ahoraMs);
    if (url.includes("noaa-planetary-k-index-forecast")) return kpPrevisionJson(ahoraMs);
    if (url.includes("planetary_k_index_1m")) return kpMinutoJson(ahoraMs);
    if (url.includes("noaa-scales")) return escalasJson();
    if (url.includes("solar-wind-speed")) return vientoVelocidadJson(ahoraMs);
    if (url.includes("solar-wind-mag-field")) return vientoCampoJson(ahoraMs);
    if (url.includes("rtsw_wind_1m")) return plasmaJson(ahoraMs);
    if (url.includes("xrays-6-hour")) return rayosJson(ahoraMs);
    if (url.includes("xray-flares-7-day")) return llamaradasJson(ahoraMs);
    if (url.includes("solar_regions")) return regionesJson();
    if (url.includes("10cm-flux")) return [{ flux: 142, time_tag: "2026-09-28T20:00:00" }];
    if (url.includes("magnetometers-6-hour")) return magnetometroJson(ahoraMs);
    if (url.includes("ovation_aurora_latest")) return ovationJson();
    if (url.includes("earthquake.usgs.gov")) return { features: [
        { id: "a1", properties: { mag: 5.8, place: "120 km al SO de Tonga", time: ahoraMs - 3_600_000, url: "https://earthquake.usgs.gov/earthquakes/eventpage/a1", tsunami: 0, alert: "green" }, geometry: { coordinates: [-175, -21, 10] } },
        { id: "a2", properties: { mag: 4.6, place: "Golfo de Cádiz", time: ahoraMs - 7_200_000, url: "https://earthquake.usgs.gov/earthquakes/eventpage/a2", tsunami: 0, alert: null }, geometry: { coordinates: [-8, 36, 12] } },
    ] };
    if (url.includes("spaceflightnewsapi")) return { results: [
        { id: 1, title: "Lanzamiento de una sonda solar", url: "https://example.org/sonda", news_site: "SpaceNews", published_at: new Date(ahoraMs - 3_600_000).toISOString(), summary: "Resumen." },
    ] };
    return null;
}
