"use client";

// src/components/maps/network-map.tsx
// ─────────────────────────────────────────────────────────────────────────────
// MAPA DE LA RED — comunidades y eventos StarSeed sobre una base Leaflet real
// (`react-leaflet`, ya presente como dependencia del proyecto — sin añadir
// librerías nuevas). Sustituye/mejora los mapas decorativos ("MapPlaceholder")
// con datos REALES: páginas/comunidades (`useOsPages`) y eventos
// (`useOsEvents`) que tengan geografía (`lat`/`lng`) ya persistida (Módulo de
// geografía aditivo de `os-social.ts`).
//
// Funcionalidad:
//   · Controles de zoom (Leaflet nativos, reposicionados) + botón "Centrar en
//     mi ubicación" (geolocalización del navegador, igual que `place-picker`).
//   · Capas activables: Comunidades / Eventos (checkboxes, sin recargar datos).
//   · Buscador de texto: filtra marcadores por nombre y hace `flyTo` al primero.
//   · Marcador con ficha emergente (Popup): nombre, tipo, descripción corta y
//     enlace a su página (`/pagina/[slug]` o `/evento/[slug]`).
//
// Si una entidad no tiene geografía (`lat`/`lng` ausentes), simplemente no se
// dibuja — el mapa nunca inventa coordenadas. Estado vacío honesto si no hay
// ninguna entidad geolocalizada todavía.
//
// Carga dinámica sin SSR (Leaflet requiere `window`); ver `NetworkMapLoader`
// más abajo para el wrapper que se importa desde las páginas.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Search, LocateFixed, Users2, CalendarDays, X, ExternalLink, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOsPages, useOsGroups, useOsEvents } from "@/hooks/use-os-entities";
import type { OsPage, OsGroup, OsEvent } from "@/lib/os-social";

// Corrige los iconos por defecto de Leaflet en Next.js (mismo fix ya usado en
// `climate-map-internal.tsx` del módulo de clima).
if (typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
    });
}

type MarkerKind = "comunidad" | "evento";

interface MapMarker {
    id: string;
    kind: MarkerKind;
    lat: number;
    lng: number;
    name: string;
    typeLabel: string;
    description?: string;
    placeLabel?: string | null;
    href: string;
}

function communityIcon(): L.DivIcon {
    return L.divIcon({
        className: "starseed-map-marker",
        html: `
            <div class="relative flex items-center justify-center w-8 h-8">
                <div class="absolute inset-0 rounded-full bg-cyan-400/25 blur-sm"></div>
                <div class="relative w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white/80 shadow-[0_0_10px_rgba(34,211,238,0.8)]"></div>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
}

function eventIcon(): L.DivIcon {
    return L.divIcon({
        className: "starseed-map-marker",
        html: `
            <div class="relative flex items-center justify-center w-8 h-8">
                <div class="absolute inset-0 rounded-full bg-amber-400/25 blur-sm"></div>
                <div class="relative w-3.5 h-3.5 rotate-45 bg-amber-400 border-2 border-white/80 shadow-[0_0_10px_rgba(251,191,36,0.8)]"></div>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
}

/** Vuela suavemente a una posición cuando cambia (buscador / "mi ubicación"). */
function FlyTo({ target }: { target: [number, number] | null }) {
    const map = useMap();
    useEffect(() => {
        if (!target) return;
        map.flyTo(target, 9, { animate: true, duration: 1.4 });
    }, [target, map]);
    return null;
}

function pageToMarker(p: OsPage): MapMarker | null {
    if (p.lat == null || p.lng == null) return null;
    return {
        id: `pagina-${p.slug}`,
        kind: "comunidad",
        lat: p.lat,
        lng: p.lng,
        name: p.name,
        typeLabel: p.kind === "comunidad" ? "Comunidad" : "Página",
        description: p.description,
        placeLabel: p.placeLabel,
        href: `/pagina/${p.slug}`,
    };
}

function groupToMarker(g: OsGroup): MapMarker | null {
    if (g.lat == null || g.lng == null) return null;
    return {
        id: `grupo-${g.slug}`,
        kind: "comunidad",
        lat: g.lat,
        lng: g.lng,
        name: g.name,
        typeLabel: "Grupo",
        description: g.description,
        placeLabel: g.placeLabel,
        href: `/pagina/${g.slug}`,
    };
}

function eventToMarker(e: OsEvent): MapMarker | null {
    if (e.lat == null || e.lng == null) return null;
    return {
        id: `evento-${e.slug}`,
        kind: "evento",
        lat: e.lat,
        lng: e.lng,
        name: e.title,
        typeLabel: "Evento",
        description: e.description,
        placeLabel: e.placeLabel ?? e.location,
        href: `/evento/${e.slug}`,
    };
}

const DEFAULT_CENTER: [number, number] = [20, 0]; // vista global por defecto

export interface NetworkMapProps {
    className?: string;
    /** Alto del mapa (Tailwind arbitrary value); por defecto un aspecto 16:9. */
    heightClassName?: string;
}

function NetworkMapInner({ className, heightClassName }: NetworkMapProps) {
    const { data: pages } = useOsPages();
    const { data: groups } = useOsGroups();
    const { data: events } = useOsEvents();

    const [showCommunities, setShowCommunities] = useState(true);
    const [showEvents, setShowEvents] = useState(true);
    const [query, setQuery] = useState("");
    const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
    const [geoLocating, setGeoLocating] = useState(false);
    const [geoNote, setGeoNote] = useState<string | null>(null);

    const communityMarkers = useMemo(
        () => [...pages.map(pageToMarker), ...groups.map(groupToMarker)].filter((m): m is MapMarker => m !== null),
        [pages, groups],
    );
    const eventMarkers = useMemo(
        () => events.map(eventToMarker).filter((m): m is MapMarker => m !== null),
        [events],
    );

    const visibleMarkers = useMemo(() => {
        const all = [
            ...(showCommunities ? communityMarkers : []),
            ...(showEvents ? eventMarkers : []),
        ];
        const q = query.trim().toLowerCase();
        if (!q) return all;
        return all.filter((m) => m.name.toLowerCase().includes(q) || (m.placeLabel ?? "").toLowerCase().includes(q));
    }, [communityMarkers, eventMarkers, showCommunities, showEvents, query]);

    const totalGeolocated = communityMarkers.length + eventMarkers.length;

    const cIcon = useMemo(() => communityIcon(), []);
    const eIcon = useMemo(() => eventIcon(), []);

    const runSearch = () => {
        const q = query.trim().toLowerCase();
        if (!q) return;
        const hit = visibleMarkers.find((m) => m.name.toLowerCase().includes(q));
        if (hit) setFlyTarget([hit.lat, hit.lng]);
    };

    const centerOnMyLocation = () => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            setGeoNote("Tu navegador no permite geolocalización.");
            return;
        }
        setGeoLocating(true);
        setGeoNote(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setGeoLocating(false);
                setFlyTarget([pos.coords.latitude, pos.coords.longitude]);
            },
            () => {
                setGeoLocating(false);
                setGeoNote("No se pudo obtener tu ubicación.");
            },
            { enableHighAccuracy: true, timeout: 6000 },
        );
    };

    return (
        <div className={cn("relative w-full overflow-hidden rounded-xl border border-primary/20", heightClassName ?? "aspect-[16/9]", className)}>
            <MapContainer
                center={DEFAULT_CENTER}
                zoom={2}
                style={{ height: "100%", width: "100%", background: "#0a0a0a" }}
                zoomControl={true}
                attributionControl={false}
                className="starseed-network-map"
            >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" opacity={0.85} />
                <FlyTo target={flyTarget} />

                {showCommunities &&
                    communityMarkers
                        .filter((m) => visibleMarkers.includes(m))
                        .map((m) => (
                            <Marker key={m.id} position={[m.lat, m.lng]} icon={cIcon}>
                                <Popup closeButton={false} className="starseed-map-popup">
                                    <div className="min-w-[10rem] space-y-1 py-0.5">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">{m.typeLabel}</p>
                                        <p className="text-sm font-bold text-white/95">{m.name}</p>
                                        {m.placeLabel && <p className="text-[11px] text-white/50">{m.placeLabel}</p>}
                                        {m.description && <p className="line-clamp-2 text-[11px] text-white/60">{m.description}</p>}
                                        <Link href={m.href} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:underline">
                                            Ver página <ExternalLink className="size-3" />
                                        </Link>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}

                {showEvents &&
                    eventMarkers
                        .filter((m) => visibleMarkers.includes(m))
                        .map((m) => (
                            <Marker key={m.id} position={[m.lat, m.lng]} icon={eIcon}>
                                <Popup closeButton={false} className="starseed-map-popup">
                                    <div className="min-w-[10rem] space-y-1 py-0.5">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">{m.typeLabel}</p>
                                        <p className="text-sm font-bold text-white/95">{m.name}</p>
                                        {m.placeLabel && <p className="text-[11px] text-white/50">{m.placeLabel}</p>}
                                        {m.description && <p className="line-clamp-2 text-[11px] text-white/60">{m.description}</p>}
                                        <Link href={m.href} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 hover:underline">
                                            Ver evento <ExternalLink className="size-3" />
                                        </Link>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
            </MapContainer>

            {/* Buscador flotante */}
            <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="pointer-events-auto flex flex-1 items-center gap-1.5 rounded-xl border border-white/10 bg-black/70 px-2.5 py-1.5 shadow-xl backdrop-blur-md">
                    <Search className="size-3.5 shrink-0 text-white/40" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") runSearch();
                        }}
                        placeholder="Buscar comunidad o evento…"
                        className="w-full min-w-0 bg-transparent text-xs text-white/85 placeholder:text-white/30 focus:outline-none"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery("")}
                            className="shrink-0 cursor-pointer rounded-full p-0.5 text-white/40 hover:bg-white/10 hover:text-white"
                            aria-label="Limpiar búsqueda"
                        >
                            <X className="size-3" />
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    onClick={centerOnMyLocation}
                    disabled={geoLocating}
                    title="Centrar en mi ubicación"
                    className="pointer-events-auto flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-black/70 px-2.5 py-1.5 text-xs font-semibold text-white/70 shadow-xl backdrop-blur-md transition-colors hover:border-cyan-400/40 hover:text-white disabled:opacity-50"
                >
                    <LocateFixed className="size-3.5" />
                    <span className="hidden sm:inline">Mi ubicación</span>
                </button>
            </div>

            {/* Control de capas */}
            <div className="pointer-events-none absolute bottom-3 left-3 z-[500]">
                <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-[11px] shadow-xl backdrop-blur-md">
                    <Layers className="size-3.5 text-white/40" />
                    <button
                        type="button"
                        onClick={() => setShowCommunities((v) => !v)}
                        className={cn(
                            "inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 font-semibold transition-colors",
                            showCommunities ? "bg-cyan-500/20 text-cyan-200" : "text-white/35 hover:text-white/60",
                        )}
                    >
                        <Users2 className="size-3" /> Comunidades ({communityMarkers.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowEvents((v) => !v)}
                        className={cn(
                            "inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 font-semibold transition-colors",
                            showEvents ? "bg-amber-500/20 text-amber-200" : "text-white/35 hover:text-white/60",
                        )}
                    >
                        <CalendarDays className="size-3" /> Eventos ({eventMarkers.length})
                    </button>
                </div>
            </div>

            {geoNote && (
                <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-lg border border-white/10 bg-black/70 px-2.5 py-1.5 text-[11px] text-white/50 shadow-xl backdrop-blur-md">
                    {geoNote}
                </div>
            )}

            {totalGeolocated === 0 && (
                <div className="pointer-events-none absolute inset-x-3 bottom-14 z-[500] rounded-lg border border-white/10 bg-black/75 px-3 py-2 text-center text-[11px] text-white/50 shadow-xl backdrop-blur-md">
                    Aún no hay comunidades ni eventos con geografía asignada. Aparecerán aquí en cuanto se publique alguno con ubicación.
                </div>
            )}
        </div>
    );
}

// Carga dinámica sin SSR: Leaflet necesita `window`/`document` en el módulo.
const NetworkMap = dynamic(() => Promise.resolve(NetworkMapInner), {
    ssr: false,
    loading: () => (
        <div className="grid aspect-[16/9] w-full place-items-center rounded-xl border border-primary/20 bg-black/40 text-xs text-white/40">
            Cargando mapa de la red…
        </div>
    ),
});

export default NetworkMap;
export { NetworkMap };
