"use client";
/**
 * Datos comunes de los widgets del tiempo: ubicación, pronóstico (y aire si se pide), unidades,
 * formateadores en la hora del sitio y el cielo astronómico real (altura del Sol, fase lunar).
 * Solo pide a la red si el widget está en pantalla; la caché la comparten todos.
 */
import * as React from "react";
import { alturaSol, faseLunar, horasDelSol } from "@/lib/astro/cielo";
import { fuenteAire, fuentePronostico, type Coordenadas } from "@/modules/weather/datos/open-meteo";
import { formateadores, useFuente, useReloj, useUbicacionClima, useUnidades } from "@/modules/weather/datos/hooks";
import type { InfoMarco } from "./piezas";

export type EstadoClima = "sin-ubicacion" | "cargando" | "error" | "ok";

export function useDatosClima(info: InfoMarco, opciones: { aire?: boolean } = {}) {
    const { ubicacion } = useUbicacionClima();
    const lat = ubicacion?.lat, lon = ubicacion?.lon;
    const coords = React.useMemo<Coordenadas | null>(() => (lat === undefined || lon === undefined ? null : { lat, lon }), [lat, lon]);
    const clima = useFuente(fuentePronostico, coords, info.visible);
    const quiereAire = !!opciones.aire;
    const aire = useFuente(fuenteAire, quiereAire ? coords : null, info.visible && quiereAire);
    const [u] = useUnidades();
    const zona = clima.datos?.zona ?? ubicacion?.zona;
    const fmt = React.useMemo(() => formateadores(zona), [zona]);
    const ahora = useReloj(60_000);
    const astro = React.useMemo(() => {
        if (!ahora) return { altura: null, fase: null, orto: null, ocaso: null };
        const f = new Date(ahora);
        const sol = coords ? horasDelSol(f, coords.lat, coords.lon) : null;
        return {
            altura: coords ? alturaSol(f, coords.lat, coords.lon) : null,
            fase: faseLunar(f),
            orto: sol?.orto?.getTime() ?? null,
            ocaso: sol?.ocaso?.getTime() ?? null,
        };
    }, [ahora, coords]);
    const estado: EstadoClima = !ubicacion ? "sin-ubicacion" : clima.datos ? "ok" : clima.error ? "error" : "cargando";
    return { ubicacion, coords, clima, aire, u, fmt, ahora, astro, estado };
}
