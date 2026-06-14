// ════════════════════════════════════════════════════════════════
// geo.ts — Helpers geográficos puros (sin dependencias externas)
// ----------------------------------------------------------------
// Funciones deterministas para trabajar con coordenadas: distancia
// haversine, generación de nodos de ejemplo alrededor de un punto y
// formateo. No tocan el DOM ni window; son seguras en SSR.
// ════════════════════════════════════════════════════════════════

export interface GeoPoint {
    lat: number;
    lon: number;
}

export interface GeoEntity extends GeoPoint {
    id: string;
    name: string;
    kind: string;
}

const EARTH_RADIUS_KM = 6371;

/** Distancia en km entre dos puntos (fórmula del haversine). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Formatea una distancia en km de forma legible. */
export function formatKm(km: number): string {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/**
 * Genera entidades StarSeed de ejemplo distribuidas en círculo alrededor
 * de un centro. Determinista (no usa Math.random) para estabilidad en
 * renders y SSR. Las coordenadas son ficticias (demo).
 */
const SAMPLE_ENTITIES: Array<{ name: string; kind: string }> = [
    { name: "Sangha Cuernavaca", kind: "Comunidad" },
    { name: "Huerto Comunal Tepoztlán", kind: "Recurso" },
    { name: "Ágora Local", kind: "Gobernanza" },
    { name: "Biblioteca Universal — Nodo Sur", kind: "Educación" },
    { name: "Estudio Creativo Resonante", kind: "Cultura" },
    { name: "Microred Solar Oikos", kind: "Energía" },
];

export function sampleEntitiesAround(
    center: GeoPoint,
    radiusKm = 4,
): GeoEntity[] {
    // 1 grado de latitud ≈ 111 km. Ajustamos longitud por el coseno de la lat.
    const latPerKm = 1 / 111;
    const lonPerKm = 1 / (111 * Math.cos((center.lat * Math.PI) / 180) || 1);
    return SAMPLE_ENTITIES.map((e, i) => {
        const angle = (i / SAMPLE_ENTITIES.length) * 2 * Math.PI;
        // Radios escalonados para que no queden todos a la misma distancia.
        const r = radiusKm * (0.35 + 0.5 * ((i % 3) / 2));
        return {
            id: `geo-${i}`,
            name: e.name,
            kind: e.kind,
            lat: center.lat + Math.sin(angle) * r * latPerKm,
            lon: center.lon + Math.cos(angle) * r * lonPerKm,
        };
    });
}
