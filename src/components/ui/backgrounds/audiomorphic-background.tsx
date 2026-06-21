"use client";

/*
 * Fondo "audiomorphic" — visualizador Audiomorphic embebido a pantalla completa.
 * ----------------------------------------------------------------------------
 * Monta un <iframe> a pantalla completa (fixed inset-0 -z-40, pointer-events:none)
 * con el visualizador Audiomorphic como FONDO FIJO del OS. Visible cuando
 * config.background.type === "audiomorphic".
 *
 * CLAVE (antes "no se veía"): el visualizador necesita ARRANCAR y una fuente de
 * señal. Por eso pasamos params a la app (?bg=1&autostart=1&full=1[&mic=1][&cam=1]
 * [&preset=…]) y damos permisos al iframe vía allow="microphone; camera; …". La
 * app, en modo bg, oculta su UI y, si el micrófono no está disponible, anima de
 * forma autónoma → el fondo SIEMPRE se ve con movimiento. Todo configurable desde
 * la ventana de ajustes (AudiomorphicConfigWindow) y persistido en
 * config.background.audiomorphic (sync soberana).
 * SOP: architecture/dashboard-launcher-apps-y-archivos.md §5
 */

import React, { useEffect, useState } from "react";
import { useAppearance } from "@/context/appearance-context";

const DEFAULT_URL = "https://audiomorphic.vercel.app";
const DEFAULT_OVERLAY = 0.15;

const IFRAME_ALLOW =
    "microphone; camera; autoplay; fullscreen; gyroscope; accelerometer; magnetometer; xr-spatial-tracking";

interface AudioCfg { url?: string; overlay?: number; mode?: "auto" | "manual"; mic?: boolean; camera?: boolean; preset?: string }

/** Construye la URL del visualizador en modo fondo con los ajustes del usuario. */
export function buildAudiomorphicBgUrl(cfg?: AudioCfg): string {
    const base = cfg?.url || DEFAULT_URL;
    try {
        const u = new URL(base);
        u.searchParams.set("bg", "1");
        u.searchParams.set("autostart", "1");
        u.searchParams.set("full", "1");
        u.searchParams.set("starseed_os", "1");
        if (cfg?.mic || cfg?.mode === "auto") u.searchParams.set("mic", "1");
        if (cfg?.camera) u.searchParams.set("cam", "1");
        if (cfg?.preset) u.searchParams.set("preset", cfg.preset);
        return u.toString();
    } catch {
        return `${base}?bg=1&autostart=1&full=1&starseed_os=1`;
    }
}

export function AudiomorphicBackground() {
    const { config } = useAppearance();
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const isActive = (config.background.type as string) === "audiomorphic";
    const audiomorphic = config.background.audiomorphic as AudioCfg | undefined;
    const overlay = audiomorphic?.overlay ?? DEFAULT_OVERLAY;
    const src = buildAudiomorphicBgUrl(audiomorphic);

    if (!mounted) return null;

    return (
        <div
            className="fixed inset-0 w-full h-full -z-40 pointer-events-none transition-opacity duration-1000"
            style={{ opacity: isActive ? 1 : 0 }}
            aria-hidden="true"
        >
            {isActive && (
                <iframe
                    key={src}
                    src={src}
                    title="Audiomorphic visualizer"
                    className="absolute inset-0 w-full h-full border-0"
                    style={{ pointerEvents: "none" }}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    allow={IFRAME_ALLOW}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
            )}
            <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${overlay})` }} />
        </div>
    );
}
