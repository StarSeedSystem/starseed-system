import { NextResponse } from 'next/server';
import { SpaceWeatherEngine } from '@/modules/weather/services/space/engine';

// This acts as our internal MCP edge endpoint for the frontend widgets to consume.
// Leveraging Next.js edge caching with revalidation to avoid hammering NOAA/GFZ APIs.

export const revalidate = 60; // Cache for 1 minute (60 seconds)

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const station = searchParams.get('station') || 'TEO';

        // Engine call: Fuses NOAA, GFZ, and INTERMAGNET telemetry in real-time
        const telemetry = await SpaceWeatherEngine.getLiveTelemetry(station);

        return NextResponse.json({
            success: true,
            data: telemetry
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
            }
        });

    } catch (error) {
        console.error("Critical failure in Space Weather API:", error);

        return NextResponse.json({
            success: false,
            error: "Failed to assemble Space Weather telemetry.",
            details: error instanceof Error ? error.message : "Unknown error"
        }, {
            status: 500
        });
    }
}
