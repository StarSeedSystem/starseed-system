"use client";
/**
 * Ubicación del Clima para los widgets del paquete B (Oikos, Siembra): su contexto si está montado
 * y, si no, la que guardó el Clima en este dispositivo. null si no hay ninguna: se dice y se ofrece
 * elegirla en /clima. Sin red.
 */
import { useCallback, useEffect, useState } from "react";
import { useWeatherLocationOpcional } from "@/modules/weather/context/weather-location-context";

export interface LugarB { lat: number; lon: number; nombre: string }

export function useLugarB(): LugarB | null {
    const ctx = useWeatherLocationOpcional();
    const [guardado, setGuardado] = useState<LugarB | null>(null);
    useEffect(() => {
        if (ctx) return;
        try {
            const j = JSON.parse(localStorage.getItem("starseed_weather_location") || "null");
            if (j && typeof j.lat === "number" && typeof j.lon === "number") setGuardado({ lat: j.lat, lon: j.lon, nombre: j.name ?? "" });
        } catch { /* sin almacén */ }
    }, [ctx]);
    if (ctx) return { lat: ctx.location.lat, lon: ctx.location.lon, nombre: ctx.location.name };
    return guardado;
}

const CLAVE_SUPUESTOS = "starseed.oikos.superficies.v1";

/** Superficies elegidas (preferencia de este dispositivo). */
export function useSupuestosOikos(): [{ paneles: number; tejado: number }, (p: Partial<{ paneles: number; tejado: number }>) => void] {
    const [s, setS] = useState({ paneles: 10, tejado: 50 });
    useEffect(() => {
        try {
            const j = JSON.parse(localStorage.getItem(CLAVE_SUPUESTOS) || "null");
            if (j && typeof j.paneles === "number" && typeof j.tejado === "number") setS({ paneles: j.paneles, tejado: j.tejado });
        } catch { /* sin almacén */ }
    }, []);
    const cambiar = useCallback((p: Partial<{ paneles: number; tejado: number }>) => {
        setS((prev) => {
            const n = { ...prev, ...p };
            try { localStorage.setItem(CLAVE_SUPUESTOS, JSON.stringify(n)); } catch { /* cuota */ }
            return n;
        });
    }, []);
    return [s, cambiar];
}

