"use client";
/**
 * Unidad de presión elegida (hPa, mmHg o inHg), compartida por todos los barómetros de la
 * pantalla y recordada en este navegador. Si el almacén no responde (ventana privada, vista
 * previa), se queda en hPa y todo sigue funcionando.
 */
import * as React from "react";
import { UNIDADES_PRESION, type UnidadPresion } from "@/modules/weather/datos/barometro";

const CLAVE = "starseed.clima.presion.v1";
const EVENTO = "starseed:clima-presion";
/** Lectura directa (un texto: la instantánea es estable por valor, sin caché que invalidar). */
function leer(): UnidadPresion {
    try {
        const v = window.localStorage.getItem(CLAVE);
        return UNIDADES_PRESION.includes(v as UnidadPresion) ? (v as UnidadPresion) : "hpa";
    } catch {
        return "hpa";
    }
}

function suscribir(cb: () => void) {
    window.addEventListener(EVENTO, cb);
    window.addEventListener("storage", cb);
    return () => {
        window.removeEventListener(EVENTO, cb);
        window.removeEventListener("storage", cb);
    };
}

export function useUnidadPresion(): [UnidadPresion, (u: UnidadPresion) => void] {
    const u = React.useSyncExternalStore(suscribir, leer, () => "hpa" as UnidadPresion);
    const fijar = React.useCallback((nueva: UnidadPresion) => {
        try { window.localStorage.setItem(CLAVE, nueva); } catch { /* sin almacén: vuelve a hPa */ }
        window.dispatchEvent(new Event(EVENTO));
    }, []);
    return [u, fijar];
}
