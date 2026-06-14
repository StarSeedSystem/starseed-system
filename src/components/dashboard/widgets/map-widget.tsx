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
// ════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { MapPin, LocateFixed, Loader2 } from "lucide-react";
import { WidgetShell } from "../kit";
import {
    useWeatherLocation,
    type LocationData,
} from "@/modules/weather/context/weather-location-context";
import { sampleEntitiesAround, type GeoEntity } from "@/lib/geo";

const ACCENT = "#10b981";
const FALLBACK_LOCATION: LocationData = {
    lat: 18.9226,
    lon: -99.2347,
    name: "Cuernavaca, Morelos",
};

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

/**
 * Lee la ubicación del contexto de clima de forma segura. Si el widget
 * se monta fuera del WeatherLocationProvider, el hook lanza; lo
 * capturamos y devolvemos un fallback para no romper el dashboard.
 */
function useSafeLocation(): LocationData {
    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        return useWeatherLocation().location ?? FALLBACK_LOCATION;
    } catch {
        return FALLBACK_LOCATION;
    }
}

/** Inyecta el CSS de Leaflet una sola vez. */
function ensureLeafletCss() {
    if (typeof document === "undefined") return;
    if (document.querySelector(`link[href="${LEAFLET_CSS}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    link.crossOrigin = "";
    document.head.appendChild(link);
}

/** Carga el script de Leaflet una sola vez y resuelve con window.L. */
function loadLeaflet(): Promise<any> {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            reject(new Error("no-window"));
            return;
        }
        const w = window as any;
        if (w.L) {
            resolve(w.L);
            return;
        }
        const existing = document.querySelector(
            `script[src="${LEAFLET_JS}"]`,
        ) as HTMLScriptElement | null;
        if (existing) {
            existing.addEventListener("load", () => resolve((window as any).L));
            existing.addEventListener("error", () =>
                reject(new Error("leaflet-load-error")),
            );
            // Por si ya cargó entre el query y el listener.
            if ((window as any).L) resolve((window as any).L);
            return;
        }
        const script = document.createElement("script");
        script.src = LEAFLET_JS;
        script.crossOrigin = "";
        script.async = true;
        script.onload = () => resolve((window as any).L);
        script.onerror = () => reject(new Error("leaflet-load-error"));
        document.head.appendChild(script);
    });
}

export function MapWidget() {
    const location = useSafeLocation();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<any>(null);
    const userMarkerRef = useRef<any>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">(
        "loading",
    );

    // ── Inicialización del mapa (una vez) ─────────────────────────
    useEffect(() => {
        let cancelled = false;
        ensureLeafletCss();

        loadLeaflet()
            .then((L) => {
                if (cancelled || !containerRef.current || mapRef.current) return;

                const map = L.map(containerRef.current, {
                    center: [location.lat, location.lon],
                    zoom: 13,
                    zoomControl: true,
                    attributionControl: true,
                });

                L.tileLayer(
                    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                    {
                        maxZoom: 19,
                        attribution: "© OpenStreetMap",
                    },
                ).addTo(map);

                // Marcador del usuario
                userMarkerRef.current = L.marker([location.lat, location.lon])
                    .addTo(map)
                    .bindPopup(`<b>${location.name || "Tu ubicación"}</b>`);

                // Entidades StarSeed de ejemplo cercanas
                const entities: GeoEntity[] = sampleEntitiesAround({
                    lat: location.lat,
                    lon: location.lon,
                });
                entities.forEach((e) => {
                    L.circleMarker([e.lat, e.lon], {
                        radius: 7,
                        color: ACCENT,
                        weight: 2,
                        fillColor: ACCENT,
                        fillOpacity: 0.55,
                    })
                        .addTo(map)
                        .bindPopup(
                            `<b>${e.name}</b><br/><span style="opacity:.7">${e.kind}</span>`,
                        );
                });

                mapRef.current = map;
                // El contenedor puede haberse medido tarde dentro del grid.
                setTimeout(() => {
                    try {
                        map.invalidateSize();
                    } catch {
                        /* noop */
                    }
                }, 200);
                if (!cancelled) setStatus("ready");
            })
            .catch(() => {
                if (!cancelled) setStatus("error");
            });

        return () => {
            cancelled = true;
            if (mapRef.current) {
                try {
                    mapRef.current.remove();
                } catch {
                    /* noop */
                }
                mapRef.current = null;
            }
        };
        // Solo se inicializa una vez; los cambios de ubicación se reflejan
        // en el efecto de abajo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Re-centra y actualiza el marcador al cambiar la ubicación ──
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
        } catch {
            /* noop */
        }
    }, [location.lat, location.lon, location.name]);

    const goToMyLocation = () => {
        const map = mapRef.current;
        if (!map) return;
        if (typeof navigator !== "undefined" && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    try {
                        map.setView([latitude, longitude], 15);
                    } catch {
                        /* noop */
                    }
                },
                () => {
                    // Sin permiso: volvemos al centro conocido.
                    try {
                        map.setView([location.lat, location.lon], 14);
                    } catch {
                        /* noop */
                    }
                },
                { enableHighAccuracy: true, timeout: 5000 },
            );
        } else {
            try {
                map.setView([location.lat, location.lon], 14);
            } catch {
                /* noop */
            }
        }
    };

    return (
        <WidgetShell
            title="Mapa"
            subtitle={location.name}
            icon={MapPin}
            accent={ACCENT}
            bodyClassName="p-0"
        >
            <div className="relative h-full w-full overflow-hidden rounded-2xl">
                {/* Contenedor del mapa. Captura gestos táctiles (es un mapa). */}
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

                {/* Botón "mi ubicación" */}
                {status === "ready" && (
                    <button
                        type="button"
                        onClick={goToMyLocation}
                        aria-label="Ir a mi ubicación"
                        className="absolute bottom-3 right-3 z-[400] grid size-9 place-items-center rounded-full border border-white/15 bg-black/60 text-white/80 backdrop-blur-md transition-colors hover:bg-black/80 hover:text-white cursor-pointer shadow-lg"
                    >
                        <LocateFixed className="size-4" style={{ color: ACCENT }} />
                    </button>
                )}
            </div>
        </WidgetShell>
    );
}
