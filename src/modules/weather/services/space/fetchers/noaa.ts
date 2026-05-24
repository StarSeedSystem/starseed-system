import { SolarWindData, KpIndexData, XRayFluxData } from "../schema";

const NOAA_SWPC_BASE_URL = "https://services.swpc.noaa.gov/json";

/**
 * Fetches the latest Solar Wind Plasma & Magnetic Field data from NOAA SWPC
 */
export async function fetchNoaaSolarWind(): Promise<SolarWindData> {
    try {
        // We fetch plasma and mag data concurrently
        const [plasmaRes, magRes] = await Promise.all([
            fetch(`${NOAA_SWPC_BASE_URL}/dscovr/dscovr_plasma_1m.json`),
            fetch(`${NOAA_SWPC_BASE_URL}/dscovr/dscovr_mag_1m.json`)
        ]);

        if (!plasmaRes.ok || !magRes.ok) throw new Error("NOAA SWPC API error for Solar Wind");

        const plasmaData = await plasmaRes.json();
        const magData = await magRes.json();

        // Get the most recent valid points (arrays are chronologically ordered usually, last is newest)
        const latestPlasma = plasmaData[plasmaData.length - 1];
        const latestMag = magData[magData.length - 1];

        return {
            speed: latestPlasma?.speed || null,
            density: latestPlasma?.density || null,
            temperature: latestPlasma?.temperature || null,
            bt: latestMag?.bt || null,
            bz: latestMag?.bz_gsm || null,
            timestamp: latestPlasma?.time_tag || new Date().toISOString()
        };
    } catch (error) {
        console.warn("Falling back to simulated solar wind due to error:", error);
        return {
            speed: 450.5, density: 5.2, temperature: 120000,
            bt: 8.5, bz: -2.3, timestamp: new Date().toISOString()
        };
    }
}

/**
 * Fetches the latest 1-minute averaged Planetary K-index from NOAA.
 */
export async function fetchNoaaKpIndex(): Promise<KpIndexData[]> {
    try {
        const res = await fetch(`${NOAA_SWPC_BASE_URL}/planetary_k_index_1m.json`);
        if (!res.ok) throw new Error("NOAA SWPC API error for Kp Index");

        const data = await res.json();
        // Return last 8 records (representing latest hours)
        const recent = data.slice(-8);

        return recent.map((item: any) => ({
            value: item.kp_index,
            timestamp: item.time_tag,
            isEstimated: true,
            source: "NOAA"
        }));
    } catch (error) {
        console.warn("Falling back to simulated Kp due to error");
        return [{ value: 3, timestamp: new Date().toISOString(), isEstimated: true, source: "mock" }];
    }
}

/**
 * Categorize X-Ray flux (W/m^2) into NOAA class labels (A, B, C, M, X).
 */
function getXRayClass(flux: number): string {
    if (!flux) return "A1.0";
    if (flux >= 1e-4) return `X${(flux * 1e4).toFixed(1)}`;
    if (flux >= 1e-5) return `M${(flux * 1e5).toFixed(1)}`;
    if (flux >= 1e-6) return `C${(flux * 1e6).toFixed(1)}`;
    if (flux >= 1e-7) return `B${(flux * 1e7).toFixed(1)}`;
    return `A${(flux * 1e8).toFixed(1)}`;
}

/**
 * Fetches the GOES X-Ray Flux data to determine solar flares.
 */
export async function fetchNoaaXRayFlux(): Promise<XRayFluxData[]> {
    try {
        const res = await fetch(`${NOAA_SWPC_BASE_URL}/goes/primary/xrays-1-day.json`);
        if (!res.ok) throw new Error("NOAA SWPC API error for X-Ray Flux");

        const data = await res.json();

        // We only care about the larger channel (0.1-0.8 nm) for standard classifications
        const filtered = data.filter((item: any) => item.energy === "0.1-0.8nm");
        const recent = filtered.slice(-10); // Last 10 records

        return recent.map((item: any) => ({
            flux: item.flux,
            classLabel: getXRayClass(item.flux),
            timestamp: item.time_tag
        }));
    } catch (error) {
        console.warn("Falling back to simulated X-Ray due to error");
        return [{ flux: 1.2e-5, classLabel: "M1.2", timestamp: new Date().toISOString() }];
    }
}
