import { UnifiedSpaceWeather, SpaceWeatherAlerts } from "./schema";
import { fetchNoaaSolarWind, fetchNoaaKpIndex, fetchNoaaXRayFlux } from "./fetchers/noaa";
import { fetchGfzKpIndex } from "./fetchers/gfz";
import { fetchLocalMagnetometer } from "./fetchers/intermagnet";

export class SpaceWeatherEngine {

    /**
     * Main orchestrator function: Aggregates telemetry from all space agencies
     * evaluates alert triggers, and structures the unified JSON payload.
     */
    static async getLiveTelemetry(customStation: string = "TEO"): Promise<UnifiedSpaceWeather> {

        console.log("[Engine] Aggregating Space Weather Telemetry...");

        // Execute cross-agency data ingestion concurrently for maximum performance
        const [
            solarWind,
            noaaKp,
            xRayFlux,
            localMagnetometer
        ] = await Promise.all([
            fetchNoaaSolarWind(),
            fetchNoaaKpIndex(),
            fetchNoaaXRayFlux(),
            fetchLocalMagnetometer(customStation)
        ]);

        // We can merge NOAA and GFZ Kp records if necessary, but we'll default to NOAA mapping 
        // for seamless real-time processing and keep GFZ as a historical source context.
        const latestKp = noaaKp[noaaKp.length - 1]?.value || 0;

        // Execute localized algorithms for alert states
        const alerts = this.calculateAlertStatus(latestKp, solarWind.bz, xRayFlux[xRayFlux.length - 1]);

        return {
            timestamp: new Date().toISOString(),
            solarWind,
            kpIndex: noaaKp,
            xRayFlux: xRayFlux,
            localMagnetometer,
            alerts
        };
    }

    /**
     * Computes complex interaction matrices between planetary systems
     * to determine real-time vulnerability status.
     */
    private static calculateAlertStatus(kp: number, bz: number | null, latestXray: any): SpaceWeatherAlerts {
        let severity: "Normal" | "Elevated" | "Warning" | "Extreme" = "Normal";

        const geomagneticStorm = kp >= 5;
        const magneticDisconnection = !!bz && bz < -5.0; // Strong southward tipping
        const radioBlackout = !!latestXray && (latestXray.classLabel.startsWith("M") || latestXray.classLabel.startsWith("X"));

        if (kp >= 8 || latestXray?.classLabel?.startsWith("X")) {
            severity = "Extreme";
        } else if (geomagneticStorm || radioBlackout || magneticDisconnection) {
            severity = "Warning";
        } else if (kp >= 4 || (!!bz && bz < -2.0)) {
            severity = "Elevated";
        }

        return {
            geomagneticStorm,
            magneticDisconnection,
            radioBlackout,
            severityLevel: severity
        };
    }
}
