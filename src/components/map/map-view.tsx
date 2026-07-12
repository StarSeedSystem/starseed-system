"use client";

// src/components/map/map-view.tsx
// ─────────────────────────────────────────────────────────────────────────────
// MAPA del Hub de Conexiones (SOP: architecture/centro-creacion-sync-permisos.md §12).
// Estilo Google Maps pero SOBERANO: base OpenStreetMap (filosofía Organic Maps),
// Leaflet 1.9.4 por CDN (src/lib/map/leaflet-loader.ts), sin dependencias npm.
//
//   · Capas base conmutables con miniaturas (OSM / Esri satélite / OpenTopoMap /
//     Carto oscuro) + clima REAL multi-fuente con opacidad ajustable
//     (RainViewer radar animable + NASA GIBS satelital del día anterior).
//   · GPS ("Mi ubicación" + seguimiento) y UBICACIÓN COMPARTIDA con permisos
//     (off | red | usuarios/grupos) vía presencia realtime (location-share.ts).
//   · Capas de datos de la red: publicaciones geolocalizadas (os_posts con
//     ss:meta.geo), propuestas democráticas territoriales (proposals · kind
//     map_zone), eventos (os_events) y comunidades/páginas (os_pages/os_groups).
//   · Click derecho / pulsación larga → "Crear aquí": Lienzo Universal con geo,
//     comentario rápido, o propuesta de nombre/uso de zona (Ontocracia).
//   · Buscador de lugares Nominatim (debounce 600 ms, uso educado).
//   · Estado persistido en starseed.map.view.v1 · compartición en
//     starseed.map.location.v1 (ambas candidatas a SYNCED_KEYS).
//
// SSR-safe: TODO acceso a window/Leaflet ocurre dentro de efectos.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { loadLeaflet, type LeafletNS } from "@/lib/map/leaflet-loader";
import {
    BASE_LAYERS,
    BASE_LAYER_BY_ID,
    GIBS_LAYERS,
    GIBS_ATTRIBUTION,
    RAINVIEWER_ATTRIBUTION,
    MAP_CREDIT_HTML,
    ORGANIC_MAPS_REPO,
    loadMapView,
    saveMapView,
    previewTileUrl,
    fetchRainViewer,
    rainTileUrl,
    gibsTileUrl,
    gibsDate,
    searchPlaces,
    escapeHtml,
    timeAgo,
    type MapViewState,
    type RainViewerData,
    type PlaceHit,
} from "@/lib/map/map-config";
import {
    fetchGeoPosts,
    fetchGeoEvents,
    fetchGeoPlaces,
    fetchMapProposals,
    createGeoQuickPost,
    createZoneProposal,
    geoPostHref,
    APPROVED_STATUSES,
    ZONE_KINDS,
    MAP_PROPOSAL_KIND,
    type GeoPost,
    type GeoEvent,
    type GeoPlace,
    type MapZoneProposal,
    type ZoneKind,
} from "@/lib/map/map-data";
import {
    loadShareConfig,
    saveShareConfig,
    topicsForSharing,
    topicsForWatching,
    createMapPresence,
    type LocationShareConfig,
    type LocationShareMode,
    type MapPeer,
    type MapPresenceHandle,
} from "@/lib/map/location-share";
import { getCurrentUserId } from "@/lib/os-social";
import { fetchMyProfile, searchUsers, searchGroups, type OsProfile, type SocialGroupHit } from "@/lib/social/os-profiles";
import { deviceId } from "@/lib/sync/entity-state";
import { onTableChange } from "@/lib/realtime/realtime";
import {
    Layers,
    LocateFixed,
    Search,
    Share2,
    X,
    Plus,
    Minus,
    Loader2,
    Play,
    Pause,
    MapPin,
    Sparkles,
    MessageSquarePlus,
    Landmark,
    Users,
    CalendarDays,
    Vote,
    RefreshCw,
    Navigation,
    ExternalLink,
} from "lucide-react";

// ── Constantes de render ─────────────────────────────────────────────────────

const AREA_COLORS: Record<string, string> = {
    politica: "#38bdf8",
    educacion: "#fbbf24",
    cultura: "#e879f9",
    biblioteca: "#2dd4bf",
};
const POST_COLOR_DEFAULT = "#34d399";
const EVENT_COLOR = "#f472b6";
const PLACE_COLOR = "#a78bfa";
const ZONE_OPEN_COLOR = "#fbbf24";
const ZONE_APPROVED_COLOR = "#34d399";

/** Mínimo intervalo entre latidos de posición compartida (ms). */
const SHARE_THROTTLE_MS = 12_000;

// HTML de un pin circular "glass" (se inyecta escapado donde toca).
function pinHtml(color: string, size = 14): string {
    return (
        `<span class="ss-pin" style="--c:${color};width:${size}px;height:${size}px"></span>`
    );
}

function isImageUrl(url: string): boolean {
    return /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url);
}

interface CreateAtState {
    x: number;
    y: number;
    lat: number;
    lng: number;
    mode: "menu" | "comentario";
}

interface MyIdentity {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    /** true si es una identidad anónima local (sin sesión): puede VER, no emitir. */
    anonymous: boolean;
}

export function MapView({ className }: { className?: string }) {
    const router = useRouter();
    const { toast } = useToast();

    // ── Refs de Leaflet ──
    const containerRef = useRef<HTMLDivElement | null>(null);
    const lRef = useRef<LeafletNS>(null);
    const mapRef = useRef<any>(null);
    const baseLayerRef = useRef<any>(null);
    const overlayRefs = useRef<Record<string, any>>({});
    const groupRefs = useRef<Record<string, any>>({});
    const myLocRef = useRef<{ marker: any; circle: any } | null>(null);
    const previewCircleRef = useRef<any>(null);
    const presenceRef = useRef<MapPresenceHandle | null>(null);
    const geoWatchRef = useRef<number | null>(null);
    const lastShareSentRef = useRef(0);
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Estado ──
    const initialView = useMemo<MapViewState>(() => loadMapView(), []);
    const [ready, setReady] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [baseId, setBaseId] = useState(initialView.base);
    const [overlaysOn, setOverlaysOn] = useState<string[]>(initialView.overlaysOn);
    const [overlayOpacity, setOverlayOpacity] = useState<Record<string, number>>(initialView.overlayOpacity);
    const [dataLayers, setDataLayers] = useState<Record<string, boolean>>(initialView.dataLayers);
    const [layersOpen, setLayersOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);

    const [rain, setRain] = useState<RainViewerData | null>(null);
    const [rainIdx, setRainIdx] = useState(0);
    const [rainPlaying, setRainPlaying] = useState(false);
    const [rainLoading, setRainLoading] = useState(false);

    const [me, setMe] = useState<MyIdentity | null>(null);
    const [shareCfg, setShareCfg] = useState<LocationShareConfig>(() => loadShareConfig());
    const [peers, setPeers] = useState<MapPeer[]>([]);
    const [following, setFollowing] = useState(false);

    const [searchQ, setSearchQ] = useState("");
    const [searchHits, setSearchHits] = useState<PlaceHit[]>([]);
    const [searching, setSearching] = useState(false);

    const [createAt, setCreateAt] = useState<CreateAtState | null>(null);
    const [quickText, setQuickText] = useState("");
    const [quickBusy, setQuickBusy] = useState(false);

    const [propOpen, setPropOpen] = useState(false);
    const [propLatLng, setPropLatLng] = useState<{ lat: number; lng: number } | null>(null);
    const [propName, setPropName] = useState("");
    const [propKind, setPropKind] = useState<ZoneKind>("nombre-de-zona");
    const [propDesc, setPropDesc] = useState("");
    const [propRadius, setPropRadius] = useState(250);
    const [propBusy, setPropBusy] = useState(false);

    const [counts, setCounts] = useState<Record<string, number | null>>({
        posts: null, proposals: null, events: null, places: null,
    });
    const [reloadTick, setReloadTick] = useState(0);

    // Buscadores del panel de compartir
    const [userQ, setUserQ] = useState("");
    const [userHits, setUserHits] = useState<OsProfile[]>([]);
    const [groupQ, setGroupQ] = useState("");
    const [groupHits, setGroupHits] = useState<SocialGroupHit[]>([]);

    // Espejo de settings para handlers de Leaflet (evita closures obsoletos).
    const settingsRef = useRef({ baseId, overlaysOn, overlayOpacity, dataLayers });
    useEffect(() => {
        settingsRef.current = { baseId, overlaysOn, overlayOpacity, dataLayers };
    }, [baseId, overlaysOn, overlayOpacity, dataLayers]);

    // ── Persistencia (centro/zoom desde el mapa + settings desde el estado) ──
    const persistView = useCallback(() => {
        const map = mapRef.current;
        if (!map) return;
        try {
            const c = map.getCenter();
            const s = settingsRef.current;
            saveMapView({
                lat: c.lat,
                lng: c.lng,
                zoom: map.getZoom(),
                base: s.baseId,
                overlaysOn: s.overlaysOn,
                overlayOpacity: s.overlayOpacity,
                dataLayers: s.dataLayers,
            });
        } catch { /* noop */ }
    }, []);

    const schedulePersist = useCallback(() => {
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(persistView, 600);
    }, [persistView]);

    // ── Identidad (para presencia + autoría de comentarios) ──
    useEffect(() => {
        let alive = true;
        (async () => {
            const uid = await getCurrentUserId();
            if (!alive) return;
            if (!uid) {
                // Sin sesión: identidad anónima local — puede MIRAR el mapa y la
                // presencia pública, nunca emitir su posición.
                setMe({
                    userId: `anon-${deviceId()}`,
                    username: "anonimo",
                    displayName: "Visitante",
                    anonymous: true,
                });
                return;
            }
            const profile = await fetchMyProfile();
            if (!alive) return;
            setMe({
                userId: uid,
                username: profile?.username || "starseeder",
                displayName: profile?.displayName || "Ciudadano StarSeed",
                avatarUrl: profile?.avatarUrl,
                anonymous: false,
            });
        })();
        return () => { alive = false; };
    }, []);

    // ── Inicialización del mapa ──
    useEffect(() => {
        let alive = true;
        loadLeaflet()
            .then((L) => {
                if (!alive || !containerRef.current || mapRef.current) return;
                lRef.current = L;

                // Deep-link ?lat=&lng=&zoom= (p. ej. desde el adjunto "Ver en el
                // Mapa" de una propuesta territorial).
                let { lat, lng, zoom } = initialView;
                try {
                    const q = new URLSearchParams(window.location.search);
                    const qlat = Number(q.get("lat"));
                    const qlng = Number(q.get("lng"));
                    const qzoom = Number(q.get("zoom"));
                    if (Number.isFinite(qlat) && Number.isFinite(qlng)) {
                        lat = qlat; lng = qlng; zoom = Number.isFinite(qzoom) ? qzoom : 15;
                    }
                } catch { /* noop */ }

                const map = L.map(containerRef.current, {
                    center: [lat, lng],
                    zoom,
                    zoomControl: false,
                    attributionControl: true,
                    worldCopyJump: true,
                });
                mapRef.current = map;
                // Crédito global SIEMPRE visible (OSM + Organic Maps).
                try { map.attributionControl.addAttribution(MAP_CREDIT_HTML); } catch { /* noop */ }

                // Grupos de datos (se añaden/quitan según dataLayers).
                for (const key of ["posts", "proposals", "events", "places", "peers", "search"]) {
                    groupRefs.current[key] = L.layerGroup();
                }

                map.on("moveend", schedulePersist);
                map.on("dragstart", () => setFollowing(false));
                map.on("click", () => setCreateAt(null));
                // Click derecho en escritorio; Leaflet también dispara
                // `contextmenu` con PULSACIÓN LARGA en pantallas táctiles.
                map.on("contextmenu", (e: any) => {
                    try { e.originalEvent?.preventDefault?.(); } catch { /* noop */ }
                    setCreateAt({
                        x: e.containerPoint?.x ?? 0,
                        y: e.containerPoint?.y ?? 0,
                        lat: e.latlng?.lat,
                        lng: e.latlng?.lng,
                        mode: "menu",
                    });
                });

                setReady(true);
            })
            .catch((e: unknown) => {
                if (alive) setLoadError(e instanceof Error ? e.message : "No se pudo cargar el mapa.");
            });

        return () => {
            alive = false;
            try { presenceRef.current?.stop(); } catch { /* noop */ }
            presenceRef.current = null;
            if (geoWatchRef.current != null && typeof navigator !== "undefined") {
                try { navigator.geolocation.clearWatch(geoWatchRef.current); } catch { /* noop */ }
                geoWatchRef.current = null;
            }
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
            try { mapRef.current?.remove(); } catch { /* noop */ }
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- init una sola vez
    }, []);

    // ── Capa base ──
    useEffect(() => {
        const L = lRef.current, map = mapRef.current;
        if (!ready || !L || !map) return;
        const def = BASE_LAYER_BY_ID[baseId] ?? BASE_LAYERS[0];
        try {
            if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
            const layer = L.tileLayer(def.url, {
                attribution: def.attribution,
                maxZoom: def.maxZoom,
                zIndex: 1, // base SIEMPRE debajo de las superposiciones de clima
                ...(def.subdomains ? { subdomains: def.subdomains } : {}),
            });
            layer.addTo(map);
            baseLayerRef.current = layer;
        } catch { /* noop */ }
        schedulePersist();
    }, [ready, baseId, schedulePersist]);

    // ── Superposiciones de clima (GIBS + RainViewer) ──
    useEffect(() => {
        const L = lRef.current, map = mapRef.current;
        if (!ready || !L || !map) return;

        // NASA GIBS
        for (const def of GIBS_LAYERS) {
            const on = overlaysOn.includes(def.id);
            const existing = overlayRefs.current[def.id];
            if (on && !existing) {
                try {
                    const layer = L.tileLayer(gibsTileUrl(def), {
                        attribution: GIBS_ATTRIBUTION,
                        opacity: overlayOpacity[def.id] ?? 0.75,
                        maxNativeZoom: def.level,
                        maxZoom: 19,
                        zIndex: 5, // clima por ENCIMA de la base
                    });
                    layer.addTo(map);
                    overlayRefs.current[def.id] = layer;
                } catch { /* noop */ }
            } else if (!on && existing) {
                try { map.removeLayer(existing); } catch { /* noop */ }
                delete overlayRefs.current[def.id];
            } else if (existing) {
                try { existing.setOpacity(overlayOpacity[def.id] ?? 0.75); } catch { /* noop */ }
            }
        }

        // RainViewer (radar con frames)
        const rainOn = overlaysOn.includes("rainviewer");
        const rainLayer = overlayRefs.current["rainviewer"];
        if (rainOn) {
            if (!rain && !rainLoading) {
                setRainLoading(true);
                void fetchRainViewer().then((data) => {
                    setRainLoading(false);
                    if (data) {
                        setRain(data);
                        setRainIdx(data.nowIndex);
                    } else {
                        toast({
                            title: "Radar no disponible",
                            description: "RainViewer no respondió. Inténtalo de nuevo en un momento.",
                            variant: "destructive",
                        });
                        setOverlaysOn((prev) => prev.filter((o) => o !== "rainviewer"));
                    }
                });
            } else if (rain) {
                const frame = rain.frames[Math.min(rainIdx, rain.frames.length - 1)];
                const url = rainTileUrl(rain.host, frame.path);
                if (!rainLayer) {
                    try {
                        const layer = L.tileLayer(url, {
                            attribution: RAINVIEWER_ATTRIBUTION,
                            opacity: overlayOpacity["rainviewer"] ?? 0.7,
                            maxNativeZoom: 12,
                            maxZoom: 19,
                            zIndex: 6, // radar por encima de base y GIBS
                        });
                        layer.addTo(map);
                        overlayRefs.current["rainviewer"] = layer;
                    } catch { /* noop */ }
                } else {
                    try {
                        rainLayer.setUrl(url);
                        rainLayer.setOpacity(overlayOpacity["rainviewer"] ?? 0.7);
                    } catch { /* noop */ }
                }
            }
        } else if (rainLayer) {
            try { map.removeLayer(rainLayer); } catch { /* noop */ }
            delete overlayRefs.current["rainviewer"];
            setRainPlaying(false);
        }
        schedulePersist();
    }, [ready, overlaysOn, overlayOpacity, rain, rainIdx, rainLoading, toast, schedulePersist]);

    // Animación del radar (frames pasados + nowcast de RainViewer).
    useEffect(() => {
        if (!rainPlaying || !rain || rain.frames.length < 2) return;
        const t = setInterval(() => {
            setRainIdx((i) => (i + 1) % rain.frames.length);
        }, 650);
        return () => clearInterval(t);
    }, [rainPlaying, rain]);

    // ── Toggle de grupos de datos en el mapa ──
    useEffect(() => {
        const map = mapRef.current;
        if (!ready || !map) return;
        for (const key of ["posts", "proposals", "events", "places", "peers"]) {
            const group = groupRefs.current[key];
            if (!group) continue;
            const on = dataLayers[key] !== false;
            try {
                if (on && !map.hasLayer(group)) map.addLayer(group);
                if (!on && map.hasLayer(group)) map.removeLayer(group);
            } catch { /* noop */ }
        }
        // El grupo de búsqueda siempre está visible.
        try {
            const sg = groupRefs.current["search"];
            if (sg && !map.hasLayer(sg)) map.addLayer(sg);
        } catch { /* noop */ }
        schedulePersist();
    }, [ready, dataLayers, schedulePersist]);

    // ── Capa: publicaciones geolocalizadas (+ realtime) ──
    useEffect(() => {
        const L = lRef.current;
        const group = groupRefs.current["posts"];
        if (!ready || !L || !group) return;
        let alive = true;

        const render = (posts: GeoPost[]) => {
            if (!alive) return;
            try { group.clearLayers(); } catch { /* noop */ }
            for (const p of posts) {
                const color = (p.area && AREA_COLORS[p.area]) || POST_COLOR_DEFAULT;
                const marker = L.marker([p.lat, p.lng], {
                    icon: L.divIcon({ className: "ss-divicon", html: pinHtml(color), iconSize: [14, 14], iconAnchor: [7, 7] }),
                    title: p.authorName,
                });
                const img = p.mediaUrl && isImageUrl(p.mediaUrl)
                    ? `<img src="${escapeHtml(p.mediaUrl)}" alt="" class="ss-pop-img"/>`
                    : "";
                const files = p.attachments
                    .slice(0, 4)
                    .map((a) => `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener" class="ss-pop-file">${escapeHtml(a.name)}</a>`)
                    .join("");
                marker.bindPopup(
                    `<div class="ss-pop">
                        <p class="ss-pop-author">${escapeHtml(p.authorName)} <span>· ${escapeHtml(timeAgo(p.createdAt))}</span></p>
                        ${p.excerpt ? `<p class="ss-pop-body">${escapeHtml(p.excerpt)}</p>` : ""}
                        ${img}
                        ${files ? `<div class="ss-pop-files">${files}</div>` : ""}
                        <a class="ss-pop-link" href="${escapeHtml(geoPostHref(p))}">Abrir publicación →</a>
                    </div>`,
                    { maxWidth: 260 },
                );
                try { group.addLayer(marker); } catch { /* noop */ }
            }
            setCounts((c) => ({ ...c, posts: posts.length }));
        };

        void fetchGeoPosts().then(render);

        // Realtime: nuevos os_posts → recarga con debounce (la geo viaja en el
        // body, así que no hay filtro server-side posible; ver map-data.ts).
        let timer: ReturnType<typeof setTimeout> | null = null;
        const unsub = onTableChange("os_posts", { event: "INSERT" }, () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void fetchGeoPosts().then(render), 1200);
        });
        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
            unsub();
        };
    }, [ready, reloadTick]);

    // ── Capa: propuestas territoriales (+ realtime) ──
    useEffect(() => {
        const L = lRef.current;
        const group = groupRefs.current["proposals"];
        if (!ready || !L || !group) return;
        let alive = true;

        const render = (rows: MapZoneProposal[]) => {
            if (!alive) return;
            try { group.clearLayers(); } catch { /* noop */ }
            for (const z of rows) {
                const approved = APPROVED_STATUSES.includes(z.status);
                const color = approved ? ZONE_APPROVED_COLOR : ZONE_OPEN_COLOR;
                try {
                    const circle = L.circle([z.lat, z.lng], {
                        radius: z.radiusM,
                        color,
                        weight: approved ? 2 : 1.5,
                        dashArray: approved ? undefined : "6 6",
                        fillColor: color,
                        fillOpacity: approved ? 0.12 : 0.06,
                    });
                    if (approved) {
                        // Nombre/uso APROBADO por la red → etiqueta de zona visible.
                        circle.bindTooltip(escapeHtml(z.name), {
                            permanent: true,
                            direction: "center",
                            className: "ss-zone-label",
                        });
                    }
                    const kindLabel = ZONE_KINDS.find((k) => k.id === z.zoneKind)?.label ?? z.zoneKind;
                    const estado = approved ? "Aprobada" : z.status === "open" ? "En votación" : escapeHtml(z.status);
                    circle.bindPopup(
                        `<div class="ss-pop">
                            <p class="ss-pop-author">${escapeHtml(z.name)} <span>· ${escapeHtml(kindLabel)}</span></p>
                            <p class="ss-pop-body">${escapeHtml(z.description || "Propuesta territorial de la red.")}</p>
                            <p class="ss-pop-meta">Estado: <b>${estado}</b> · ${escapeHtml(timeAgo(z.createdAt))}</p>
                            <a class="ss-pop-link" href="/decisiones?p=${escapeHtml(z.id)}">Votar / ver decisión →</a>
                            <a class="ss-pop-link" href="/network/politics">Ecosistema político →</a>
                        </div>`,
                        { maxWidth: 280 },
                    );
                    group.addLayer(circle);
                } catch { /* noop */ }
            }
            setCounts((c) => ({ ...c, proposals: rows.length }));
        };

        void fetchMapProposals().then(render);
        let timer: ReturnType<typeof setTimeout> | null = null;
        const unsub = onTableChange("proposals", { filter: `kind=eq.${MAP_PROPOSAL_KIND}` }, () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void fetchMapProposals().then(render), 1000);
        });
        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
            unsub();
        };
    }, [ready, reloadTick]);

    // ── Capa: eventos con ubicación ──
    useEffect(() => {
        const L = lRef.current;
        const group = groupRefs.current["events"];
        if (!ready || !L || !group) return;
        let alive = true;
        void fetchGeoEvents().then((events: GeoEvent[]) => {
            if (!alive) return;
            try { group.clearLayers(); } catch { /* noop */ }
            for (const ev of events) {
                try {
                    const marker = L.marker([ev.lat, ev.lng], {
                        icon: L.divIcon({ className: "ss-divicon", html: pinHtml(EVENT_COLOR, 16), iconSize: [16, 16], iconAnchor: [8, 8] }),
                        title: ev.title,
                    });
                    const when = ev.startsAt
                        ? new Date(ev.startsAt).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })
                        : "Fecha por anunciar";
                    marker.bindPopup(
                        `<div class="ss-pop">
                            <p class="ss-pop-author">${escapeHtml(ev.title)}</p>
                            <p class="ss-pop-meta">${escapeHtml(when)}${ev.location ? ` · ${escapeHtml(ev.location)}` : ""}</p>
                            <a class="ss-pop-link" href="/evento/${escapeHtml(ev.slug)}">Ver evento →</a>
                        </div>`,
                        { maxWidth: 260 },
                    );
                    group.addLayer(marker);
                } catch { /* noop */ }
            }
            setCounts((c) => ({ ...c, events: events.length }));
        });
        return () => { alive = false; };
    }, [ready, reloadTick]);

    // ── Capa: comunidades / páginas / grupos con ubicación ──
    useEffect(() => {
        const L = lRef.current;
        const group = groupRefs.current["places"];
        if (!ready || !L || !group) return;
        let alive = true;
        void fetchGeoPlaces().then((places: GeoPlace[]) => {
            if (!alive) return;
            try { group.clearLayers(); } catch { /* noop */ }
            for (const pl of places) {
                try {
                    const marker = L.marker([pl.lat, pl.lng], {
                        icon: L.divIcon({ className: "ss-divicon", html: pinHtml(PLACE_COLOR, 16), iconSize: [16, 16], iconAnchor: [8, 8] }),
                        title: pl.name,
                    });
                    const href = pl.entity === "group" ? `/grupo/${pl.slug}` : `/pagina/${pl.slug}`;
                    marker.bindPopup(
                        `<div class="ss-pop">
                            <p class="ss-pop-author">${escapeHtml(pl.name)} <span>· ${escapeHtml(pl.kind)}</span></p>
                            <p class="ss-pop-meta">${pl.memberCount} miembros${pl.placeLabel ? ` · ${escapeHtml(pl.placeLabel)}` : ""}</p>
                            <a class="ss-pop-link" href="${href}">Visitar →</a>
                        </div>`,
                        { maxWidth: 260 },
                    );
                    group.addLayer(marker);
                } catch { /* noop */ }
            }
            setCounts((c) => ({ ...c, places: places.length }));
        });
        return () => { alive = false; };
    }, [ready, reloadTick]);

    // ── Presencia: escuchar (+ emitir según permisos) ──
    useEffect(() => {
        if (!ready || !me) return;
        if (!presenceRef.current) {
            presenceRef.current = createMapPresence(
                { userId: me.userId, username: me.username, displayName: me.displayName, avatarUrl: me.avatarUrl },
                (list) => setPeers(list),
            );
        }
        const watch = topicsForWatching(shareCfg, me.userId);
        // Solo se EMITE si el modo lo permite y hay sesión real (nunca anónimos).
        const share = me.anonymous ? [] : topicsForSharing(shareCfg);
        presenceRef.current.setTopics(watch, share);
    }, [ready, me, shareCfg]);

    // ── Marcadores de peers (avatar + "hace X min") ──
    useEffect(() => {
        const L = lRef.current;
        const group = groupRefs.current["peers"];
        if (!ready || !L || !group) return;
        try { group.clearLayers(); } catch { /* noop */ }
        for (const peer of peers) {
            try {
                const avatar = peer.avatarUrl
                    ? `<img src="${escapeHtml(peer.avatarUrl)}" alt=""/>`
                    : `<b>${escapeHtml((peer.displayName || "?").slice(0, 1).toUpperCase())}</b>`;
                const marker = L.marker([peer.lat, peer.lng], {
                    icon: L.divIcon({
                        className: "ss-divicon",
                        html: `<span class="ss-peer">${avatar}</span>`,
                        iconSize: [34, 34],
                        iconAnchor: [17, 17],
                    }),
                    title: peer.displayName,
                    zIndexOffset: 500,
                });
                // Contenido en función: el "hace X min" se calcula al abrir.
                marker.bindPopup(
                    () =>
                        `<div class="ss-pop">
                            <p class="ss-pop-author">${escapeHtml(peer.displayName)} <span>· @${escapeHtml(peer.username)}</span></p>
                            <p class="ss-pop-meta">Ubicación compartida ${escapeHtml(timeAgo(peer.at))}</p>
                            <a class="ss-pop-link" href="/profile/${escapeHtml(peer.username)}">Ver perfil →</a>
                        </div>`,
                    { maxWidth: 240 },
                );
                group.addLayer(marker);
            } catch { /* noop */ }
        }
    }, [ready, peers]);

    // ── GPS: watch cuando comparto o sigo mi posición ──
    const applyMyPosition = useCallback((lat: number, lng: number, accuracy?: number) => {
        const L = lRef.current, map = mapRef.current;
        if (!L || !map) return;
        try {
            if (!myLocRef.current) {
                const marker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: "ss-divicon",
                        html: '<span class="ss-me"><span></span></span>',
                        iconSize: [18, 18],
                        iconAnchor: [9, 9],
                    }),
                    zIndexOffset: 900,
                });
                const circle = L.circle([lat, lng], {
                    radius: accuracy ?? 30,
                    color: "#38bdf8",
                    weight: 1,
                    fillColor: "#38bdf8",
                    fillOpacity: 0.08,
                });
                marker.addTo(map);
                circle.addTo(map);
                myLocRef.current = { marker, circle };
            } else {
                myLocRef.current.marker.setLatLng([lat, lng]);
                myLocRef.current.circle.setLatLng([lat, lng]);
                if (accuracy) myLocRef.current.circle.setRadius(accuracy);
            }
        } catch { /* noop */ }
    }, []);

    useEffect(() => {
        const shouldWatch = following || shareCfg.mode !== "off";
        if (typeof navigator === "undefined" || !navigator.geolocation) return;
        if (!shouldWatch) {
            if (geoWatchRef.current != null) {
                try { navigator.geolocation.clearWatch(geoWatchRef.current); } catch { /* noop */ }
                geoWatchRef.current = null;
            }
            return;
        }
        if (geoWatchRef.current != null) return; // ya vigilando
        try {
            geoWatchRef.current = navigator.geolocation.watchPosition(
                (pos) => {
                    const { latitude, longitude, accuracy } = pos.coords;
                    applyMyPosition(latitude, longitude, accuracy);
                    if (following && mapRef.current) {
                        try { mapRef.current.setView([latitude, longitude]); } catch { /* noop */ }
                    }
                    // Emite con throttle si el modo lo permite (nunca anónimos).
                    if (shareCfg.mode !== "off" && me && !me.anonymous && presenceRef.current) {
                        const now = Date.now();
                        if (now - lastShareSentRef.current >= SHARE_THROTTLE_MS) {
                            lastShareSentRef.current = now;
                            presenceRef.current.updatePosition(latitude, longitude);
                        }
                    }
                },
                () => {
                    toast({
                        title: "Sin acceso al GPS",
                        description: "Concede permiso de ubicación al navegador para usar esta función.",
                        variant: "destructive",
                    });
                    setFollowing(false);
                },
                { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
            );
        } catch { /* noop */ }
        return () => {
            if (geoWatchRef.current != null) {
                try { navigator.geolocation.clearWatch(geoWatchRef.current); } catch { /* noop */ }
                geoWatchRef.current = null;
            }
        };
    }, [following, shareCfg.mode, me, applyMyPosition, toast]);

    // "Mi ubicación": centra y activa seguimiento.
    const locateMe = useCallback(() => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            toast({ title: "GPS no disponible", description: "Este navegador no expone geolocalización.", variant: "destructive" });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                applyMyPosition(latitude, longitude, accuracy);
                try { mapRef.current?.setView([latitude, longitude], Math.max(mapRef.current.getZoom(), 15)); } catch { /* noop */ }
                setFollowing(true);
            },
            () => {
                toast({
                    title: "Sin acceso al GPS",
                    description: "Concede permiso de ubicación al navegador.",
                    variant: "destructive",
                });
            },
            { enableHighAccuracy: true, timeout: 15_000 },
        );
    }, [applyMyPosition, toast]);

    // ── Buscador de lugares (Nominatim, debounce 600 ms — uso educado) ──
    useEffect(() => {
        const term = searchQ.trim();
        if (term.length < 2) {
            setSearchHits([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const t = setTimeout(() => {
            void searchPlaces(term).then((hits) => {
                setSearchHits(hits);
                setSearching(false);
            });
        }, 600);
        return () => clearTimeout(t);
    }, [searchQ]);

    const goToPlace = useCallback((hit: PlaceHit) => {
        const L = lRef.current, map = mapRef.current;
        if (!L || !map) return;
        try {
            map.setView([hit.lat, hit.lng], 14);
            const group = groupRefs.current["search"];
            group?.clearLayers();
            const marker = L.marker([hit.lat, hit.lng], {
                icon: L.divIcon({ className: "ss-divicon", html: pinHtml("#f59e0b", 16), iconSize: [16, 16], iconAnchor: [8, 8] }),
            });
            marker.bindPopup(`<div class="ss-pop"><p class="ss-pop-body">${escapeHtml(hit.label)}</p></div>`);
            group?.addLayer(marker);
        } catch { /* noop */ }
        setSearchHits([]);
        setSearchQ("");
    }, []);

    // ── Crear aquí ──
    const openLienzoAt = useCallback((lat: number, lng: number) => {
        router.push(`/crear?area=lienzo&geo=${lat.toFixed(6)},${lng.toFixed(6)}`);
    }, [router]);

    const publishQuick = useCallback(async () => {
        if (!createAt) return;
        setQuickBusy(true);
        try {
            const res = await createGeoQuickPost({
                text: quickText,
                lat: createAt.lat,
                lng: createAt.lng,
                authorName: me && !me.anonymous ? me.displayName : undefined,
            });
            if (res.needsAuth) {
                toast({ title: "Inicia sesión", description: "Necesitas una cuenta para publicar en la red.", variant: "destructive" });
                return;
            }
            if (res.ok) {
                toast({ title: "Publicado en el mapa", description: "Tu comentario geolocalizado ya es visible en la capa Publicaciones." });
                setQuickText("");
                setCreateAt(null);
                setReloadTick((t) => t + 1);
            } else {
                toast({ title: "Error al publicar", description: res.error || "Inténtalo de nuevo.", variant: "destructive" });
            }
        } finally {
            setQuickBusy(false);
        }
    }, [createAt, quickText, me, toast]);

    // Previsualización del círculo de la propuesta mientras el diálogo está abierto.
    useEffect(() => {
        const L = lRef.current, map = mapRef.current;
        if (!L || !map) return;
        if (propOpen && propLatLng) {
            try {
                if (!previewCircleRef.current) {
                    previewCircleRef.current = L.circle([propLatLng.lat, propLatLng.lng], {
                        radius: propRadius,
                        color: ZONE_OPEN_COLOR,
                        dashArray: "4 6",
                        weight: 2,
                        fillColor: ZONE_OPEN_COLOR,
                        fillOpacity: 0.08,
                    }).addTo(map);
                } else {
                    previewCircleRef.current.setLatLng([propLatLng.lat, propLatLng.lng]);
                    previewCircleRef.current.setRadius(propRadius);
                }
            } catch { /* noop */ }
        } else if (previewCircleRef.current) {
            try { map.removeLayer(previewCircleRef.current); } catch { /* noop */ }
            previewCircleRef.current = null;
        }
    }, [propOpen, propLatLng, propRadius]);

    const submitProposal = useCallback(async () => {
        if (!propLatLng || !propName.trim()) {
            toast({ title: "Falta el nombre", description: "Dale un nombre a la zona o uso propuesto.", variant: "destructive" });
            return;
        }
        setPropBusy(true);
        try {
            const res = await createZoneProposal({
                name: propName,
                zoneKind: propKind,
                description: propDesc,
                lat: propLatLng.lat,
                lng: propLatLng.lng,
                radiusM: propRadius,
            });
            if (res.ok) {
                toast({
                    title: "Propuesta lanzada a votación",
                    description: "La red decidirá democráticamente. Síguela en /network/politics o /decisiones.",
                });
                setPropOpen(false);
                setPropName("");
                setPropDesc("");
                setReloadTick((t) => t + 1);
            } else {
                toast({ title: "No se pudo crear", description: res.error || "Inicia sesión e inténtalo de nuevo.", variant: "destructive" });
            }
        } finally {
            setPropBusy(false);
        }
    }, [propLatLng, propName, propKind, propDesc, propRadius, toast]);

    // ── Panel compartir: búsquedas (debounce corto sobre os_profiles/os_groups) ──
    useEffect(() => {
        const term = userQ.trim();
        if (term.length < 2) { setUserHits([]); return; }
        const t = setTimeout(() => { void searchUsers(term, 6).then(setUserHits); }, 400);
        return () => clearTimeout(t);
    }, [userQ]);

    useEffect(() => {
        const term = groupQ.trim();
        if (term.length < 2) { setGroupHits([]); return; }
        const t = setTimeout(() => { void searchGroups(term, 6).then(setGroupHits); }, 400);
        return () => clearTimeout(t);
    }, [groupQ]);

    const updateShareCfg = useCallback((patch: Partial<LocationShareConfig>) => {
        setShareCfg((prev) => {
            const next = { ...prev, ...patch };
            saveShareConfig(next);
            return next;
        });
    }, []);

    const setMode = useCallback((mode: LocationShareMode) => {
        if (mode !== "off" && me?.anonymous) {
            toast({ title: "Inicia sesión", description: "Para compartir tu ubicación necesitas tu cuenta soberana.", variant: "destructive" });
            return;
        }
        updateShareCfg({ mode });
        if (mode !== "off") {
            toast({
                title: "Compartiendo ubicación",
                description: mode === "red" ? "Visible para toda la red mientras el mapa esté abierto." : "Visible solo para tu selección mientras el mapa esté abierto.",
            });
        }
    }, [me, toast, updateShareCfg]);

    const zoomBy = useCallback((delta: number) => {
        try { mapRef.current?.setZoom(mapRef.current.getZoom() + delta); } catch { /* noop */ }
    }, []);

    // Cierra el popover "Crear aquí" si el mapa se mueve.
    useEffect(() => {
        const map = mapRef.current;
        if (!ready || !map) return;
        const close = () => setCreateAt(null);
        map.on("movestart", close);
        map.on("zoomstart", close);
        return () => {
            try { map.off("movestart", close); map.off("zoomstart", close); } catch { /* noop */ }
        };
    }, [ready]);

    const rainFrameLabel = useMemo(() => {
        if (!rain) return "";
        const f = rain.frames[Math.min(rainIdx, rain.frames.length - 1)];
        if (!f) return "";
        return new Date(f.time * 1000).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    }, [rain, rainIdx]);

    const glassPanel = "rounded-2xl border border-white/10 bg-black/55 backdrop-blur-xl shadow-2xl";
    const glassBtn = "h-10 w-10 rounded-xl border border-white/10 bg-black/50 backdrop-blur-xl text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer flex items-center justify-center";

    return (
        <div className={cn("ss-map relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black/40", className)}>
            {/* Lienzo del mapa */}
            <div ref={containerRef} className="absolute inset-0 z-0" />

            {loadError && (
                <div className="absolute inset-0 z-20 flex items-center justify-center p-6 text-center">
                    <div className={cn(glassPanel, "max-w-sm p-6 space-y-2")}>
                        <MapPin className="mx-auto h-6 w-6 text-red-300" />
                        <p className="text-sm text-white/80">{loadError}</p>
                        <p className="text-xs text-white/40">El mapa carga Leaflet desde CDN: revisa tu conexión y recarga.</p>
                    </div>
                </div>
            )}

            {!ready && !loadError && (
                <div className="absolute inset-0 z-20 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-sm text-white/60">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" /> Cargando mapa soberano…
                    </div>
                </div>
            )}

            {/* ── Buscador de lugares (Nominatim) ── */}
            <div className="absolute left-3 top-3 z-10 w-[min(320px,calc(100%-6.5rem))]">
                <div className={cn(glassPanel, "relative")}>
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <Input
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                        placeholder="Buscar lugar (OpenStreetMap)…"
                        className="h-11 border-0 bg-transparent pl-9 pr-8 text-sm focus-visible:ring-1 focus-visible:ring-primary/40"
                    />
                    {searching ? (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/40" />
                    ) : searchQ ? (
                        <button
                            type="button"
                            onClick={() => setSearchQ("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-white/40 hover:text-white"
                            title="Limpiar"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    ) : null}
                </div>
                {searchHits.length > 0 && (
                    <div className={cn(glassPanel, "mt-2 max-h-64 overflow-y-auto p-1.5")}>
                        {searchHits.map((h, i) => (
                            <button
                                key={`${h.lat}-${h.lng}-${i}`}
                                type="button"
                                onClick={() => goToPlace(h)}
                                className="flex w-full cursor-pointer items-start gap-2 rounded-xl px-2.5 py-2 text-left text-xs text-white/75 transition-colors hover:bg-white/10"
                            >
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                                <span className="line-clamp-2">{h.label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Botón de capas (panel) ── */}
            <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
                <button type="button" onClick={() => { setLayersOpen((v) => !v); setShareOpen(false); }} className={cn(glassBtn, layersOpen && "text-primary border-primary/40")} title="Capas y clima">
                    <Layers className="h-[18px] w-[18px]" />
                </button>
                <button type="button" onClick={() => { setShareOpen((v) => !v); setLayersOpen(false); }} className={cn(glassBtn, shareCfg.mode !== "off" ? "text-emerald-300 border-emerald-400/40" : shareOpen && "text-primary border-primary/40")} title="Compartir mi ubicación">
                    <Share2 className="h-[18px] w-[18px]" />
                </button>

                {/* Panel de capas */}
                {layersOpen && (
                    <div className={cn(glassPanel, "w-[min(320px,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto p-4 space-y-4")}>
                        <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">Capa base</p>
                            <div className="grid grid-cols-2 gap-2">
                                {BASE_LAYERS.map((b) => (
                                    <button
                                        key={b.id}
                                        type="button"
                                        onClick={() => setBaseId(b.id)}
                                        className={cn(
                                            "group cursor-pointer overflow-hidden rounded-xl border text-left transition-all",
                                            baseId === b.id ? "border-primary/60 shadow-[0_0_14px_hsl(var(--primary-hsl)/0.25)]" : "border-white/10 hover:border-white/25",
                                        )}
                                        title={b.desc}
                                    >
                                        {/* Miniatura: una tesela real de la fuente */}
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={previewTileUrl(b)} alt={b.label} className="h-14 w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                                        <span className={cn("block px-2 py-1 text-[11px] font-medium", baseId === b.id ? "text-primary" : "text-white/70")}>{b.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Clima real (multi-fuente)</p>

                            {/* RainViewer */}
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-white/80">Radar de lluvia · RainViewer</span>
                                    <Switch
                                        checked={overlaysOn.includes("rainviewer")}
                                        onCheckedChange={(on) =>
                                            setOverlaysOn((prev) => on ? Array.from(new Set([...prev, "rainviewer"])) : prev.filter((o) => o !== "rainviewer"))
                                        }
                                    />
                                </div>
                                {overlaysOn.includes("rainviewer") && (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-white/40 w-14">Opacidad</span>
                                            <Slider
                                                value={[Math.round((overlayOpacity["rainviewer"] ?? 0.7) * 100)]}
                                                min={10} max={100} step={5}
                                                onValueChange={(v) => setOverlayOpacity((p) => ({ ...p, rainviewer: (v[0] ?? 70) / 100 }))}
                                                className="flex-1"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setRainPlaying((v) => !v)}
                                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] text-white/75 hover:bg-white/10"
                                            >
                                                {rainPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                                                {rainPlaying ? "Pausar" : "Animar"}
                                            </button>
                                            {rain && (
                                                <Slider
                                                    value={[Math.min(rainIdx, rain.frames.length - 1)]}
                                                    min={0} max={Math.max(0, rain.frames.length - 1)} step={1}
                                                    onValueChange={(v) => { setRainPlaying(false); setRainIdx(v[0] ?? 0); }}
                                                    className="flex-1"
                                                />
                                            )}
                                            <span className="w-12 text-right text-[10px] tabular-nums text-white/50">{rainLoading ? "…" : rainFrameLabel}</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* NASA GIBS */}
                            {GIBS_LAYERS.map((g) => (
                                <div key={g.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs text-white/80" title={g.desc}>{g.label}</span>
                                        <Switch
                                            checked={overlaysOn.includes(g.id)}
                                            onCheckedChange={(on) =>
                                                setOverlaysOn((prev) => on ? Array.from(new Set([...prev, g.id])) : prev.filter((o) => o !== g.id))
                                            }
                                        />
                                    </div>
                                    {overlaysOn.includes(g.id) && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-white/40 w-14">Opacidad</span>
                                            <Slider
                                                value={[Math.round((overlayOpacity[g.id] ?? 0.75) * 100)]}
                                                min={10} max={100} step={5}
                                                onValueChange={(v) => setOverlayOpacity((p) => ({ ...p, [g.id]: (v[0] ?? 75) / 100 }))}
                                                className="flex-1"
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                            <p className="text-[10px] text-white/35">Imágenes NASA del {gibsDate()} (día anterior, sin clave).</p>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Capas de la red</p>
                                <button
                                    type="button"
                                    onClick={() => setReloadTick((t) => t + 1)}
                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] text-white/45 hover:text-white"
                                    title="Recargar datos"
                                >
                                    <RefreshCw className="h-3 w-3" /> Recargar
                                </button>
                            </div>
                            {([
                                { id: "posts", label: "Publicaciones", icon: MessageSquarePlus },
                                { id: "proposals", label: "Propuestas de zona", icon: Vote },
                                { id: "events", label: "Eventos", icon: CalendarDays },
                                { id: "places", label: "Comunidades y páginas", icon: Landmark },
                                { id: "peers", label: "Personas (en vivo)", icon: Users },
                            ] as Array<{ id: string; label: string; icon: typeof Users }>).map((d) => {
                                const Icon = d.icon;
                                const n = d.id === "peers" ? peers.length : counts[d.id];
                                return (
                                    <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                                        <span className="flex items-center gap-2 text-xs text-white/80">
                                            <Icon className="h-3.5 w-3.5 text-white/45" />
                                            {d.label}
                                            <span className="text-[10px] text-white/35 tabular-nums">{n == null ? "" : `· ${n}`}</span>
                                        </span>
                                        <Switch
                                            checked={dataLayers[d.id] !== false}
                                            onCheckedChange={(on) => setDataLayers((p) => ({ ...p, [d.id]: on }))}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Panel compartir ubicación */}
                {shareOpen && (
                    <div className={cn(glassPanel, "w-[min(340px,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto p-4 space-y-3")}>
                        <p className="text-xs font-semibold text-white/85 flex items-center gap-2">
                            <Share2 className="h-3.5 w-3.5 text-emerald-300" /> Compartir mi ubicación
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                            {([
                                { id: "off", label: "No compartir" },
                                { id: "red", label: "Toda la red" },
                                { id: "custom", label: "Selección" },
                            ] as Array<{ id: LocationShareMode; label: string }>).map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setMode(m.id)}
                                    className={cn(
                                        "cursor-pointer rounded-xl border px-2 py-2 text-[11px] font-medium transition-colors",
                                        shareCfg.mode === m.id
                                            ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                                            : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.08]",
                                    )}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>

                        {shareCfg.mode === "custom" && (
                            <div className="space-y-3">
                                {/* Usuarios */}
                                <div className="space-y-1.5">
                                    <p className="text-[10px] uppercase tracking-wider text-white/40">Usuarios (os_profiles)</p>
                                    <Input
                                        value={userQ}
                                        onChange={(e) => setUserQ(e.target.value)}
                                        placeholder="Buscar por @usuario o nombre…"
                                        className="h-9 bg-black/30 border-white/10 text-xs"
                                    />
                                    {userHits.length > 0 && (
                                        <div className="space-y-1">
                                            {userHits.map((u) => (
                                                <button
                                                    key={u.userId}
                                                    type="button"
                                                    onClick={() => {
                                                        if (!shareCfg.users.some((x) => x.userId === u.userId)) {
                                                            updateShareCfg({ users: [...shareCfg.users, { userId: u.userId, username: u.username, displayName: u.displayName }] });
                                                        }
                                                        setUserQ("");
                                                        setUserHits([]);
                                                    }}
                                                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/10"
                                                >
                                                    <Users className="h-3 w-3 text-white/40" /> {u.displayName} <span className="text-white/35">@{u.username}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-1.5">
                                        {shareCfg.users.map((u) => (
                                            <span key={u.userId} className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                                                @{u.username}
                                                <button type="button" className="cursor-pointer hover:text-white" onClick={() => updateShareCfg({ users: shareCfg.users.filter((x) => x.userId !== u.userId) })}>
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                        {shareCfg.users.length === 0 && <span className="text-[10px] text-white/30">Nadie seleccionado aún.</span>}
                                    </div>
                                </div>

                                {/* Grupos */}
                                <div className="space-y-1.5">
                                    <p className="text-[10px] uppercase tracking-wider text-white/40">Grupos / comunidades (por slug)</p>
                                    <Input
                                        value={groupQ}
                                        onChange={(e) => setGroupQ(e.target.value)}
                                        placeholder="Buscar grupo o comunidad…"
                                        className="h-9 bg-black/30 border-white/10 text-xs"
                                    />
                                    {groupHits.length > 0 && (
                                        <div className="space-y-1">
                                            {groupHits.map((g) => (
                                                <button
                                                    key={`${g.kind}:${g.slug}`}
                                                    type="button"
                                                    onClick={() => {
                                                        if (!shareCfg.groups.includes(g.slug)) {
                                                            updateShareCfg({ groups: [...shareCfg.groups, g.slug] });
                                                        }
                                                        setGroupQ("");
                                                        setGroupHits([]);
                                                    }}
                                                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/10"
                                                >
                                                    <Landmark className="h-3 w-3 text-white/40" /> {g.name} <span className="text-white/35">·{g.slug}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-1.5">
                                        {shareCfg.groups.map((slug) => (
                                            <span key={slug} className="inline-flex items-center gap-1 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-200">
                                                {slug}
                                                <button type="button" className="cursor-pointer hover:text-white" onClick={() => updateShareCfg({ groups: shareCfg.groups.filter((s) => s !== slug) })}>
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                        {shareCfg.groups.length === 0 && <span className="text-[10px] text-white/30">Ningún grupo aún.</span>}
                                    </div>
                                </div>
                            </div>
                        )}

                        <p className="text-[10px] leading-relaxed text-white/35">
                            Tu posición solo se emite mientras este mapa está abierto y el modo lo
                            permite (canales realtime map:red / map:g:&lt;slug&gt; / map:u:&lt;id&gt;).
                            MVP honesto: la privacidad de canal es cooperativa, aún sin ACL
                            criptográfica por canal. Nada se guarda en servidores: es presencia
                            efímera.
                        </p>
                    </div>
                )}
            </div>

            {/* ── Controles inferiores derechos ── */}
            <div className="absolute bottom-8 right-3 z-10 flex flex-col gap-2">
                <button type="button" onClick={() => zoomBy(1)} className={glassBtn} title="Acercar"><Plus className="h-[18px] w-[18px]" /></button>
                <button type="button" onClick={() => zoomBy(-1)} className={glassBtn} title="Alejar"><Minus className="h-[18px] w-[18px]" /></button>
                <button
                    type="button"
                    onClick={() => (following ? setFollowing(false) : locateMe())}
                    className={cn(glassBtn, following && "text-sky-300 border-sky-400/40")}
                    title={following ? "Dejar de seguir mi posición" : "Mi ubicación"}
                >
                    {following ? <Navigation className="h-[18px] w-[18px]" /> : <LocateFixed className="h-[18px] w-[18px]" />}
                </button>
            </div>

            {/* ── Chip de estado del radar ── */}
            {overlaysOn.includes("rainviewer") && rain && (
                <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
                    <div className={cn(glassPanel, "flex items-center gap-2 px-3 py-1.5 text-[11px] text-white/70")}>
                        <span className="inline-block h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
                        Radar {rainFrameLabel}
                        <button type="button" onClick={() => setRainPlaying((v) => !v)} className="cursor-pointer text-white/50 hover:text-white">
                            {rainPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Crédito soberano (además de la atribución obligatoria de Leaflet) ── */}
            <div className="absolute bottom-8 left-3 z-10 hidden sm:block">
                <a
                    href={ORGANIC_MAPS_REPO}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(glassPanel, "flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-white/55 hover:text-white/85 transition-colors")}
                    title="Datos © OpenStreetMap · inspirado en Organic Maps"
                >
                    <Sparkles className="h-3 w-3 text-emerald-300" />
                    Datos © OpenStreetMap · inspirado en Organic Maps
                    <ExternalLink className="h-3 w-3" />
                </a>
            </div>

            {/* ── Popover "Crear aquí" (click largo / derecho) ── */}
            {createAt && (
                <div
                    className={cn(glassPanel, "absolute z-20 w-64 p-2")}
                    style={{
                        left: Math.min(Math.max(createAt.x, 8), (containerRef.current?.clientWidth ?? 320) - 264),
                        top: Math.min(Math.max(createAt.y, 8), (containerRef.current?.clientHeight ?? 320) - 200),
                    }}
                >
                    <div className="flex items-center justify-between px-1.5 pb-1.5">
                        <p className="text-[11px] font-semibold text-white/80">
                            Crear aquí
                            <span className="ml-1.5 font-normal text-white/35 tabular-nums">
                                {createAt.lat.toFixed(4)}, {createAt.lng.toFixed(4)}
                            </span>
                        </p>
                        <button type="button" onClick={() => setCreateAt(null)} className="cursor-pointer text-white/40 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                    </div>

                    {createAt.mode === "menu" ? (
                        <div className="space-y-1">
                            <button
                                type="button"
                                onClick={() => openLienzoAt(createAt.lat, createAt.lng)}
                                className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs text-white/80 transition-colors hover:bg-emerald-500/15 hover:text-emerald-200"
                            >
                                <Sparkles className="h-4 w-4 text-emerald-300" />
                                Publicación con Lienzo Universal
                            </button>
                            <button
                                type="button"
                                onClick={() => setCreateAt({ ...createAt, mode: "comentario" })}
                                className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs text-white/80 transition-colors hover:bg-sky-500/15 hover:text-sky-200"
                            >
                                <MessageSquarePlus className="h-4 w-4 text-sky-300" />
                                Comentario rápido
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setPropLatLng({ lat: createAt.lat, lng: createAt.lng });
                                    setPropOpen(true);
                                    setCreateAt(null);
                                }}
                                className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs text-white/80 transition-colors hover:bg-amber-500/15 hover:text-amber-200"
                            >
                                <Vote className="h-4 w-4 text-amber-300" />
                                Proponer nombre/uso de zona
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2 p-1">
                            <Textarea
                                value={quickText}
                                onChange={(e) => setQuickText(e.target.value)}
                                placeholder="¿Qué pasa en este lugar?"
                                rows={3}
                                className="bg-black/30 border-white/10 text-xs"
                                autoFocus
                            />
                            <div className="flex justify-end gap-1.5">
                                <Button size="sm" variant="ghost" className="h-8 cursor-pointer text-xs text-white/60" onClick={() => setCreateAt({ ...createAt, mode: "menu" })}>
                                    Atrás
                                </Button>
                                <Button size="sm" disabled={quickBusy || !quickText.trim()} onClick={() => void publishQuick()} className="h-8 cursor-pointer gap-1.5 bg-sky-500/20 border border-sky-400/40 text-sky-100 hover:bg-sky-500/30 text-xs">
                                    {quickBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquarePlus className="h-3 w-3" />}
                                    Publicar
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Diálogo: propuesta democrática de zona ── */}
            <Dialog open={propOpen} onOpenChange={(o) => setPropOpen(o)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Vote className="h-4 w-4 text-amber-300" /> Proponer nombre / uso de zona
                        </DialogTitle>
                        <DialogDescription>
                            La red decidirá por votación (Ontocracia). Si se aprueba, el nombre o uso
                            se pinta como etiqueta de zona en el mapa para toda la red.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="grid gap-1.5">
                            <label className="text-xs text-white/60">Nombre propuesto</label>
                            <Input value={propName} onChange={(e) => setPropName(e.target.value)} placeholder="P. ej. Plaza de la Abundancia" className="bg-black/30 border-white/10" />
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-xs text-white/60">Tipo</label>
                            <div className="grid grid-cols-2 gap-1.5">
                                {ZONE_KINDS.map((k) => (
                                    <button
                                        key={k.id}
                                        type="button"
                                        onClick={() => setPropKind(k.id)}
                                        className={cn(
                                            "cursor-pointer rounded-xl border px-2 py-1.5 text-xs transition-colors",
                                            propKind === k.id
                                                ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                                                : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.08]",
                                        )}
                                    >
                                        {k.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-xs text-white/60">Descripción / justificación</label>
                            <Textarea value={propDesc} onChange={(e) => setPropDesc(e.target.value)} rows={3} placeholder="Por qué este nombre o uso beneficia al procomún…" className="bg-black/30 border-white/10 text-sm" />
                        </div>
                        <div className="grid gap-1.5">
                            <label className="flex items-center justify-between text-xs text-white/60">
                                Radio de la zona <span className="tabular-nums text-white/45">{propRadius} m</span>
                            </label>
                            <Slider value={[propRadius]} min={50} max={5000} step={50} onValueChange={(v) => setPropRadius(v[0] ?? 250)} />
                            <p className="text-[10px] text-white/35">
                                El círculo se previsualiza en el mapa (MVP: zona circular; polígonos libres, pendiente).
                            </p>
                        </div>
                        {propLatLng && (
                            <p className="text-[10px] text-white/35 tabular-nums">
                                Centro: {propLatLng.lat.toFixed(5)}, {propLatLng.lng.toFixed(5)}
                            </p>
                        )}
                        <Button
                            disabled={propBusy || !propName.trim()}
                            onClick={() => void submitProposal()}
                            className="w-full cursor-pointer gap-2 bg-amber-500/20 border border-amber-400/40 text-amber-100 hover:bg-amber-500/30"
                        >
                            {propBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Vote className="h-4 w-4" />}
                            Lanzar a votación
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Estilos del mapa (popups oscuros, pines, etiqueta de zona, "yo") */}
            <style>{`
                .ss-map .leaflet-container { background: #0b1020; font-family: inherit; }
                .ss-map .leaflet-popup-content-wrapper, .ss-map .leaflet-popup-tip {
                    background: rgba(10, 14, 26, 0.94); color: #e5e7eb;
                    border: 1px solid rgba(255,255,255,0.12);
                    backdrop-filter: blur(14px); border-radius: 14px;
                    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
                }
                .ss-map .leaflet-popup-content { margin: 10px 12px; }
                .ss-map a.leaflet-popup-close-button { color: rgba(255,255,255,0.45); }
                .ss-map .leaflet-control-attribution {
                    background: rgba(8, 10, 20, 0.72); color: rgba(255,255,255,0.55);
                    backdrop-filter: blur(8px); font-size: 10px;
                }
                .ss-map .leaflet-control-attribution a { color: rgba(147, 197, 253, 0.85); }
                .ss-pin {
                    display: block; border-radius: 9999px; background: var(--c);
                    border: 2px solid rgba(255,255,255,0.85);
                    box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 30%, transparent), 0 2px 8px rgba(0,0,0,0.6);
                }
                .ss-peer {
                    display: flex; align-items: center; justify-content: center;
                    width: 34px; height: 34px; border-radius: 9999px; overflow: hidden;
                    background: rgba(16, 24, 40, 0.9); color: #a7f3d0;
                    border: 2px solid rgba(52, 211, 153, 0.9);
                    box-shadow: 0 0 14px rgba(52, 211, 153, 0.45);
                    font-size: 13px;
                }
                .ss-peer img { width: 100%; height: 100%; object-fit: cover; }
                .ss-me { position: relative; display: block; width: 18px; height: 18px; }
                .ss-me > span {
                    position: absolute; inset: 0; border-radius: 9999px;
                    background: #38bdf8; border: 3px solid rgba(255,255,255,0.9);
                    box-shadow: 0 0 0 6px rgba(56, 189, 248, 0.25);
                    animation: ss-me-pulse 2.2s ease-out infinite;
                }
                @keyframes ss-me-pulse {
                    0% { box-shadow: 0 0 0 0 rgba(56,189,248,0.45); }
                    70% { box-shadow: 0 0 0 14px rgba(56,189,248,0); }
                    100% { box-shadow: 0 0 0 0 rgba(56,189,248,0); }
                }
                .ss-zone-label {
                    background: rgba(6, 78, 59, 0.85); color: #d1fae5;
                    border: 1px solid rgba(52, 211, 153, 0.5); border-radius: 9999px;
                    padding: 2px 10px; font-size: 11px; font-weight: 600;
                    box-shadow: 0 4px 14px rgba(0,0,0,0.4); backdrop-filter: blur(6px);
                }
                .ss-zone-label::before { display: none; }
                .ss-pop { display: flex; flex-direction: column; gap: 6px; max-width: 240px; }
                .ss-pop-author { font-weight: 600; font-size: 12px; color: #f3f4f6; margin: 0; }
                .ss-pop-author span { font-weight: 400; color: rgba(255,255,255,0.4); }
                .ss-pop-body { font-size: 12px; color: rgba(255,255,255,0.75); margin: 0; white-space: pre-wrap; }
                .ss-pop-meta { font-size: 11px; color: rgba(255,255,255,0.45); margin: 0; }
                .ss-pop-img { width: 100%; max-height: 110px; object-fit: cover; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); }
                .ss-pop-files { display: flex; flex-wrap: wrap; gap: 4px; }
                .ss-pop-file {
                    font-size: 10px; color: #99f6e4 !important; border: 1px solid rgba(45, 212, 191, 0.3);
                    background: rgba(45, 212, 191, 0.08); border-radius: 9999px; padding: 1px 8px;
                    max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }
                .ss-pop-link { font-size: 11px; font-weight: 600; color: #7dd3fc !important; }
            `}</style>
        </div>
    );
}
