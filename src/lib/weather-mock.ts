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

export async function fetchWeatherData(lat: number, lon: number): Promise<any> {
    try {
        const res = await fetch(`http://127.0.0.1:5001/api/starseed/weather-all?lat=${lat}&lon=${lon}`);
        if (!res.ok) {
            console.warn(`Weather API returned ${res.status}. Using mock data.`);
            return MOCK_WEATHER_DATA;
        }
        return await res.json();
    } catch (error) {
        // Suppress the unhandled rejection overlay in dev by catching and warning instead of erroring
        console.warn("Weather backend is unreachable. Using resilient mock data.", error);
        return MOCK_WEATHER_DATA;
    }
}
