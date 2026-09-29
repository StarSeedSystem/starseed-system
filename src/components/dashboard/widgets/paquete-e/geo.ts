/**
 * Geografía pura del paquete E: distancias, formato y «lo que tengo cerca». Sin DOM ni red.
 */

export interface ConCoordenadas { lat: number; lng: number }

/** Distancia en km (haversine). */
export function distanciaKm(a: ConCoordenadas, b: ConCoordenadas): number {
    const R = 6371;
    const rad = (x: number) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatearDistancia(km: number): string {
    if (!Number.isFinite(km)) return "—";
    if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
    if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
    return `${String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} km`;
}

/** Puntos ordenados por cercanía, con su distancia; opcionalmente dentro de un radio. */
export function ordenarPorCercania<T extends ConCoordenadas>(puntos: readonly T[], centro: ConCoordenadas, radioKm = Infinity): (T & { km: number })[] {
    return puntos
        .map((p) => ({ ...p, km: distanciaKm(centro, p) }))
        .filter((p) => p.km <= radioKm)
        .sort((a, b) => a.km - b.km);
}
