import { z } from "zod";

// --- NOAA & Base Telemetry Modules ---

export const SolarWindSchema = z.object({
    speed: z.number().nullable(),          // km/s
    density: z.number().nullable(),        // p/cm^3
    temperature: z.number().nullable(),    // K
    bt: z.number().nullable(),             // Total Interplanetary Magnetic Field (nT)
    bz: z.number().nullable(),             // Z-component of IMF (nT)
    timestamp: z.string(),
});

export const KpIndexSchema = z.object({
    value: z.number(),                     // 0 to 9 scale
    timestamp: z.string(),
    isEstimated: z.boolean().default(true),
    source: z.string(),                    // 'NOAA' or 'GFZ'
});

export const XRayFluxSchema = z.object({
    flux: z.number(),                      // W/m^2
    classLabel: z.string(),                // A, B, C, M, X
    timestamp: z.string(),
});

// --- Local Geo-Data (INTERMAGNET) ---

export const MagnetometerSchema = z.object({
    stationCode: z.string(),               // e.g., 'TEO' for Teoloyucan
    latitude: z.number(),
    longitude: z.number(),
    hComponent: z.number().nullable(),     // Horizontal intensity
    xComponent: z.number().nullable(),     // North/South intensity
    yComponent: z.number().nullable(),     // East/West intensity
    zComponent: z.number().nullable(),     // Vertical intensity
    timestamp: z.string(),
});

// --- Derived Alerts & Computed Status ---

export const SpaceWeatherAlertsSchema = z.object({
    geomagneticStorm: z.boolean(),         // Kp >= 5
    magneticDisconnection: z.boolean(),    // Bz is strongly negative (<-5 nT) 
    radioBlackout: z.boolean(),            // X-Ray class corresponds to M or X
    severityLevel: z.enum(["Normal", "Elevated", "Warning", "Extreme"]),
});

// --- Unified Outputs ---

export const UnifiedSpaceWeatherSchema = z.object({
    timestamp: z.string(),
    solarWind: SolarWindSchema,
    kpIndex: z.array(KpIndexSchema),       // Recent history including current
    xRayFlux: z.array(XRayFluxSchema),
    localMagnetometer: MagnetometerSchema.nullable(),
    alerts: SpaceWeatherAlertsSchema,
});

// TypeScript Types derived from Zod Schemas
export type SolarWindData = z.infer<typeof SolarWindSchema>;
export type KpIndexData = z.infer<typeof KpIndexSchema>;
export type XRayFluxData = z.infer<typeof XRayFluxSchema>;
export type MagnetometerData = z.infer<typeof MagnetometerSchema>;
export type SpaceWeatherAlerts = z.infer<typeof SpaceWeatherAlertsSchema>;
export type UnifiedSpaceWeather = z.infer<typeof UnifiedSpaceWeatherSchema>;
