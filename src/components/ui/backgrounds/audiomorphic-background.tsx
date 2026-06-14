"use client";

/*
 * Fondo "audiomorphic" — visualizador Audiomorphic embebido a pantalla completa.
 * ----------------------------------------------------------------------------
 * Monta un <iframe> a pantalla completa (position:fixed inset-0 -z-40,
 * pointer-events:none) con el visualizador Audiomorphic como FONDO FIJO y
 * continuo del OS, igual que los demás fondos globales (Spline, WebGL,
 * líquidos, materia, living). Visible solo cuando config.background.type ===
 * "audiomorphic". URL y opacidad del overlay configurables vía
 * config.background.audiomorphic (deep-merge → defaults para configs antiguas).
 *
 * Nota: si el destino envía X-Frame-Options / CSP frame-ancestors restrictivo,
 * el iframe podría no cargar; la opción se mantiene igualmente (es lo pedido).
 * SOP: architecture/integracion-portal-starseed-os.md
 */

import React, { useEffect, useState } from "react";
import { useAppearance } from "@/context/appearance-context";

const DEFAULT_URL = "https://audiomorphic.vercel.app";
const DEFAULT_OVERLAY = 0.15;

export function AudiomorphicBackground() {
    const { config } = useAppearance();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const isActive = (config.background.type as string) === "audiomorphic";
    const audiomorphic = config.background.audiomorphic;
    const url = audiomorphic?.url || DEFAULT_URL;
    const overlay = audiomorphic?.overlay ?? DEFAULT_OVERLAY;

    if (!mounted) return null;

    return (
        <div
            className="fixed inset-0 w-full h-full -z-40 pointer-events-none transition-opacity duration-1000"
            style={{ opacity: isActive ? 1 : 0 }}
            aria-hidden="true"
        >
            {/* Solo montamos el iframe cuando está activo para no cargarlo en vano. */}
            {isActive && (
                <iframe
                    src={url}
                    title="Audiomorphic visualizer"
                    className="absolute inset-0 w-full h-full border-0"
                    style={{ pointerEvents: "none" }}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                />
            )}
            {/* Overlay sutil para legibilidad de la UI superpuesta. */}
            <div
                className="absolute inset-0"
                style={{ background: `rgba(0,0,0,${overlay})` }}
            />
        </div>
    );
}
