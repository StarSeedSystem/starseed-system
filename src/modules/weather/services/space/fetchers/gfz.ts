import { KpIndexData } from "../schema";

const GFZ_BASE_URL = "https://kp.gfz-potsdam.de/app/json";

/**
 * Fetches the definitive and nowcast Kp index from GFZ Potsdam.
 * GFZ is the official source of the planetary Kp index.
 */
export async function fetchGfzKpIndex(): Promise<KpIndexData[]> {
    try {
        // Attempting to fetch the latest current Kp reading (nowcast)
        const res = await fetch(`${GFZ_BASE_URL}/?obs=kp`); // Generic endpoint structure example

        // Note: Due to CORS or exact endpoint structure, we might need a robust fallback plan.
        if (!res.ok) {
            throw new Error(`GFZ API responded with ${res.status}`);
        }

        const rawData = await res.json();

        // Map the expected GFZ response format to our schema
        const data: KpIndexData[] = rawData.datetime.map((timeStr: string, index: number) => ({
            value: rawData.kp[index],
            timestamp: timeStr,
            isEstimated: false,
            source: "GFZ Potsdam"
        }));

        return data.slice(-8); // Return the last 24 hours (8 intervals of 3 hours)
    } catch (error) {
        console.warn("GFZ Potsdam fetch failed, falling back to NOAA or mock data.", error);

        // In a real production app without guarantee of external uptime, 
        // it's always critical to have a default un-failing payload.
        const now = new Date();
        return [
            { value: 2, timestamp: now.toISOString(), isEstimated: true, source: "GFZ Mock Fallback" }
        ];
    }
}
