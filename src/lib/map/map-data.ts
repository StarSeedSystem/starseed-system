// src/lib/map/map-data.ts
// ─────────────────────────────────────────────────────────────────────────────
// Datos de la RED para el Mapa del Hub (SOP: centro-creacion-sync-permisos.md §12):
//
//   · Publicaciones GEOLOCALIZADAS (os_posts): la geo viaja en la metadata
//     `<!--ss:meta {..., geo:{lat,lng}} -->` embebida en el body (misma
//     convención del Centro de Creación — os_posts NO tiene columna metadata).
//     ⚠️ Alcance MVP honesto: al vivir la geo dentro del body, NO hay filtro
//     server-side posible; traemos las publicaciones recientes y filtramos en
//     cliente. Suficiente para la escala actual de la red; si crece, la
//     migración natural es una columna jsonb `metadata` + índice GIN.
//   · Propuestas DEMOCRÁTICAS territoriales (tabla `proposals`, motor de
//     src/lib/governance): kind dedicado "map_zone" (filtrable en servidor),
//     con la zona en command.payload.mapZone. Aprobada = passed/executed.
//     La zona puede ser un CÍRCULO o un POLÍGONO libre dibujado a mano
//     (Adenda 63 · P-5): la geometría se parsea/serializa en map-geometry.ts,
//     que mantiene la compatibilidad con las zonas circulares ya guardadas
//     (payload plano {lat,lng,radiusM} sin `kind` → círculo).
//   · Eventos (os_events) y Comunidades/Páginas/Grupos (os_pages/os_groups)
//     con columnas geo aditivas lat/lng/place_label ya existentes en os-social.
//
// Filosofía del repo: nunca lanza, SSR-safe (solo se llama desde efectos).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/client";
import {
    createPost,
    fetchPages,
    fetchGroups,
    fetchRealEventsSafe,
    type MutationResult,
    type OsEntityType,
    type OsEvent,
} from "@/lib/os-social";
import {
    parseSsMeta,
    stripSsMeta,
    buildSsMetaComment,
    SECTION_SLUGS,
} from "@/components/creation/creation-config";
import { createProposal } from "@/lib/governance/engine";
import {
    describeZone,
    equivalentRadiusM,
    parseZoneGeometry,
    serializeZoneGeometry,
    suggestedZoom,
    zoneAreaM2,
    zoneCentroid,
    type ZoneGeometry,
} from "@/lib/map/map-geometry";

// ── Publicaciones geolocalizadas ─────────────────────────────────────────────

export interface GeoAttachment {
    kind: string;
    url: string;
    name: string;
}

export interface GeoPost {
    id: string;
    authorName: string;
    entityType: OsEntityType;
    entitySlug: string;
    /** Cuerpo SIN el comentario ss:meta, recortado para popup. */
    excerpt: string;
    mediaUrl?: string;
    createdAt: string;
    lat: number;
    lng: number;
    /** Área/tipo declarados en la metadata (politica/educacion/…). */
    area?: string;
    tipo?: string;
    /** Archivos/enlaces adjuntos declarados en los bloques del Lienzo. */
    attachments: GeoAttachment[];
}

interface RawPostRow {
    id: string;
    author_name?: string | null;
    entity_type?: string | null;
    entity_slug?: string | null;
    body?: string | null;
    media_url?: string | null;
    created_at?: string | null;
}

function numOrNull(v: unknown): number | null {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * Publicaciones recientes con metadata geo. Ver nota MVP de cabecera: se traen
 * las últimas `scan` filas de os_posts (lectura pública por RLS) y se filtran
 * en cliente las que declaran `geo` en su ss:meta.
 */
export async function fetchGeoPosts(scan = 400): Promise<GeoPost[]> {
    if (typeof window === "undefined") return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_posts")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(scan);
        if (error || !Array.isArray(data)) return [];

        const out: GeoPost[] = [];
        for (const row of data as RawPostRow[]) {
            const meta = parseSsMeta(row.body);
            const geo = (meta as { geo?: { lat?: unknown; lng?: unknown } } | null)?.geo;
            const lat = numOrNull(geo?.lat);
            const lng = numOrNull(geo?.lng);
            if (lat == null || lng == null) continue;

            const clean = stripSsMeta(row.body).trim();
            const attachments: GeoAttachment[] = [];
            for (const b of meta?.blocks ?? []) {
                const url = typeof b.url === "string" ? b.url : "";
                if (!url) continue;
                // Compat: la serialización antigua usaba `t`/`label`; la actual usa `type`/`name`.
                const legacy = b as { t?: unknown; label?: unknown };
                attachments.push({
                    kind: typeof b.type === "string" ? b.type : (typeof legacy.t === "string" ? legacy.t : "archivo"),
                    url,
                    name: typeof b.name === "string" && b.name ? b.name : (typeof legacy.label === "string" ? legacy.label : "adjunto"),
                });
            }

            out.push({
                id: row.id,
                authorName: row.author_name || "Ciudadano StarSeed",
                entityType: (row.entity_type as OsEntityType) || "page",
                entitySlug: row.entity_slug || "",
                excerpt: clean.length > 220 ? `${clean.slice(0, 220)}…` : clean,
                mediaUrl: row.media_url || undefined,
                createdAt: row.created_at || new Date().toISOString(),
                lat,
                lng,
                area: typeof meta?.area === "string" ? meta.area : undefined,
                tipo: typeof meta?.tipo === "string" ? meta.tipo : undefined,
                attachments,
            });
        }
        return out;
    } catch {
        return [];
    }
}

/**
 * Enlace "real" de una publicación: su feed de contexto. Las publicaciones de
 * os_posts viven en los feeds de sección (/publish?area=…) o en la página de
 * su entidad — no existe (aún) una vista dedicada /post para os_posts (la ruta
 * /post/[id] usa la tabla histórica `posts`), así que enlazamos el contexto.
 */
export function geoPostHref(p: Pick<GeoPost, "entityType" | "entitySlug">): string {
    const slug = p.entitySlug || "";
    const sectionIds = Object.entries(SECTION_SLUGS);
    for (const [dest, s] of sectionIds) {
        if (p.entityType === "page" && slug === s) return `/publish?area=${dest}`;
    }
    if (p.entityType === "page" && slug === "perfil-mi-perfil") return "/publish";
    if (p.entityType === "group") return `/grupo/${slug}`;
    if (p.entityType === "event") return `/evento/${slug}`;
    if (p.entityType === "profile") return `/profile/${slug}`;
    return `/pagina/${slug}`;
}

/**
 * Comentario rápido geolocalizado: crea un os_post real (createPost de
 * os-social) con la geo en la metadata ss:meta — formato ILIMITADO de la red:
 * el mismo post admite markdown, enlaces y adjuntos si se crea desde el Lienzo.
 * Destino: el feed del perfil propio (mismo shape que /publish "Mi Perfil").
 */
export async function createGeoQuickPost(input: {
    text: string;
    lat: number;
    lng: number;
    authorName?: string;
}): Promise<MutationResult> {
    const text = input.text.trim();
    if (!text) return { ok: false, error: "El comentario está vacío." };
    const meta = buildSsMetaComment({
        area: "perfil",
        tipo: "geo-comentario",
        geo: { lat: input.lat, lng: input.lng },
    });
    return createPost({
        entityType: "page",
        entitySlug: "perfil-mi-perfil",
        body: `${text}\n\n${meta}`,
        authorName: input.authorName,
    });
}

// ── Democracia territorial (tabla proposals · kind "map_zone") ───────────────

/** Kind dedicado en `proposals` para filtrar en servidor las zonas del mapa. */
export const MAP_PROPOSAL_KIND = "map_zone";

export type ZoneKind = "nombre-de-zona" | "uso-de-suelo" | "evento" | "comunidad";

export const ZONE_KINDS: Array<{ id: ZoneKind; label: string }> = [
    { id: "nombre-de-zona", label: "Nombre de zona" },
    { id: "uso-de-suelo", label: "Uso de suelo" },
    { id: "evento", label: "Evento" },
    { id: "comunidad", label: "Comunidad" },
];

export interface MapZoneProposal {
    id: string;
    title: string;
    /** Nombre propuesto para la zona/uso. */
    name: string;
    zoneKind: ZoneKind;
    description: string;
    status: string;
    /**
     * Geometría REAL de la zona: círculo ajustable o POLÍGONO libre
     * (Adenda 63 · P-5). Ver src/lib/map/map-geometry.ts — las propuestas
     * antiguas (sin `kind`) se leen como círculo, sin migración de datos.
     */
    geometry: ZoneGeometry;
    /** Centroide de la geometría (etiquetas, deep-link ?lat&lng&zoom). */
    lat: number;
    lng: number;
    /** Radio en m: real en círculos, EQUIVALENTE por área en polígonos. */
    radiusM: number;
    /** Área aproximada en m² (shoelace esférico). */
    areaM2: number;
    createdAt: string;
}

/** Estados que el mapa pinta como zona APROBADA (etiqueta de nombre/uso). */
export const APPROVED_STATUSES = ["passed", "executed"];

interface ProposalRow {
    id: string;
    title?: string | null;
    description?: string | null;
    status?: string | null;
    created_at?: string | null;
    command?: { type?: string; payload?: Record<string, unknown> } | null;
}

/** Propuestas territoriales (kind map_zone) con su zona parseada. */
export async function fetchMapProposals(limit = 150): Promise<MapZoneProposal[]> {
    if (typeof window === "undefined") return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("proposals")
            .select("*")
            .eq("kind", MAP_PROPOSAL_KIND)
            .order("created_at", { ascending: false })
            .limit(limit);
        if (error || !Array.isArray(data)) return [];

        const out: MapZoneProposal[] = [];
        for (const row of data as ProposalRow[]) {
            const mz = (row.command?.payload as { mapZone?: Record<string, unknown> } | undefined)?.mapZone;
            if (!mz) continue;

            // COMPATIBILIDAD: geometría nueva ({kind:…}) o legacy plana
            // ({lat,lng,radiusM} sin kind) → siempre un ZoneGeometry válido.
            const geometry = parseZoneGeometry(mz);
            if (!geometry) continue;

            const centroid = zoneCentroid(geometry);
            if (!centroid) continue;
            const areaM2 = zoneAreaM2(geometry);

            out.push({
                id: row.id,
                title: row.title || "Propuesta territorial",
                name: typeof mz.name === "string" && mz.name ? mz.name : (row.title || "Zona"),
                zoneKind: (typeof mz.zoneKind === "string" ? mz.zoneKind : "nombre-de-zona") as ZoneKind,
                description: row.description || "",
                status: row.status || "open",
                geometry,
                lat: centroid[0],
                lng: centroid[1],
                radiusM:
                    geometry.kind === "circle"
                        ? Math.max(20, geometry.radiusM)
                        : Math.max(20, Math.round(equivalentRadiusM(areaM2))),
                areaM2,
                createdAt: row.created_at || new Date().toISOString(),
            });
        }
        return out;
    } catch {
        return [];
    }
}

/**
 * Crea una PROPUESTA democrática territorial usando el motor de gobernanza
 * existente (mismas tablas/flujo que /network/politics; se vota allí o en
 * /decisiones). La zona viaja en command.payload.mapZone — el tipo de comando
 * "custom" es un no-op seguro al ejecutarse ("registrado para revisión"), y
 * un adjunto de tipo enlace permite saltar del feed político al mapa.
 *
 * La geometría admite CÍRCULO o POLÍGONO libre (Adenda 63 · P-5) y se serializa
 * con `serializeZoneGeometry`, que escribe el bloque nuevo `geometry` Y los
 * campos planos legacy (lat/lng/radiusM ≈ centroide + radio equivalente), de
 * modo que un cliente antiguo del OS siga pintando la zona como un círculo
 * razonable en vez de ignorarla.
 */
export async function createZoneProposal(input: {
    name: string;
    zoneKind: ZoneKind;
    description: string;
    geometry: ZoneGeometry;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
    const kindLabel = ZONE_KINDS.find((z) => z.id === input.zoneKind)?.label ?? "Zona";
    const centroid = zoneCentroid(input.geometry);
    if (!centroid) return { ok: false, error: "La zona dibujada no es válida." };
    const zoom = suggestedZoom(input.geometry);
    const mapHref = `/hub/mapa?lat=${centroid[0].toFixed(6)}&lng=${centroid[1].toFixed(6)}&zoom=${zoom}`;

    return createProposal({
        scope: "global",
        kind: MAP_PROPOSAL_KIND,
        title: `[Mapa] ${kindLabel}: ${input.name.trim()}`,
        description:
            `${input.description.trim()}\n\n` +
            describeZone(input.geometry),
        command: {
            type: "custom",
            payload: {
                mapZone: {
                    name: input.name.trim(),
                    zoneKind: input.zoneKind,
                    ...serializeZoneGeometry(input.geometry),
                },
            },
        },
        attachments: [{ type: "link", value: mapHref, label: "Ver en el Mapa" }],
    });
}

// ── Eventos y lugares (comunidades/páginas/grupos) con geo ───────────────────

export interface GeoEvent {
    id: string;
    slug: string;
    title: string;
    kind: string;
    startsAt: string | null;
    location: string;
    lat: number;
    lng: number;
}

/** Eventos REALES (sin ejemplos) con coordenadas. */
export async function fetchGeoEvents(): Promise<GeoEvent[]> {
    const events = await fetchRealEventsSafe();
    return events
        .filter((e: OsEvent) => e.lat != null && e.lng != null)
        .map((e) => ({
            id: e.id,
            slug: e.slug,
            title: e.title,
            kind: e.kind,
            startsAt: e.startsAt,
            location: e.location || e.placeLabel || "",
            lat: e.lat as number,
            lng: e.lng as number,
        }));
}

export interface GeoPlace {
    id: string;
    slug: string;
    name: string;
    kind: string;
    entity: "page" | "group";
    memberCount: number;
    lat: number;
    lng: number;
    placeLabel: string;
}

/** Comunidades/páginas y grupos REALES con ubicación declarada. */
export async function fetchGeoPlaces(): Promise<GeoPlace[]> {
    if (typeof window === "undefined") return [];
    const out: GeoPlace[] = [];
    try {
        const pages = await fetchPages();
        for (const p of pages) {
            if (p.isSample || p.lat == null || p.lng == null) continue;
            out.push({
                id: p.id, slug: p.slug, name: p.name, kind: p.kind, entity: "page",
                memberCount: p.memberCount, lat: p.lat, lng: p.lng, placeLabel: p.placeLabel || "",
            });
        }
    } catch { /* páginas no disponibles: seguimos con grupos */ }
    try {
        const groups = await fetchGroups();
        for (const g of groups) {
            if (g.isSample || g.lat == null || g.lng == null) continue;
            out.push({
                id: g.id, slug: g.slug, name: g.name, kind: g.kind, entity: "group",
                memberCount: g.memberCount, lat: g.lat, lng: g.lng, placeLabel: g.placeLabel || "",
            });
        }
    } catch { /* grupos no disponibles */ }
    return out;
}
