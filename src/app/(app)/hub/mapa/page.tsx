"use client";

// src/app/(app)/hub/mapa/page.tsx
// Sección MAPA del Hub de Conexiones (SOP: centro-creacion-sync-permisos.md §12).
// Mapa soberano estilo Google Maps sobre OpenStreetMap (filosofía Organic Maps):
// capas base + clima real, GPS y ubicación compartida con permisos,
// publicaciones geolocalizadas y democracia territorial.
//
// El mapa ocupa la vista completa disponible bajo el header del OS:
//   100svh − header clamp(3.5rem,5vw,4.5rem) − padding vertical del main
//   (2 × clamp(0.75rem,1.5vw,1.5rem)). SSR-safe: MapView carga Leaflet por CDN
// dentro de efectos (sin window en render).

import Link from "next/link";
import { ArrowLeft, Map as MapIcon } from "lucide-react";
import { MapView } from "@/components/map/map-view";

export default function HubMapaPage() {
    return (
        <div className="relative flex w-full flex-1 flex-col">
            <MapView className="h-[calc(100svh-clamp(3.5rem,5vw,4.5rem)-clamp(1.5rem,3vw,3rem))] min-h-[420px]" />

            {/* Título flotante (no roba altura al mapa) + vuelta al Hub */}
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 hidden -translate-x-1/2 md:block">
                <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-black/55 px-3 py-1.5 backdrop-blur-xl shadow-2xl">
                    <Link
                        href="/hub"
                        className="flex cursor-pointer items-center gap-1 text-[11px] text-white/50 transition-colors hover:text-white"
                        title="Volver al Hub de Conexiones"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Hub
                    </Link>
                    <span className="h-3 w-px bg-white/15" />
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-white/85">
                        <MapIcon className="h-3.5 w-3.5 text-primary" />
                        Mapa de la Red
                    </span>
                </div>
            </div>
        </div>
    );
}
