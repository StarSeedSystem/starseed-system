export const MOCK_WEATHER_DATA = {
    // Top-level equivalents for widgets that don't expect 'terrestrial' wrapper
    current: {
        temperature_2m: 22,
        wind_speed_10m: 12.5,
        relative_humidity_2m: 45,
        cloud_cover: 20,
        weather_code: 0,
        precipitation: 0.0,
        uv_index: 6.5,
        is_day: 1
    },
    air_quality: {
        us_aqi: 32,
        pm10: 15.5,
        pm2_5: 8.2
    },

    // Proper nested wrapper expected by most refined widgets
    terrestrial: {
        current: {
            temperature_2m: 22,
            wind_speed_10m: 12.5,
            relative_humidity_2m: 45,
            cloud_cover: 20,
            weather_code: 0,
            precipitation: 0.0,
            visibility: 10000.0,
            surface_pressure: 1012.5,
            uv_index: 6.5,
            is_day: 1
        },
        daily: {
            temperature_2m_max: [25, 26, 24, 23, 27],
            temperature_2m_min: [14, 15, 13, 12, 16],
            uv_index_max: [7, 8, 6, 5, 8],
            precipitation_probability_max: [10, 20, 5, 0, 15],
            sunrise: ["2024-05-20T06:30", "2024-05-21T06:29", "2024-05-22T06:28", "2024-05-23T06:28", "2024-05-24T06:28"],
            sunset: ["2024-05-20T20:15", "2024-05-21T20:16", "2024-05-22T20:17", "2024-05-23T20:17", "2024-05-24T20:17"],
            time: ["2024-05-20", "2024-05-21", "2024-05-22", "2024-05-23", "2024-05-24"]
        },
        hourly: {
            temperature_2m: [20, 21, 22, 23, 24, 25, 24, 22, 20, 18, 16, 15],
            precipitation_probability: [0, 5, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            relative_humidity_2m: [45, 42, 38, 35, 30, 28, 30, 35, 40, 45, 50, 55],
            wind_speed_10m: [12, 14, 15, 18, 20, 22, 25, 20, 18, 15, 12, 10],
            wind_direction_10m: [45, 45, 50, 60, 90, 120, 135, 135, 90, 60, 45, 45], // Degrees
            us_aqi: [32, 35, 40, 45, 55, 60, 50, 45, 40, 35, 30, 28],
            visibility: [10000, 10000, 9500, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000],
            time: ["00:00", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"]
        },
        air_quality: {
            current: {
                us_aqi: 32,
                pm10: 15.5,
                pm2_5: 8.2,
                carbon_monoxide: 210,
                nitrogen_dioxide: 18.5,
                ozone: 45
            }
        },
        astronomical: {
            moon_phase: 0.65,
            sunrise: "06:12",
            sunset: "19:42",
            zenith: 42.1,
            azimuth: 284
        }
    },
    energetic: {
        kp: 3.5,
        solar_wind: { Bt: "6.2", speed: "450" },
        solar_activity: {
            flare_class: "M2.4",
            cme_active: false,
            cme_speed_kms: 350,
            sunspot_regions: 4
        },
        schumann: {
            current: {
                base_frequency: 7.83,
                fluctuation: 0.12,
                status: "elevated",
                amplitude: 24.5
            },
            history: [
                { time: "2024-05-20T00:00", freq: 7.85, amplitude: 22 },
                { time: "2024-05-20T01:00", freq: 7.83, amplitude: 18 },
                { time: "2024-05-20T02:00", freq: 7.91, amplitude: 35 },
                { time: "2024-05-20T03:00", freq: 7.88, amplitude: 28 },
                { time: "2024-05-20T04:00", freq: 7.84, amplitude: 20 },
                { time: "2024-05-20T05:00", freq: 7.95, amplitude: 45 },
            ],
            source: "mock_spectrogram_data"
        }
    },
    // New Comprehensive Solar Data (La Fuente)
    solar: {
        sunspot_number: 115, // Número de Manchas Solares (SSN)
        solar_flux_index: 155.2, // Índice de Flujo Solar (SFI / F10.7)
        x_ray_flux: {
            current_class: "M1.2", // Flujo de Rayos X
            value: 1.2e-5, // W/m^2
            history: [
                { time: "00:00", value: 1.0e-5, classLabel: "M1.0" },
                { time: "03:00", value: 2.5e-6, classLabel: "C2.5" },
                { time: "06:00", value: 8.0e-6, classLabel: "C8.0" },
                { time: "09:00", value: 3.1e-5, classLabel: "M3.1" },
                { time: "12:00", value: 1.2e-5, classLabel: "M1.2" }
            ]
        },
        coronal_imagery: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg" // Imágenes de la Corona
    },
    // Medio Interplanetario
    interplanetary: {
        solar_wind_speed: 450.5, // Velocidad del Viento Solar (Vsw) en km/s
        proton_density: 5.2, // Densidad de Protones (p/cm^3)
        plasma_temperature: 120000, // Temperatura del Plasma (K)
        imf: {
            total: 8.5, // Campo Magnético Interplanetario
            bz: -2.3, // Componente Bz (Sur/Norte)
            history: [
                { time: "00:00", bz: 1.2 },
                { time: "03:00", bz: -0.5 },
                { time: "06:00", bz: -3.1 },
                { time: "09:00", bz: -4.5 },
                { time: "12:00", bz: -2.3 }
            ]
        }
    },
    // Entorno Terrestre (Clima Espacial)
    space_weather: {
        kp_index: {
            current: 3, // Índice Kp
            history: [2, 3, 4, 3, 2, 3, 4, 3]
        },
        dst_index: -25, // Índice Dst (nT)
        tec: 45.2, // Contenido Electrónico Total (TEC)
        energetic_protons: 1.5, // Flujo de Protones Energéticos (pfu)
        gic: 12.3, // Corrientes Inducidas Geomagnéticamente (A)
        noaa_scales: {
            g_scale: { level: 1, description: "Menor" }, // Geométrica (G1-G5)
            s_scale: { level: 0, description: "Ninguna" }, // Radiación (S1-S5)
            r_scale: { level: 1, description: "Menor" }  // Radio (R1-R5)
        }
    }
};

// ── Utilidades de datos reales ──────────────────────────────────────────────
function clone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }

async function jget(url: string, ms = 7000): Promise<any | null> {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ms);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

/** Fase lunar 0..1 (0 y 1 = luna nueva, 0.5 = llena) calculada desde una luna
 * nueva de referencia conocida (2000-01-06 18:14 UTC) y el ciclo sinódico. */
function moonPhaseFraction(date = new Date()): number {
    const SYNODIC = 29.53058867;
    const ref = Date.UTC(2000, 0, 6, 18, 14, 0) / 86400000; // días
    const now = date.getTime() / 86400000;
    let age = ((now - ref) % SYNODIC) / SYNODIC;
    if (age < 0) age += 1;
    return age;
}

function hhmmFromISO(iso?: string): string {
    if (!iso) return "—";
    const m = /T(\d{2}:\d{2})/.exec(iso);
    return m ? m[1] : iso;
}

/**
 * Datos meteorológicos REALES desde proveedores gratuitos sin API key:
 *  - Open-Meteo (clima terrestre + UV + astronomía): api.open-meteo.com
 *  - Open-Meteo Air Quality (calidad del aire): air-quality-api.open-meteo.com
 *  - NOAA SWPC (clima espacial: Kp, viento solar, rayos X): services.swpc.noaa.gov
 * Todo se fusiona SOBRE una copia del mock, así que si algún proveedor falla,
 * el widget sigue mostrando una estructura completa (degradación elegante).
 * Mantiene además el backend local opcional como primera opción si está activo.
 */
export async function fetchWeatherData(lat: number, lon: number): Promise<any> {
    // 1) Backend local opcional (si el usuario lo tiene corriendo).
    try {
        const res = await fetch(`http://127.0.0.1:5001/api/starseed/weather-all?lat=${lat}&lon=${lon}`, {
            signal: AbortSignal.timeout ? AbortSignal.timeout(1200) : undefined,
        } as any);
        if (res.ok) {
            const j = await res.json();
            if (j && (j.terrestrial || j.current)) return j;
        }
    } catch { /* sin backend local → seguimos con proveedores públicos */ }

    const data: any = clone(MOCK_WEATHER_DATA);
    data._sources = [];
    data._fetchedAt = new Date().toISOString();

    // 2) Open-Meteo: clima terrestre + UV + astronomía.
    const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,uv_index`
        + `&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,visibility,uv_index`
        + `&daily=temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max,sunrise,sunset`
        + `&timezone=auto&forecast_days=5`;
    // 3) Open-Meteo Air Quality.
    const aUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}`
        + `&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone&hourly=us_aqi&timezone=auto`;

    const [fc, aq, kp, mag, plasma, xray] = await Promise.all([
        jget(fUrl),
        jget(aUrl),
        jget("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"),
        jget("https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json"),
        jget("https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json"),
        jget("https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json"),
    ]);

    // ── Mapear Open-Meteo terrestre ──
    if (fc?.current) {
        const c = fc.current;
        const cur = {
            temperature_2m: c.temperature_2m,
            apparent_temperature: c.apparent_temperature,
            wind_speed_10m: c.wind_speed_10m,
            wind_direction_10m: c.wind_direction_10m,
            relative_humidity_2m: c.relative_humidity_2m,
            cloud_cover: c.cloud_cover,
            weather_code: c.weather_code,
            precipitation: c.precipitation,
            surface_pressure: c.surface_pressure,
            uv_index: c.uv_index,
            is_day: c.is_day,
            visibility: 10000,
        };
        data.current = { ...data.current, ...cur };
        data.terrestrial.current = { ...data.terrestrial.current, ...cur };

        if (fc.daily) {
            data.terrestrial.daily = {
                temperature_2m_max: fc.daily.temperature_2m_max,
                temperature_2m_min: fc.daily.temperature_2m_min,
                uv_index_max: fc.daily.uv_index_max,
                precipitation_probability_max: fc.daily.precipitation_probability_max,
                sunrise: fc.daily.sunrise,
                sunset: fc.daily.sunset,
                time: fc.daily.time,
            };
        }
        if (fc.hourly?.time) {
            // 12 horas a partir de la hora actual.
            const times: string[] = fc.hourly.time;
            const nowH = new Date();
            let start = times.findIndex(t => new Date(t).getTime() >= nowH.getTime() - 3600000);
            if (start < 0) start = 0;
            const end = Math.min(start + 12, times.length);
            const sl = (arr?: any[]) => (arr ? arr.slice(start, end) : undefined);
            data.terrestrial.hourly = {
                temperature_2m: sl(fc.hourly.temperature_2m),
                relative_humidity_2m: sl(fc.hourly.relative_humidity_2m),
                precipitation_probability: sl(fc.hourly.precipitation_probability),
                wind_speed_10m: sl(fc.hourly.wind_speed_10m),
                wind_direction_10m: sl(fc.hourly.wind_direction_10m),
                visibility: sl(fc.hourly.visibility),
                us_aqi: aq?.hourly?.us_aqi ? aq.hourly.us_aqi.slice(0, end - start) : data.terrestrial.hourly.us_aqi,
                time: sl(times)?.map((t: string) => hhmmFromISO(t)),
            };
        }
        // Astronomía: amanecer/atardecer del día + fase lunar calculada.
        const phase = moonPhaseFraction();
        data.terrestrial.astronomical = {
            ...data.terrestrial.astronomical,
            moon_phase: Number(phase.toFixed(3)),
            sunrise: hhmmFromISO(fc.daily?.sunrise?.[0]),
            sunset: hhmmFromISO(fc.daily?.sunset?.[0]),
        };
        data._sources.push("open-meteo");
    }

    // ── Calidad del aire ──
    if (aq?.current) {
        const a = {
            us_aqi: aq.current.us_aqi,
            pm10: aq.current.pm10,
            pm2_5: aq.current.pm2_5,
            carbon_monoxide: aq.current.carbon_monoxide,
            nitrogen_dioxide: aq.current.nitrogen_dioxide,
            ozone: aq.current.ozone,
        };
        data.air_quality = { us_aqi: a.us_aqi, pm10: a.pm10, pm2_5: a.pm2_5 };
        data.terrestrial.air_quality = { current: a };
        data._sources.push("open-meteo-aq");
    }

    // ── NOAA: índice Kp planetario (clima espacial real) ──
    try {
        if (Array.isArray(kp) && kp.length > 1) {
            const rows = kp.slice(1); // primera fila = encabezados
            const vals = rows.map((r: any[]) => parseFloat(r[1])).filter((n: number) => !isNaN(n));
            const last = vals[vals.length - 1];
            if (last != null) {
                data.energetic.kp = last;
                data.space_weather.kp_index = {
                    current: Math.round(last),
                    history: vals.slice(-8).map((v: number) => Math.round(v)),
                };
                data._sources.push("noaa-kp");
            }
        }
    } catch { /* noop */ }

    // ── NOAA: viento solar (mag + plasma) ──
    try {
        if (Array.isArray(mag) && mag.length > 1) {
            const r = mag[mag.length - 1]; // [time_tag, bx, by, bz, lon, lat, bt]
            const bt = parseFloat(r[6]); const bz = parseFloat(r[3]);
            if (!isNaN(bt)) {
                data.energetic.solar_wind = { ...data.energetic.solar_wind, Bt: bt.toFixed(1) };
                data.interplanetary.imf = { ...data.interplanetary.imf, total: bt, bz: isNaN(bz) ? data.interplanetary.imf.bz : bz };
            }
        }
        if (Array.isArray(plasma) && plasma.length > 1) {
            const r = plasma[plasma.length - 1]; // [time_tag, density, speed, temperature]
            const density = parseFloat(r[1]); const speed = parseFloat(r[2]); const temp = parseFloat(r[3]);
            if (!isNaN(speed)) {
                data.energetic.solar_wind = { ...data.energetic.solar_wind, speed: Math.round(speed).toString() };
                data.interplanetary.solar_wind_speed = Math.round(speed);
            }
            if (!isNaN(density)) data.interplanetary.proton_density = Number(density.toFixed(1));
            if (!isNaN(temp)) data.interplanetary.plasma_temperature = Math.round(temp);
            data._sources.push("noaa-solarwind");
        }
    } catch { /* noop */ }

    // ── NOAA: flujo de rayos X (clase de fulguración real) ──
    try {
        if (Array.isArray(xray) && xray.length) {
            const long = xray.filter((d: any) => d.energy === "0.1-0.8nm");
            const last = (long.length ? long : xray)[(long.length ? long : xray).length - 1];
            const flux = parseFloat(last?.flux);
            if (!isNaN(flux)) {
                const cls = flux >= 1e-4 ? `X${(flux / 1e-4).toFixed(1)}`
                    : flux >= 1e-5 ? `M${(flux / 1e-5).toFixed(1)}`
                    : flux >= 1e-6 ? `C${(flux / 1e-6).toFixed(1)}`
                    : flux >= 1e-7 ? `B${(flux / 1e-7).toFixed(1)}` : `A${(flux / 1e-8).toFixed(1)}`;
                data.solar.x_ray_flux = { ...data.solar.x_ray_flux, current_class: cls, value: flux };
                data.energetic.solar_activity = { ...data.energetic.solar_activity, flare_class: cls };
                data._sources.push("noaa-xray");
            }
        }
    } catch { /* noop */ }

    return data;
}
