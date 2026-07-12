// src/lib/map/map-geometry.ts
// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRÍA de las zonas territoriales del Mapa (Adenda 63 · P-5).
//
// Modelo ÚNICO de zona, con dos formas posibles:
//
//     { kind: "circle",  center: [lat, lng], radiusM: number }
//     { kind: "polygon", ring: [[lat, lng], …] }               // ≥3 vértices
//
// COMPATIBILIDAD (regla dorada): las propuestas ya guardadas escriben la zona
// PLANA en `command.payload.mapZone` como { lat, lng, radiusM } SIN `kind`.
// `parseZoneGeometry()` acepta las tres formas (anidada, plana con kind, plana
// legacy) y, ante la ausencia de `kind`, asume CÍRCULO. Nunca lanza: devuelve
// null si no hay geometría reconocible.
//
// Área: fórmula esférica del "shoelace" (Chamberlain & Duquette) — precisión
// más que suficiente a escala de barrio/comarca. Centroide: centroide planar
// sobre proyección equirectangular local (cos(lat₀)), con caída al promedio de
// vértices si el polígono es degenerado.
//
// ⚠️ Alcance honesto: no se cruza el antimeridiano ni se manejan agujeros
// (multipolígonos). Una zona es un anillo simple. Si la red lo necesita, la
// migración natural es GeoJSON + PostGIS.
//
// Sin dependencias: matemática pura, SSR-safe (no toca window).
// ─────────────────────────────────────────────────────────────────────────────

/** Vértice como tupla [lat, lng] — el mismo orden que consume Leaflet. */
export type LatLngTuple = [number, number];

export interface CircleZone {
    kind: "circle";
    /** Centro [lat, lng]. */
    center: LatLngTuple;
    /** Radio en metros. */
    radiusM: number;
}

export interface PolygonZone {
    kind: "polygon";
    /** Anillo exterior [[lat, lng], …] — NO se repite el primer vértice al final. */
    ring: LatLngTuple[];
}

/** Geometría de una zona del mapa: círculo ajustable o polígono libre. */
export type ZoneGeometry = CircleZone | PolygonZone;

/** Radio de la Tierra (WGS84, semieje mayor) en metros. */
const EARTH_R = 6_378_137;

const RAD = Math.PI / 180;

function numOrNull(v: unknown): number | null {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

/** Valida y normaliza una tupla [lat, lng] (rango terrestre). Null si no lo es. */
export function toLatLng(v: unknown): LatLngTuple | null {
    if (Array.isArray(v) && v.length >= 2) {
        const lat = numOrNull(v[0]);
        const lng = numOrNull(v[1]);
        if (lat == null || lng == null) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return [lat, lng];
    }
    if (v && typeof v === "object") {
        const o = v as { lat?: unknown; lng?: unknown; lon?: unknown };
        const lat = numOrNull(o.lat);
        const lng = numOrNull(o.lng ?? o.lon);
        if (lat == null || lng == null) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return [lat, lng];
    }
    return null;
}

/** Normaliza una lista cruda de vértices a un anillo válido (o []). */
export function toRing(v: unknown): LatLngTuple[] {
    if (!Array.isArray(v)) return [];
    const out: LatLngTuple[] = [];
    for (const item of v) {
        const p = toLatLng(item);
        if (p) out.push(p);
    }
    // Si el anillo viene cerrado (último === primero), suelta el duplicado.
    if (out.length > 3) {
        const a = out[0];
        const b = out[out.length - 1];
        if (a[0] === b[0] && a[1] === b[1]) out.pop();
    }
    return out;
}

// ── Distancias y áreas ───────────────────────────────────────────────────────

/** Distancia haversine en metros entre dos puntos. */
export function distanceM(a: LatLngTuple, b: LatLngTuple): number {
    const dLat = (b[0] - a[0]) * RAD;
    const dLng = (b[1] - a[1]) * RAD;
    const lat1 = a[0] * RAD;
    const lat2 = b[0] * RAD;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Área aproximada (m²) de un anillo por SHOELACE ESFÉRICO. Signo descartado:
 * el sentido de giro (horario/antihorario) no importa para el área.
 */
export function ringAreaM2(ring: LatLngTuple[]): number {
    const n = ring.length;
    if (n < 3) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const p1 = ring[i];
        const p2 = ring[(i + 1) % n];
        sum +=
            (p2[1] - p1[1]) * RAD *
            (2 + Math.sin(p1[0] * RAD) + Math.sin(p2[0] * RAD));
    }
    return Math.abs((sum * EARTH_R * EARTH_R) / 2);
}

/** Área de un círculo (m²) — plano local, error despreciable a esta escala. */
export function circleAreaM2(radiusM: number): number {
    const r = Math.max(0, radiusM);
    return Math.PI * r * r;
}

/** Área de CUALQUIER zona (m²). */
export function zoneAreaM2(geom: ZoneGeometry): number {
    return geom.kind === "circle" ? circleAreaM2(geom.radiusM) : ringAreaM2(geom.ring);
}

/** Radio (m) del círculo de ÁREA EQUIVALENTE — compat con lectores antiguos. */
export function equivalentRadiusM(areaM2: number): number {
    return Math.sqrt(Math.max(0, areaM2) / Math.PI);
}

/** Área en español: "820 m²" · "3,4 ha" · "12,7 km²". */
export function formatArea(areaM2: number): string {
    const a = Math.max(0, areaM2);
    const fmt = (n: number, d: number) =>
        n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
    if (a < 10_000) return `${fmt(Math.round(a), 0)} m²`;
    if (a < 1_000_000) return `${fmt(a / 10_000, 1)} ha`;
    return `${fmt(a / 1_000_000, 2)} km²`;
}

/** Distancia en español: "480 m" · "2,4 km". */
export function formatDistance(m: number): string {
    const d = Math.max(0, m);
    if (d < 1000) return `${Math.round(d)} m`;
    return `${(d / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} km`;
}

// ── Centroide ────────────────────────────────────────────────────────────────

/**
 * Centroide de un anillo: centroide planar sobre proyección equirectangular
 * local. Si el polígono es degenerado (área ~0), promedia los vértices.
 */
export function ringCentroid(ring: LatLngTuple[]): LatLngTuple | null {
    const n = ring.length;
    if (n === 0) return null;
    if (n < 3) {
        const lat = ring.reduce((s, p) => s + p[0], 0) / n;
        const lng = ring.reduce((s, p) => s + p[1], 0) / n;
        return [lat, lng];
    }

    const lat0 = ring.reduce((s, p) => s + p[0], 0) / n;
    const k = Math.cos(lat0 * RAD) || 1e-6; // achatamiento de la longitud

    let twiceArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
        const p1 = ring[i];
        const p2 = ring[(i + 1) % n];
        const x1 = p1[1] * k, y1 = p1[0];
        const x2 = p2[1] * k, y2 = p2[0];
        const cross = x1 * y2 - x2 * y1;
        twiceArea += cross;
        cx += (x1 + x2) * cross;
        cy += (y1 + y2) * cross;
    }

    if (Math.abs(twiceArea) < 1e-12) {
        // Vértices colineales: promedio simple (nunca devolvemos NaN).
        const lat = ring.reduce((s, p) => s + p[0], 0) / n;
        const lng = ring.reduce((s, p) => s + p[1], 0) / n;
        return [lat, lng];
    }

    const f = 1 / (3 * twiceArea);
    const lng = (cx * f) / k;
    const lat = cy * f;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lat, lng];
}

/** Centroide de CUALQUIER zona (etiquetas, deep-link ?lat&lng&zoom). */
export function zoneCentroid(geom: ZoneGeometry): LatLngTuple | null {
    if (geom.kind === "circle") return geom.center;
    return ringCentroid(geom.ring);
}

/** Caja envolvente [[minLat,minLng],[maxLat,maxLng]] de una zona (para fitBounds). */
export function zoneBounds(geom: ZoneGeometry): [LatLngTuple, LatLngTuple] | null {
    if (geom.kind === "circle") {
        const [lat, lng] = geom.center;
        const dLat = (geom.radiusM / EARTH_R) / RAD;
        const dLng = dLat / Math.max(0.01, Math.cos(lat * RAD));
        return [[lat - dLat, lng - dLng], [lat + dLat, lng + dLng]];
    }
    if (geom.ring.length === 0) return null;
    let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180;
    for (const [lat, lng] of geom.ring) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
    }
    return [[minLat, minLng], [maxLat, maxLng]];
}

/**
 * Zoom sugerido para encuadrar una zona por su "diámetro" aproximado. Sencillo
 * y suficiente para el deep-link (?zoom=) sin depender de Leaflet.
 */
export function suggestedZoom(geom: ZoneGeometry): number {
    const area = zoneAreaM2(geom);
    const d = 2 * equivalentRadiusM(area); // diámetro equivalente en metros
    if (d < 150) return 18;
    if (d < 400) return 17;
    if (d < 900) return 16;
    if (d < 2_000) return 15;
    if (d < 5_000) return 14;
    if (d < 12_000) return 13;
    if (d < 30_000) return 12;
    return 11;
}

// ── Simplificación (trazo a mano alzada) ─────────────────────────────────────

/** Filtro por DISTANCIA MÍNIMA: descarta vértices más cercanos que `minM`. */
export function simplifyByMinDistance(ring: LatLngTuple[], minM: number): LatLngTuple[] {
    if (ring.length < 3 || minM <= 0) return [...ring];
    const out: LatLngTuple[] = [ring[0]];
    for (let i = 1; i < ring.length; i++) {
        if (distanceM(out[out.length - 1], ring[i]) >= minM) out.push(ring[i]);
    }
    // El cierre también debe respetar la distancia mínima.
    while (out.length > 3 && distanceM(out[out.length - 1], out[0]) < minM) out.pop();
    return out;
}

/** Distancia perpendicular (m) del punto `p` al segmento a→b (plano local). */
function perpDistanceM(p: LatLngTuple, a: LatLngTuple, b: LatLngTuple): number {
    const k = Math.cos(((a[0] + b[0]) / 2) * RAD) || 1e-6;
    const toM = EARTH_R * RAD;
    const px = p[1] * k * toM, py = p[0] * toM;
    const ax = a[1] * k * toM, ay = a[0] * toM;
    const bx = b[1] * k * toM, by = b[0] * toM;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas-Peucker sobre una POLILÍNEA abierta (tolerancia en metros). */
function douglasPeucker(pts: LatLngTuple[], tolM: number): LatLngTuple[] {
    if (pts.length < 3 || tolM <= 0) return [...pts];
    let maxD = 0;
    let idx = 0;
    const first = pts[0];
    const last = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
        const d = perpDistanceM(pts[i], first, last);
        if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= tolM) return [first, last];
    const left = douglasPeucker(pts.slice(0, idx + 1), tolM);
    const right = douglasPeucker(pts.slice(idx), tolM);
    return [...left.slice(0, -1), ...right];
}

/** Nº máximo de vértices que aceptamos persistir (protege la propuesta). */
export const MAX_RING_VERTICES = 220;

/**
 * Simplifica un trazo a mano alzada: primero DISTANCIA MÍNIMA (el requisito de
 * la Adenda), después una pasada Douglas-Peucker que quita vértices casi
 * colineales, y por último un recorte duro a MAX_RING_VERTICES.
 */
export function simplifyRing(
    ring: LatLngTuple[],
    opts?: { minDistanceM?: number; toleranceM?: number },
): LatLngTuple[] {
    const minD = opts?.minDistanceM ?? 0;
    const tol = opts?.toleranceM ?? 0;
    let out = minD > 0 ? simplifyByMinDistance(ring, minD) : [...ring];
    if (tol > 0 && out.length > 3) {
        // DP sobre el anillo tratado como polilínea abierta (mantiene extremos).
        const dp = douglasPeucker(out, tol);
        if (dp.length >= 3) out = dp;
    }
    if (out.length > MAX_RING_VERTICES) {
        const step = out.length / MAX_RING_VERTICES;
        const trimmed: LatLngTuple[] = [];
        for (let i = 0; i < MAX_RING_VERTICES; i++) trimmed.push(out[Math.floor(i * step)]);
        out = trimmed;
    }
    return out;
}

// ── Parseo / serialización (persistencia en proposals.command.payload) ───────

/** Un anillo es válido si tiene ≥3 vértices y área no nula. */
export function isValidRing(ring: LatLngTuple[]): boolean {
    return ring.length >= 3 && ringAreaM2(ring) > 1; // > 1 m²
}

/** Una geometría es válida si el círculo tiene radio > 0 o el anillo es válido. */
export function isValidZone(geom: ZoneGeometry | null): geom is ZoneGeometry {
    if (!geom) return false;
    return geom.kind === "circle" ? geom.radiusM > 0 : isValidRing(geom.ring);
}

/**
 * Lee la geometría desde el payload crudo de una propuesta. Acepta:
 *
 *   1. `{ geometry: { kind: "polygon", ring: [...] } }`   ← formato nuevo
 *   2. `{ kind: "polygon", ring: [...] }`                 ← geometría plana
 *   3. `{ lat, lng, radiusM }`                            ← LEGACY (sin kind) → círculo
 *
 * Nunca lanza. Devuelve null si no hay nada reconocible.
 */
export function parseZoneGeometry(raw: unknown): ZoneGeometry | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;

    // 1) Geometría anidada.
    if (o.geometry && typeof o.geometry === "object") {
        const nested = parseZoneGeometry(o.geometry);
        if (nested) return nested;
    }

    const kind = typeof o.kind === "string" ? o.kind : null;

    // 2) Polígono (plano o anidado ya resuelto arriba).
    if (kind === "polygon" || (kind == null && Array.isArray(o.ring))) {
        const ring = toRing(o.ring);
        if (isValidRing(ring)) return { kind: "polygon", ring };
        return null;
    }

    // 3) Círculo — explícito (kind:"circle") o LEGACY (sin kind).
    const center =
        toLatLng(o.center) ??
        toLatLng({ lat: o.lat, lng: o.lng });
    if (!center) return null;
    const r = numOrNull(o.radiusM) ?? numOrNull(o.radius);
    const radiusM = Math.max(1, r ?? 250);
    return { kind: "circle", center, radiusM };
}

/**
 * Serializa la geometría para `command.payload.mapZone`. Escribe la forma NUEVA
 * (`geometry`) y ADEMÁS los campos planos legacy (lat/lng/radiusM) para que
 * cualquier lector antiguo — o una versión desplegada previa del OS — siga
 * pintando algo razonable: en polígonos, el centroide y el radio del círculo de
 * área equivalente.
 */
export function serializeZoneGeometry(geom: ZoneGeometry): Record<string, unknown> {
    const centroid = zoneCentroid(geom);
    const areaM2 = zoneAreaM2(geom);
    const legacyRadius =
        geom.kind === "circle" ? Math.round(geom.radiusM) : Math.round(equivalentRadiusM(areaM2));

    const geometry: Record<string, unknown> =
        geom.kind === "circle"
            ? { kind: "circle", center: [geom.center[0], geom.center[1]], radiusM: Math.round(geom.radiusM) }
            : { kind: "polygon", ring: geom.ring.map(([lat, lng]) => [round6(lat), round6(lng)]) };

    return {
        geometry,
        areaM2: Math.round(areaM2),
        // ── Campos LEGACY (compatibilidad hacia atrás y hacia delante) ──
        lat: centroid ? round6(centroid[0]) : 0,
        lng: centroid ? round6(centroid[1]) : 0,
        radiusM: Math.max(1, legacyRadius),
    };
}

function round6(n: number): number {
    return Math.round(n * 1e6) / 1e6;
}

/** Descripción humana de la zona para el cuerpo de la propuesta. */
export function describeZone(geom: ZoneGeometry): string {
    const c = zoneCentroid(geom);
    const centro = c ? `${c[0].toFixed(5)}, ${c[1].toFixed(5)}` : "—";
    const area = formatArea(zoneAreaM2(geom));
    if (geom.kind === "circle") {
        return `Zona circular · centro ${centro} · radio ${Math.round(geom.radiusM)} m · área ≈ ${area}.`;
    }
    return `Zona poligonal · ${geom.ring.length} vértices · centroide ${centro} · área ≈ ${area}.`;
}
