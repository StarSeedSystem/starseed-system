'use client';

// ════════════════════════════════════════════════════════════════
// MapWidget — Mapa real e interactivo (OpenStreetMap + Leaflet CDN)
// ----------------------------------------------------------------
// Carga Leaflet 1.9.4 dinámicamente desde unpkg (CSS + JS) en el
// cliente, sin añadir dependencias al bundle. Renderiza un mapa con
// tiles OSM estándar, centrado en la ubicación del usuario
// (useWeatherLocation), con marcador propio + entidades StarSeed de
// ejemplo cercanas. Controles de zoom y botón "mi ubicación".
// SSR-safe (typeof window) y robusto fuera del WeatherLocationProvider.
//
// Mejoras v2:
//   · Capas de marcadores por tipo: Eventos / Comunidades / E.F.
//   · Toggle chips para mostrar/ocultar capas (con badges de conteo)
//   · Panel lateral glass con lista de puntos cercanos + enlaces
//   · Leyenda visual por capa
//   · Accent colors por sistema (Crimson/Azure/Lime/Amber)
// ════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
    MapPin,
    LocateFixed,
    Loader2,
    Calendar,
    Users,
    Building2,
    ChevronRight,
    X,
    Layers,
    type LucideIcon,
} from "lucide-react";
import { WidgetShell } from "../kit";
import {
    useWeatherLocation,
    type LocationData,
} from "@/modules/weather/context/weather-location-context";
import { sampleEntitiesAround, type GeoEntity } from "@/lib/geo";
import { sampleEvents } from "@/data/sample-events";
import { fetchEvents, fetchGroups, fetchPages } from "@/lib/os-social";

// ── Accent palette ─────────────────────────────────────────────
const ACCENT_USER    = "#10b981"; // Emerald — marcador de usuario
const ACCENT_EVENT_P = "#DC143C"; // Crimson  — eventos políticos
const ACCENT_EVENT_E = "#007FFF"; // Azure    — eventos educativos
const ACCENT_EVENT_C = "#39FF14"; // Lime     — eventos culturales
const ACCENT_COMUNIDAD = "#FFBF00"; // Amber  — Comunidades / Sanghas
const ACCENT_EF        = "#a855f7"; // Purple — Entidades Federativas

const FALLBACK_LOCATION: LocationData = {
    lat: 18.9226,
    lon: -99.2347,
    name: "Cuernavaca, Morelos",
};

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS  = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// ── Layer ids ──────────────────────────────────────────────────
type LayerId = "eventos" | "comunidades" | "ef";

interface LayerDef {
    id: LayerId;
    label: string;
    accent: string;
    icon: LucideIcon;
}

const LAYERS: LayerDef[] = [
    { id: "eventos",     label: "Eventos",     accent: ACCENT_EVENT_P, icon: Calendar   },
    { id: "comunidades", label: "Comunidades", accent: ACCENT_COMUNIDAD, icon: Users     },
    { id: "ef",          label: "E.F.",         accent: ACCENT_EF,       icon: Building2 },
];

// ── GeoPoint types for overlay list ───────────────────────────
interface MapPoint {
    id: string;
    layer: LayerId;
    label: string;
    sublabel: string;
    accent: string;
    href: string;
    lat: number;
    lon: number;
}

// ── Helper: accent for event system ───────────────────────────
function eventAccent(system: string): string {
    if (system === "politico")  return ACCENT_EVENT_P;
    if (system === "educativo") return ACCENT_EVENT_E;
    if (system === "cultural")  return ACCENT_EVENT_C;
    return ACCENT_EVENT_P;
}

function useSafeLocation(): LocationData {
    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        return useWeatherLocation().location ?? FALLBACK_LOCATION;
    } catch {
        return FALLBACK_LOCATION;
    }
}

function ensureLeafletCss() {
    if (typeof document === "undefined") return;
    if (document.querySelector(`link[href="${LEAFLET_CSS}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    link.crossOrigin = "";
    document.head.appendChild(link);
}

function loadLeaflet(): Promise<any> {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") { reject(new Error("no-window")); return; }
        const w = window as any;
        if (w.L) { resolve(w.L); return; }
        const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
        if (existing) {
            existing.addEventListener("load",  () => resolve((window as any).L));
            existing.addEventListener("error", () => reject(new Error("leaflet-load-error")));
            if ((window as any).L) resolve((window as any).L);
            return;
        }
        const script = document.createElement("script");
        script.src = LEAFLET_JS;
        script.crossOrigin = "";
        script.async = true;
        script.onload  = () => resolve((window as any).L);
        script.onerror = () => reject(new Error("leaflet-load-error"));
        document.head.appendChild(script);
    });
}

/** Crea un icono SVG circular para Leaflet con el color dado. */
function makeCircleIcon(L: any, color: string, size = 18) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${color}" fill-opacity="0.85" stroke="white" stroke-width="1.5"/>
    </svg>`;
    return L.divIcon({
        html: svg,
        className: "",
        iconSize:   [size, size],
        iconAnchor: [size/2, size/2],
        popupAnchor:[0, -(size/2 + 4)],
    });
}

/** Crea el icono del usuario (estrella verde). */
function makeUserIcon(L: any) {
    const size = 22;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${ACCENT_USER}" fill-opacity="0.95" stroke="white" stroke-width="2"/>
      <circle cx="${size/2}" cy="${size/2}" r="4" fill="white" fill-opacity="0.9"/>
    </svg>`;
    return L.divIcon({
        html: svg,
        className: "",
        iconSize:   [size, size],
        iconAnchor: [size/2, size/2],
        popupAnchor:[0, -(size/2 + 4)],
    });
}

// ── Distributed geo offsets for demo points ───────────────────
function offsetAround(
    center: { lat: number; lon: number },
    index: number,
    total: number,
    radiusKm: number,
): { lat: number; lon: number } {
    const angle = (index / total) * 2 * Math.PI;
    const r = radiusKm * (0.3 + 0.55 * ((index % 3) / 2));
    const latPerKm = 1 / 111;
    const lonPerKm = 1 / (111 * (Math.cos((center.lat * Math.PI) / 180) || 1));
    return {
        lat: center.lat + Math.sin(angle) * r * latPerKm,
        lon: center.lon + Math.cos(angle) * r * lonPerKm,
    };
}

/** ¿Tiene la entidad coordenadas geográficas válidas? */
function hasGeo(e: { lat?: number | null; lng?: number | null }): boolean {
    return (
        typeof e.lat === "number" &&
        typeof e.lng === "number" &&
        Number.isFinite(e.lat) &&
        Number.isFinite(e.lng)
    );
}

/**
 * Carga las entidades REALES geolocalizadas (eventos, grupos, páginas) desde
 * Supabase y las convierte en `MapPoint`. DEFENSIVO: nunca lanza; si no hay red,
 * columnas geo o sesión, devuelve []. Solo incluye entidades con lat/lng reales
 * — no inventa coordenadas (no fake data).
 */
async function fetchRealGeoPoints(): Promise<MapPoint[]> {
    const points: MapPoint[] = [];
    try {
        const [events, groups, pages] = await Promise.all([
            fetchEvents().catch(() => []),
            fetchGroups().catch(() => []),
            fetchPages().catch(() => []),
        ]);

        for (const ev of events) {
            if (!hasGeo(ev)) continue;
            points.push({
                id: `real-ev-${ev.id}`,
                layer: "eventos",
                label: ev.title,
                sublabel: ev.placeLabel || ev.location || "Evento",
                accent: ACCENT_EVENT_C,
                href: `/evento/${ev.slug}`,
                lat: ev.lat as number,
                lon: ev.lng as number,
            });
        }

        for (const g of groups) {
            if (!hasGeo(g)) continue;
            points.push({
                id: `real-grp-${g.id}`,
                layer: "comunidades",
                label: g.name,
                sublabel: g.placeLabel || "Grupo",
                accent: ACCENT_COMUNIDAD,
                href: `/grupo/${g.slug}`,
                lat: g.lat as number,
                lon: g.lng as number,
            });
        }

        for (const p of pages) {
            if (!hasGeo(p)) continue;
            // Las páginas de tipo comunidad son Sanghas → capa comunidades;
            // el resto se muestran también como comunidades (nodos de la red).
            points.push({
                id: `real-pg-${p.id}`,
                layer: "comunidades",
                label: p.name,
                sublabel: p.placeLabel || (p.kind === "comunidad" ? "Comunidad" : "Página"),
                accent: ACCENT_COMUNIDAD,
                href: `/pagina/${p.slug}`,
                lat: p.lat as number,
                lon: p.lng as number,
            });
        }
    } catch {
        /* degradación silenciosa: sin puntos reales */
    }
    return points;
}

export function MapWidget() {
    const location = useSafeLocation();
    const containerRef  = useRef<HTMLDivElement | null>(null);
    const mapRef        = useRef<any>(null);
    const userMarkerRef = useRef<any>(null);
    // Layer group refs
    const layerGroupsRef = useRef<Record<LayerId, any>>({
        eventos:     null,
        comunidades: null,
        ef:          null,
    });

    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [activeLayers, setActiveLayers] = useState<Set<LayerId>>(
        new Set(["eventos", "comunidades", "ef"]),
    );
    const [showPanel, setShowPanel] = useState(false);
    const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
    // Puntos REALES geolocalizados (Supabase). Aditivos a los de demostración.
    const [realPoints, setRealPoints] = useState<MapPoint[]>([]);
    // Referencia a Leaflet (`L`) para poder plotear puntos reales tras la carga.
    const leafletRef = useRef<any>(null);

    // ── Build map points from sample data ─────────────────────
    const buildMapPoints = useCallback(
        (lat: number, lon: number): MapPoint[] => {
            const center = { lat, lon };
            const points: MapPoint[] = [];

            // Eventos — 6 events distributed around center
            const eventsToShow = sampleEvents.slice(0, 6);
            eventsToShow.forEach((ev, i) => {
                const pos = offsetAround(center, i, eventsToShow.length, 3.5);
                points.push({
                    id:       ev.id,
                    layer:    "eventos",
                    label:    ev.title,
                    sublabel: ev.location,
                    accent:   eventAccent(ev.system),
                    href:     `/evento/${ev.slug}`,
                    lat:      pos.lat,
                    lon:      pos.lon,
                });
            });

            // Comunidades — from sampleEntitiesAround (kind === Comunidad / Cultura / Energía…)
            const entities: GeoEntity[] = sampleEntitiesAround(center, 5);
            entities.forEach((e) => {
                const layer: LayerId = e.kind === "Gobernanza" ? "ef" : "comunidades";
                points.push({
                    id:       e.id,
                    layer,
                    label:    e.name,
                    sublabel: e.kind,
                    accent:   layer === "ef" ? ACCENT_EF : ACCENT_COMUNIDAD,
                    href:     layer === "ef" ? `/entidad/${e.id}` : `/pagina/${e.id}`,
                    lat:      e.lat,
                    lon:      e.lon,
                });
            });

            return points;
        },
        [],
    );

    // ── Inicialización del mapa (una vez) ─────────────────────
    useEffect(() => {
        let cancelled = false;
        ensureLeafletCss();

        loadLeaflet()
            .then((L) => {
                if (cancelled || !containerRef.current || mapRef.current) return;
                leafletRef.current = L;

                const map = L.map(containerRef.current, {
                    center:           [location.lat, location.lon],
                    zoom:             13,
                    zoomControl:      true,
                    attributionControl: true,
                });

                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    maxZoom:     19,
                    attribution: "© OpenStreetMap",
                }).addTo(map);

                // Marcador del usuario
                userMarkerRef.current = L.marker(
                    [location.lat, location.lon],
                    { icon: makeUserIcon(L) },
                )
                    .addTo(map)
                    .bindPopup(`<b>${location.name || "Tu ubicación"}</b>`);

                // Crear grupos de capas
                const groups: Record<LayerId, any> = {
                    eventos:     L.layerGroup().addTo(map),
                    comunidades: L.layerGroup().addTo(map),
                    ef:          L.layerGroup().addTo(map),
                };
                layerGroupsRef.current = groups;

                // Generar y añadir puntos
                const pts = buildMapPoints(location.lat, location.lon);
                setMapPoints(pts);

                pts.forEach((pt) => {
                    const group = groups[pt.layer];
                    if (!group) return;
                    const icon = makeCircleIcon(L, pt.accent, pt.layer === "eventos" ? 16 : 14);
                    L.marker([pt.lat, pt.lon], { icon })
                        .addTo(group)
                        .bindPopup(
                            `<div style="min-width:160px">
                              <b style="color:${pt.accent};font-size:13px">${pt.label}</b>
                              <br/>
                              <span style="font-size:11px;opacity:.75">${pt.sublabel}</span>
                              <br/>
                              <a href="${pt.href}" style="font-size:11px;color:${pt.accent};text-decoration:underline">Ver →</a>
                            </div>`,
                        );
                });

                mapRef.current = map;
                setTimeout(() => {
                    try { map.invalidateSize(); } catch { /* noop */ }
                }, 200);
                if (!cancelled) setStatus("ready");
            })
            .catch(() => {
                if (!cancelled) setStatus("error");
            });

        return () => {
            cancelled = true;
            if (mapRef.current) {
                try { mapRef.current.remove(); } catch { /* noop */ }
                mapRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Re-centra y actualiza el marcador al cambiar la ubicación
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        try {
            map.setView([location.lat, location.lon], map.getZoom() ?? 13);
            if (userMarkerRef.current) {
                userMarkerRef.current.setLatLng([location.lat, location.lon]);
                userMarkerRef.current.setPopupContent(
                    `<b>${location.name || "Tu ubicación"}</b>`,
                );
            }
        } catch { /* noop */ }
    }, [location.lat, location.lon, location.name]);

    // ── Sync layer visibility with state ──────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const groups = layerGroupsRef.current;
        (Object.keys(groups) as LayerId[]).forEach((layerId) => {
            const group = groups[layerId];
            if (!group) return;
            try {
                if (activeLayers.has(layerId)) {
                    if (!map.hasLayer(group)) map.addLayer(group);
                } else {
                    if (map.hasLayer(group)) map.removeLayer(group);
                }
            } catch { /* noop */ }
        });
    }, [activeLayers]);

    // ── Carga de puntos REALES geolocalizados (una vez, en cliente) ───────────
    useEffect(() => {
        let active = true;
        fetchRealGeoPoints()
            .then((pts) => {
                if (active) setRealPoints(pts);
            })
            .catch(() => {
                /* sin puntos reales: el mapa sigue funcionando con la demo */
            });
        return () => {
            active = false;
        };
    }, []);

    // ── Plotea los puntos reales en los grupos de capas cuando estén listos ───
    // Depende de que el mapa (status ready) y Leaflet estén disponibles. Los
    // puntos reales se AÑADEN a los grupos existentes y se registran en
    // `mapPoints` para el panel lateral (dedupe por id).
    useEffect(() => {
        const L = leafletRef.current;
        const groups = layerGroupsRef.current;
        if (status !== "ready" || !L || realPoints.length === 0) return;

        realPoints.forEach((pt) => {
            const group = groups[pt.layer];
            if (!group) return;
            try {
                const icon = makeCircleIcon(L, pt.accent, pt.layer === "eventos" ? 16 : 14);
                L.marker([pt.lat, pt.lon], { icon })
                    .addTo(group)
                    .bindPopup(
                        `<div style="min-width:160px">
                          <b style="color:${pt.accent};font-size:13px">${pt.label}</b>
                          <br/>
                          <span style="font-size:11px;opacity:.75">${pt.sublabel}</span>
                          <br/>
                          <a href="${pt.href}" style="font-size:11px;color:${pt.accent};text-decoration:underline">Ver →</a>
                        </div>`,
                    );
            } catch {
                /* noop: un punto que falle no rompe el resto */
            }
        });

        // Registra en el panel lateral (dedupe por id).
        setMapPoints((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            const merged = [...prev];
            for (const pt of realPoints) {
                if (!seen.has(pt.id)) merged.push(pt);
            }
            return merged;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, realPoints]);

    const toggleLayer = (id: LayerId) => {
        setActiveLayers((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const goToMyLocation = () => {
        const map = mapRef.current;
        if (!map) return;
        if (typeof navigator !== "undefined" && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    try { map.setView([pos.coords.latitude, pos.coords.longitude], 15); }
                    catch { /* noop */ }
                },
                () => {
                    try { map.setView([location.lat, location.lon], 14); }
                    catch { /* noop */ }
                },
                { enableHighAccuracy: true, timeout: 5000 },
            );
        } else {
            try { map.setView([location.lat, location.lon], 14); } catch { /* noop */ }
        }
    };

    // Filtered points for side panel
    const visiblePoints = mapPoints.filter((p) => activeLayers.has(p.layer));
    const countByLayer = (id: LayerId) => mapPoints.filter((p) => p.layer === id).length;

    return (
        <WidgetShell
            title="Mapa"
            subtitle={location.name}
            icon={MapPin}
            accent={ACCENT_USER}
            bodyClassName="p-0"
        >
            <div className="relative h-full w-full overflow-hidden rounded-2xl">
                {/* Contenedor del mapa */}
                <div
                    ref={containerRef}
                    className="absolute inset-0 z-0 [&_.leaflet-container]:!bg-black/40"
                    style={{ background: "rgba(0,0,0,0.4)" }}
                />

                {/* Estados de carga / error */}
                {status === "loading" && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                        <div className="flex items-center gap-2 text-xs text-white/70">
                            <Loader2 className="size-4 animate-spin" />
                            Cargando mapa…
                        </div>
                    </div>
                )}
                {status === "error" && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 px-4 text-center">
                        <p className="text-xs text-white/60">
                            No se pudo cargar el mapa. Revisa tu conexión.
                        </p>
                    </div>
                )}

                {status === "ready" && (
                    <>
                        {/* ── Chips de capas (top-left) ───────────────────── */}
                        <div className="absolute left-3 top-3 z-[400] flex flex-wrap gap-1.5">
                            {LAYERS.map((layer) => {
                                const Icon    = layer.icon;
                                const active  = activeLayers.has(layer.id);
                                const count   = countByLayer(layer.id);
                                return (
                                    <button
                                        key={layer.id}
                                        type="button"
                                        onClick={() => toggleLayer(layer.id)}
                                        className="flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur-md transition-all duration-150 shadow"
                                        style={{
                                            borderColor: active ? layer.accent : "rgba(255,255,255,0.12)",
                                            background:  active
                                                ? `${layer.accent}22`
                                                : "rgba(0,0,0,0.55)",
                                            color: active ? layer.accent : "rgba(255,255,255,0.55)",
                                        }}
                                        aria-pressed={active}
                                        aria-label={`${active ? "Ocultar" : "Mostrar"} capa ${layer.label}`}
                                    >
                                        <Icon className="size-2.5" />
                                        <span>{layer.label}</span>
                                        <span
                                            className="rounded-full px-1 py-px text-[9px] font-bold"
                                            style={{
                                                background: active ? `${layer.accent}33` : "rgba(255,255,255,0.08)",
                                                color:      active ? layer.accent        : "rgba(255,255,255,0.4)",
                                            }}
                                        >
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* ── Botón panel lateral ─────────────────────────── */}
                        <button
                            type="button"
                            onClick={() => setShowPanel((v) => !v)}
                            aria-label="Ver puntos StarSeed cercanos"
                            className="absolute bottom-12 right-3 z-[400] grid size-9 place-items-center rounded-full border border-white/15 bg-black/60 text-white/80 backdrop-blur-md transition-colors hover:bg-black/80 hover:text-white cursor-pointer shadow-lg"
                        >
                            <Layers className="size-4" style={{ color: ACCENT_COMUNIDAD }} />
                        </button>

                        {/* ── Botón mi ubicación ──────────────────────────── */}
                        <button
                            type="button"
                            onClick={goToMyLocation}
                            aria-label="Ir a mi ubicación"
                            className="absolute bottom-3 right-3 z-[400] grid size-9 place-items-center rounded-full border border-white/15 bg-black/60 text-white/80 backdrop-blur-md transition-colors hover:bg-black/80 hover:text-white cursor-pointer shadow-lg"
                        >
                            <LocateFixed className="size-4" style={{ color: ACCENT_USER }} />
                        </button>

                        {/* ── Leyenda (bottom-left) ───────────────────────── */}
                        <div className="absolute bottom-3 left-3 z-[400] flex flex-col gap-0.5 rounded-xl border border-white/10 bg-black/60 p-2 backdrop-blur-md text-[9px] text-white/60 shadow">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="inline-block size-2.5 rounded-full border border-white/30" style={{ background: ACCENT_USER }} />
                                <span>Tu ubicación</span>
                            </div>
                            {LAYERS.map((l) => (
                                <div key={l.id} className="flex items-center gap-1.5">
                                    <span className="inline-block size-2.5 rounded-full" style={{ background: l.accent, opacity: activeLayers.has(l.id) ? 1 : 0.3 }} />
                                    <span style={{ opacity: activeLayers.has(l.id) ? 1 : 0.4 }}>{l.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* ── Panel lateral glass ─────────────────────────── */}
                        {showPanel && (
                            <div className="absolute inset-y-0 right-0 z-[500] flex w-64 flex-col gap-0 rounded-r-2xl border-l border-white/10 bg-black/75 backdrop-blur-xl shadow-2xl overflow-hidden">
                                {/* Header */}
                                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                                    <span className="text-xs font-semibold text-white/80">Puntos StarSeed</span>
                                    <button
                                        type="button"
                                        onClick={() => setShowPanel(false)}
                                        className="cursor-pointer rounded-full p-0.5 text-white/40 hover:text-white/80 transition-colors"
                                        aria-label="Cerrar panel"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </div>

                                {/* Layer sections */}
                                <div className="flex-1 overflow-y-auto">
                                    {LAYERS.map((layer) => {
                                        const pts = visiblePoints.filter((p) => p.layer === layer.id);
                                        if (pts.length === 0) return null;
                                        const Icon = layer.icon;
                                        return (
                                            <div key={layer.id}>
                                                <div
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b border-white/5"
                                                    style={{ color: layer.accent }}
                                                >
                                                    <Icon className="size-3" />
                                                    <span>{layer.label}</span>
                                                    <span
                                                        className="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                                                        style={{ background: `${layer.accent}22`, color: layer.accent }}
                                                    >
                                                        {pts.length}
                                                    </span>
                                                </div>
                                                {pts.map((pt) => (
                                                    <Link
                                                        key={pt.id}
                                                        href={pt.href}
                                                        className="group flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-white/5 transition-colors border-b border-white/5"
                                                    >
                                                        <span
                                                            className="mt-0.5 shrink-0 size-2 rounded-full"
                                                            style={{ background: pt.accent }}
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-[11px] font-medium text-white/85 group-hover:text-white transition-colors">
                                                                {pt.label}
                                                            </p>
                                                            <p className="truncate text-[9px] text-white/40">
                                                                {pt.sublabel}
                                                            </p>
                                                        </div>
                                                        <ChevronRight className="mt-0.5 size-3 shrink-0 text-white/20 group-hover:text-white/50 transition-colors" />
                                                    </Link>
                                                ))}
                                            </div>
                                        );
                                    })}
                                    {visiblePoints.length === 0 && (
                                        <p className="px-3 py-4 text-center text-xs text-white/30">
                                            Activa al menos una capa para ver puntos.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </WidgetShell>
    );
}
