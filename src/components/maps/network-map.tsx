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
// Funcionalidad base:
//   · Controles de zoom + "Centrar en mi ubicación" (geolocalización).
//   · Capas activables: Comunidades / Eventos.
//   · Buscador de texto: filtra marcadores y hace `flyTo` al primero.
//   · Marcador con ficha emergente (Popup) + enlace a su página.
//
// CAPA «CONEXIONES» (Adenda 77 · PACK 2 cultural — OPT-IN vía prop `connections`):
//   · Pins de CIUDADANOS de la red que han declarado región/coordenadas en su
//     perfil (tags públicos `geo:`/`sistema:` — ver `lib/cultural/languages.ts`).
//   · Color por SISTEMA cultural (leyenda incluida).
//   · Popup con tarjeta mini + acciones REALES: Abrir perfil / Conectar (DM).
//   · Filtro por idioma y por sistema/región.
//   · Estado vacío honesto + CTA para declarar tu propia región.
// La capa base (culture page: `<NetworkMap />` sin props) NO cambia.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Search, LocateFixed, Users2, CalendarDays, X, ExternalLink, Layers, Globe2, MessageSquarePlus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOsPages, useOsGroups, useOsEvents } from "@/hooks/use-os-entities";
import type { OsPage, OsGroup, OsEvent } from "@/lib/os-social";
import { CULTURAL_SYSTEMS, systemById } from "@/lib/cultural/systems";
import { listCulturalProfiles, languageLabel, type CulturalProfile } from "@/lib/cultural/languages";
import { createDm } from "@/lib/messages/dm";

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

/** Pin de una conexión (ciudadano con región declarada). */
interface ConnectionMarker {
    id: string;
    userId: string;
    username: string;
    lat: number;
    lng: number;
    name: string;
    avatarUrl?: string | null;
    systemId: string;
    placeLabel: string;
    speaks: string[];
    learns: string[];
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

/** Icono de conexión coloreado por su sistema cultural. */
function connectionIcon(color: string): L.DivIcon {
    return L.divIcon({
        className: "starseed-map-marker",
        html: `
            <div class="relative flex items-center justify-center w-9 h-9">
                <div class="absolute inset-0 rounded-full blur-sm" style="background:${color}40"></div>
                <div class="relative w-4 h-4 rounded-full border-2 border-white/85" style="background:${color};box-shadow:0 0 12px ${color}cc"></div>
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
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

function profileToConnection(cp: CulturalProfile): ConnectionMarker | null {
    const r = cp.prefs.region;
    if (!r || typeof r.lat !== "number" || typeof r.lng !== "number") return null;
    return {
        id: `conexion-${cp.profile.userId}`,
        userId: cp.profile.userId,
        username: cp.profile.username,
        lat: r.lat,
        lng: r.lng,
        name: cp.profile.displayName,
        avatarUrl: cp.profile.avatarUrl ?? null,
        systemId: r.systemId || "global",
        placeLabel: r.label || systemById(r.systemId).label,
        speaks: cp.prefs.speaks,
        learns: cp.prefs.learns,
    };
}

const DEFAULT_CENTER: [number, number] = [20, 0]; // vista global por defecto

export interface NetworkMapProps {
    className?: string;
    /** Alto del mapa (Tailwind arbitrary value); por defecto un aspecto 16:9. */
    heightClassName?: string;
    /** OPT-IN: activa la capa «Conexiones» (ciudadanos por región) + leyenda + filtros. */
    connections?: boolean;
}

function NetworkMapInner({ className, heightClassName, connections = false }: NetworkMapProps) {
    const router = useRouter();
    const { data: pages } = useOsPages();
    const { data: groups } = useOsGroups();
    const { data: events } = useOsEvents();

    const [showCommunities, setShowCommunities] = useState(true);
    const [showEvents, setShowEvents] = useState(true);
    const [showConnections, setShowConnections] = useState(connections);
    const [query, setQuery] = useState("");
    const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
    const [geoLocating, setGeoLocating] = useState(false);
    const [geoNote, setGeoNote] = useState<string | null>(null);

    // ── Capa Conexiones (ciudadanos por región) ──
    const [connProfiles, setConnProfiles] = useState<CulturalProfile[]>([]);
    const [connLoading, setConnLoading] = useState(false);
    const [filterLang, setFilterLang] = useState("");
    const [filterSystem, setFilterSystem] = useState("");
    const [connecting, setConnecting] = useState<string | null>(null);

    useEffect(() => {
        if (!connections) return;
        let alive = true;
        setConnLoading(true);
        listCulturalProfiles(250)
            .then((list) => {
                if (alive) setConnProfiles(list);
            })
            .finally(() => {
                if (alive) setConnLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [connections]);

    const communityMarkers = useMemo(
        () => [...pages.map(pageToMarker), ...groups.map(groupToMarker)].filter((m): m is MapMarker => m !== null),
        [pages, groups],
    );
    const eventMarkers = useMemo(
        () => events.map(eventToMarker).filter((m): m is MapMarker => m !== null),
        [events],
    );
    const connectionMarkers = useMemo(
        () => connProfiles.map(profileToConnection).filter((m): m is ConnectionMarker => m !== null),
        [connProfiles],
    );

    // Sistemas presentes (para la leyenda dinámica).
    const presentSystems = useMemo(() => {
        const ids = new Set(connectionMarkers.map((m) => m.systemId));
        return CULTURAL_SYSTEMS.filter((s) => ids.has(s.id));
    }, [connectionMarkers]);

    // Idiomas presentes (para el filtro).
    const presentLangs = useMemo(() => {
        const set = new Set<string>();
        for (const m of connectionMarkers) {
            for (const c of m.speaks) set.add(c);
            for (const c of m.learns) set.add(c);
        }
        return Array.from(set).sort();
    }, [connectionMarkers]);

    const visibleMarkers = useMemo(() => {
        const all = [
            ...(showCommunities ? communityMarkers : []),
            ...(showEvents ? eventMarkers : []),
        ];
        const q = query.trim().toLowerCase();
        if (!q) return all;
        return all.filter((m) => m.name.toLowerCase().includes(q) || (m.placeLabel ?? "").toLowerCase().includes(q));
    }, [communityMarkers, eventMarkers, showCommunities, showEvents, query]);

    const visibleConnections = useMemo(() => {
        if (!showConnections) return [];
        const q = query.trim().toLowerCase();
        return connectionMarkers.filter((m) => {
            if (filterSystem && m.systemId !== filterSystem) return false;
            if (filterLang && !m.speaks.includes(filterLang) && !m.learns.includes(filterLang)) return false;
            if (q && !m.name.toLowerCase().includes(q) && !m.placeLabel.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [connectionMarkers, showConnections, filterSystem, filterLang, query]);

    const totalGeolocated = communityMarkers.length + eventMarkers.length + (connections ? connectionMarkers.length : 0);

    const cIcon = useMemo(() => communityIcon(), []);
    const eIcon = useMemo(() => eventIcon(), []);
    const connIcons = useMemo(() => {
        const map: Record<string, L.DivIcon> = {};
        for (const s of CULTURAL_SYSTEMS) map[s.id] = connectionIcon(s.color);
        return map;
    }, []);

    const runSearch = () => {
        const q = query.trim().toLowerCase();
        if (!q) return;
        const hit =
            visibleMarkers.find((m) => m.name.toLowerCase().includes(q)) ??
            (showConnections ? visibleConnections.find((m) => m.name.toLowerCase().includes(q)) : undefined);
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

    const handleConnect = async (userId: string) => {
        setConnecting(userId);
        try {
            const res = await createDm(userId);
            if (!res.ok) {
                toast.error(res.error || "No se pudo iniciar la conversación.");
                return;
            }
            toast.success("Conversación iniciada. ¡Saluda a tu conexión!");
            router.push("/messages");
        } catch {
            toast.error("No se pudo conectar ahora mismo.");
        } finally {
            setConnecting(null);
        }
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

                {showConnections &&
                    visibleConnections.map((m) => {
                        const sys = systemById(m.systemId);
                        return (
                            <Marker key={m.id} position={[m.lat, m.lng]} icon={connIcons[m.systemId] ?? connIcons["global"]}>
                                <Popup closeButton={false} className="starseed-map-popup">
                                    <div className="min-w-[11rem] space-y-1.5 py-0.5">
                                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: sys.color }}>
                                            Conexión · {sys.label}
                                        </p>
                                        <p className="text-sm font-bold text-white/95">{m.name}</p>
                                        {m.placeLabel && <p className="text-[11px] text-white/50">{m.placeLabel}</p>}
                                        {(m.speaks.length > 0 || m.learns.length > 0) && (
                                            <p className="text-[11px] text-white/65">
                                                {m.speaks.length > 0 && <>Habla {m.speaks.map(languageLabel).join(", ")}. </>}
                                                {m.learns.length > 0 && <>Aprende {m.learns.map(languageLabel).join(", ")}.</>}
                                            </p>
                                        )}
                                        <div className="mt-1 flex items-center gap-2">
                                            {m.username && (
                                                <Link
                                                    href={`/profile/${m.username}`}
                                                    className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 text-[11px] font-semibold text-white/80 hover:border-white/40"
                                                >
                                                    Abrir <ExternalLink className="size-3" />
                                                </Link>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleConnect(m.userId)}
                                                disabled={connecting === m.userId}
                                                className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-black disabled:opacity-60"
                                                style={{ background: sys.color }}
                                            >
                                                <MessageSquarePlus className="size-3" />
                                                {connecting === m.userId ? "…" : "Conectar"}
                                            </button>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
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
                        placeholder={connections ? "Buscar comunidad, evento o conexión…" : "Buscar comunidad o evento…"}
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

            {/* Filtros de la capa Conexiones (idioma / sistema) */}
            {connections && showConnections && (
                <div className="pointer-events-none absolute left-3 right-3 top-16 z-[500] flex flex-wrap gap-2 sm:top-14">
                    <select
                        value={filterLang}
                        onChange={(e) => setFilterLang(e.target.value)}
                        className="pointer-events-auto cursor-pointer rounded-lg border border-white/10 bg-black/70 px-2 py-1 text-[11px] font-semibold text-white/80 shadow-lg backdrop-blur-md focus:outline-none"
                        title="Filtrar por idioma"
                    >
                        <option value="">Todos los idiomas</option>
                        {presentLangs.map((c) => (
                            <option key={c} value={c}>
                                {languageLabel(c)}
                            </option>
                        ))}
                    </select>
                    <select
                        value={filterSystem}
                        onChange={(e) => setFilterSystem(e.target.value)}
                        className="pointer-events-auto cursor-pointer rounded-lg border border-white/10 bg-black/70 px-2 py-1 text-[11px] font-semibold text-white/80 shadow-lg backdrop-blur-md focus:outline-none"
                        title="Filtrar por sistema cultural"
                    >
                        <option value="">Todos los sistemas</option>
                        {CULTURAL_SYSTEMS.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.label}
                            </option>
                        ))}
                    </select>
                    {(filterLang || filterSystem) && (
                        <button
                            type="button"
                            onClick={() => {
                                setFilterLang("");
                                setFilterSystem("");
                            }}
                            className="pointer-events-auto inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-black/70 px-2 py-1 text-[11px] font-semibold text-white/60 shadow-lg backdrop-blur-md hover:text-white"
                        >
                            <X className="size-3" /> Limpiar
                        </button>
                    )}
                </div>
            )}

            {/* Control de capas */}
            <div className="pointer-events-none absolute bottom-3 left-3 z-[500]">
                <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-[11px] shadow-xl backdrop-blur-md">
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
                    {connections && (
                        <button
                            type="button"
                            onClick={() => setShowConnections((v) => !v)}
                            className={cn(
                                "inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 font-semibold transition-colors",
                                showConnections ? "bg-violet-500/20 text-violet-200" : "text-white/35 hover:text-white/60",
                            )}
                        >
                            <Globe2 className="size-3" /> Conexiones ({connectionMarkers.length})
                        </button>
                    )}
                </div>
            </div>

            {/* Leyenda de sistemas culturales (capa Conexiones) */}
            {connections && showConnections && presentSystems.length > 0 && (
                <div className="pointer-events-none absolute bottom-3 right-3 z-[500] max-w-[13rem]">
                    <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/70 px-3 py-2 shadow-xl backdrop-blur-md">
                        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/60">
                            <Sparkles className="size-3" /> Sistemas culturales
                        </p>
                        <div className="flex flex-col gap-1">
                            {presentSystems.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setFilterSystem((cur) => (cur === s.id ? "" : s.id))}
                                    className={cn(
                                        "flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[11px] transition-colors",
                                        filterSystem === s.id ? "bg-white/10 text-white" : "text-white/70 hover:text-white",
                                    )}
                                >
                                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {geoNote && (
                <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-lg border border-white/10 bg-black/70 px-2.5 py-1.5 text-[11px] text-white/50 shadow-xl backdrop-blur-md">
                    {geoNote}
                </div>
            )}

            {connections && connLoading && connectionMarkers.length === 0 && (
                <div className="pointer-events-none absolute inset-x-3 top-24 z-[400] mx-auto max-w-xs rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-center text-[11px] text-white/50 shadow-xl backdrop-blur-md">
                    Cargando conexiones de la red…
                </div>
            )}

            {totalGeolocated === 0 && !connLoading && (
                <div className="pointer-events-none absolute inset-x-3 bottom-14 z-[500] rounded-lg border border-white/10 bg-black/75 px-3 py-2 text-center text-[11px] text-white/50 shadow-xl backdrop-blur-md">
                    {connections ? (
                        <span>
                            Aún no hay entidades ni ciudadanos con región declarada. Declara la tuya en el Hub → «Cultura viva» → Idiomas
                            para aparecer en el mapa.
                        </span>
                    ) : (
                        <span>Aún no hay comunidades ni eventos con geografía asignada. Aparecerán aquí en cuanto se publique alguno con ubicación.</span>
                    )}
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
