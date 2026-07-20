"use client";

// src/app/(app)/hub/mapa/page.tsx
// Sección MAPA del Hub de Conexiones (SOP: centro-creacion-sync-permisos.md §12).
// Mapa soberano estilo Google Maps sobre OpenStreetMap (filosofía Organic Maps):
// capas base + clima real, GPS y ubicación compartida con permisos,
// publicaciones geolocalizadas y democracia territorial.
//
// Adenda 77 · Agente H2 · PACK 2 cultural — se añade una VISTA «Conexiones»
// (mapa-mundi de conexiones): sobre el mismo lienzo OSM se pintan los ciudadanos
// y entidades de la red por región, coloreados por sistema cultural, con filtros
// por idioma/región y acciones (abrir/conectar). La vista «Territorio» (MapView)
// se mantiene intacta. Un conmutador flotante alterna entre ambas.

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Map as MapIcon, Globe2, Mountain } from "lucide-react";
import { cn } from "@/lib/utils";
import { MapView } from "@/components/map/map-view";

// Capa «Conexiones» (Leaflet, sin SSR) — reutiliza el mapa de la red extendido.
const NetworkMap = dynamic(() => import("@/components/maps/network-map").then((m) => m.NetworkMap), {
    ssr: false,
    loading: () => (
        <div className="grid h-[calc(100svh-clamp(3.5rem,5vw,4.5rem)-clamp(1.5rem,3vw,3rem))] min-h-[420px] w-full place-items-center rounded-xl border border-primary/20 bg-black/40 text-xs text-white/40">
            Cargando mapa de conexiones…
        </div>
    ),
});

type MapaView = "territorio" | "conexiones";

const MAP_HEIGHT = "h-[calc(100svh-clamp(3.5rem,5vw,4.5rem)-clamp(1.5rem,3vw,3rem))] min-h-[420px]";

export default function HubMapaPage() {
    const [view, setView] = useState<MapaView>("territorio");

    return (
        <div className="relative flex w-full flex-1 flex-col">
            {view === "territorio" ? (
                <MapView className={MAP_HEIGHT} />
            ) : (
                <NetworkMap connections heightClassName={MAP_HEIGHT} />
            )}

            {/* Título flotante + conmutador de vista (no roba altura al mapa) */}
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
                <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-black/55 px-3 py-1.5 shadow-2xl backdrop-blur-xl">
                    <Link
                        href="/hub"
                        className="flex cursor-pointer items-center gap-1 text-[11px] text-white/50 transition-colors hover:text-white"
                        title="Volver al Hub de Conexiones"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Hub</span>
                    </Link>
                    <span className="h-3 w-px bg-white/15" />
                    <span className="hidden items-center gap-1.5 text-xs font-semibold text-white/85 md:flex">
                        <MapIcon className="h-3.5 w-3.5 text-primary" />
                        Mapa de la Red
                    </span>
                    <span className="hidden h-3 w-px bg-white/15 md:block" />
                    <div className="flex items-center gap-1 rounded-full bg-white/5 p-0.5">
                        <button
                            type="button"
                            onClick={() => setView("territorio")}
                            className={cn(
                                "inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors",
                                view === "territorio" ? "bg-cyan-500/25 text-cyan-100" : "text-white/50 hover:text-white",
                            )}
                        >
                            <Mountain className="h-3 w-3" /> Territorio
                        </button>
                        <button
                            type="button"
                            onClick={() => setView("conexiones")}
                            className={cn(
                                "inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors",
                                view === "conexiones" ? "bg-violet-500/25 text-violet-100" : "text-white/50 hover:text-white",
                            )}
                        >
                            <Globe2 className="h-3 w-3" /> Conexiones
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
