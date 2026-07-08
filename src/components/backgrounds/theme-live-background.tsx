"use client";

/* ═══════════════════════════════════════════════════════════════════════════
 * ThemeBackgroundHost — RENDER de los fondos animados del catálogo de temas
 * (registro: src/lib/design/backgrounds.ts).
 * ---------------------------------------------------------------------------
 * Lee `document.documentElement.dataset.ssBackground` (lo escribe
 * `applyThemeTokens` de theme-engine.ts al aplicar un ThemePack) y monta la
 * capa correspondiente. Se monta UNA VEZ en el layout raíz, con z-index bajo
 * pero por encima de los fondos "clásicos" del OS (Spline/WebGL/Living, todos
 * en -z-40) — así elegir un tema del catálogo con fondo propio (matrix /
 * astrologico / visionario / climatico) gana visualmente de forma clara.
 * Si `data-ss-background` está vacío (todos los demás temas, o ningún tema
 * de catálogo aplicado) no renderiza NADA — cero coste, cero regresión sobre
 * el fondo existente del OS.
 *
 * Cada capa es deliberadamente ligera (CSS con unos pocos nodos, o un solo
 * fetch de clima cada 15 min para "weather-live") y respeta prefers-reduced-
 * motion + el modo eco del OS (html[data-perf="eco"] congela toda animación
 * con keyframes globalmente — ver starseed-themes.css §6).
 * ═══════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useState } from "react";
import { WeatherLocationProvider, useWeatherLocation } from "@/modules/weather/context/weather-location-context";
import { fetchWeatherData } from "@/lib/weather-mock";
import { WeatherFxOverlay, type WeatherFxKind } from "@/modules/weather/components/widgets/terrestrial/weather-fx-overlay";

/* ── Matrix rain (tema "matrix") ─────────────────────────────────────── */
function MatrixRainLayer() {
    return (
        <div className="ss-bg-matrix">
            {Array.from({ length: 24 }).map((_, i) => (
                <span key={i} className="ss-bg-matrix__col" />
            ))}
        </div>
    );
}

/* ── Campo estelar (tema "astrologico") ──────────────────────────────── */
function StarfieldLayer() {
    return (
        <div className="ss-bg-stars">
            {Array.from({ length: 24 }).map((_, i) => (
                <span key={i} className="ss-bg-stars__star" />
            ))}
            <span className="ss-bg-stars__star ss-bg-stars__star--big" />
            <span className="ss-bg-stars__star ss-bg-stars__star--big" />
        </div>
    );
}

/* ── Gradiente aurora (tema "visionario") ────────────────────────────── */
function AuroraGradientLayer() {
    return (
        <div className="ss-bg-aurora">
            <span className="ss-bg-aurora__blob" />
            <span className="ss-bg-aurora__blob" />
            <span className="ss-bg-aurora__blob" />
        </div>
    );
}

/* ── Clima en vivo (tema "climatico") ────────────────────────────────── */
type SkyCondition = "clear" | "cloudy" | "rain" | "storm" | "snow" | "fog";
type DayPhase = "day" | "sunset" | "night";

/** Mismo mapeo WMO que weather-basic-widget.tsx (código real de Open-Meteo). */
function conditionFromCode(code: number): SkyCondition {
    if ([95, 96, 99].includes(code)) return "storm";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
    if ([45, 48].includes(code)) return "fog";
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
    if ([1, 2, 3].includes(code)) return "cloudy";
    return "clear";
}

function phaseFromHour(h: number): DayPhase {
    if (h >= 6 && h < 18) return "day";
    if ((h >= 18 && h < 20) || (h >= 5 && h < 6)) return "sunset";
    return "night";
}

function fxKindFor(cond: SkyCondition, phase: DayPhase): WeatherFxKind {
    if (cond === "rain" || cond === "storm") return "rain";
    if (cond === "snow") return "snow";
    if (cond === "fog") return "fog";
    if (cond === "clear" && phase !== "night") return "sun-rays";
    return "none";
}

/** Degradado de iluminación ambiental según condición real + hora real. */
function gradientFor(cond: SkyCondition, phase: DayPhase): string {
    const night = phase === "night";
    const sunset = phase === "sunset";
    switch (cond) {
        case "storm": return "linear-gradient(160deg, #0b1120, #1e1b4b 55%, #020617)";
        case "snow": return night
            ? "linear-gradient(160deg, #1e293b, #334155 55%, #0f172a)"
            : "linear-gradient(160deg, #cbd5e1, #94a3b8 55%, #64748b)";
        case "fog": return "linear-gradient(160deg, #475569, #64748b 55%, #334155)";
        case "rain": return night
            ? "linear-gradient(160deg, #0f172a, #1e293b 55%, #0c1424)"
            : "linear-gradient(160deg, #334155, #1e293b 55%, #0f172a)";
        case "cloudy": return night
            ? "linear-gradient(160deg, #1e293b, #0f172a 55%, #020617)"
            : "linear-gradient(160deg, #64748b, #475569 55%, #334155)";
        default:
            if (night) return "linear-gradient(160deg, #020617, #0f1b3d 55%, #1e1b4b)";
            if (sunset) return "linear-gradient(160deg, #f59e0b, #db2777 55%, #581c87)";
            return "linear-gradient(160deg, #38bdf8, #3b82f6 55%, #1d4ed8)";
    }
}

function WeatherLiveInner() {
    const { location } = useWeatherLocation();
    const [scene, setScene] = useState<{ cond: SkyCondition; phase: DayPhase }>({ cond: "clear", phase: "day" });

    useEffect(() => {
        let alive = true;
        const load = () => {
            fetchWeatherData(location.lat, location.lon)
                .then((json) => {
                    if (!alive) return;
                    const code = json?.terrestrial?.current?.weather_code ?? json?.current?.weather_code ?? 0;
                    setScene({ cond: conditionFromCode(code), phase: phaseFromHour(new Date().getHours()) });
                })
                .catch(() => { /* degradación silenciosa: se queda con la última escena conocida */ });
        };
        load();
        // Refresco cada 15 min — suficiente para "en vivo" sin abusar de la API pública.
        const timer = setInterval(load, 15 * 60 * 1000);
        return () => { alive = false; clearInterval(timer); };
    }, [location.lat, location.lon]);

    return (
        <div className="ss-bg-weather" style={{ background: gradientFor(scene.cond, scene.phase) }}>
            <WeatherFxOverlay kind={fxKindFor(scene.cond, scene.phase)} />
        </div>
    );
}

/** Envuelve en su PROPIO WeatherLocationProvider: no depende de que el layout
 *  raíz monte uno (hoy solo vive dentro del dashboard/atmosphere-view), así
 *  este fondo funciona en CUALQUIER ruta del OS sin tocar el layout global. */
function WeatherLiveLayer() {
    return (
        <WeatherLocationProvider>
            <WeatherLiveInner />
        </WeatherLocationProvider>
    );
}

/* ── Host: lee data-ss-background y monta la capa activa ─────────────── */
export function ThemeBackgroundHost() {
    const [bg, setBg] = useState("");

    useEffect(() => {
        const read = () => setBg(document.documentElement.dataset.ssBackground || "");
        read();
        window.addEventListener("starseed:theme-applied", read);
        return () => window.removeEventListener("starseed:theme-applied", read);
    }, []);

    if (!bg) return null;

    return (
        <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none overflow-hidden transition-opacity duration-700">
            {bg === "matrix-rain" && <MatrixRainLayer />}
            {bg === "estrellas" && <StarfieldLayer />}
            {bg === "gradiente-aurora" && <AuroraGradientLayer />}
            {bg === "weather-live" && <WeatherLiveLayer />}
        </div>
    );
}

export default ThemeBackgroundHost;
