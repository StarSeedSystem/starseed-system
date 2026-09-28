"use client";
/** ¿Se cumple esta media query? En el servidor (y en la primera pintura) responde `defecto`. */
import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(consulta: string, defecto = false): boolean {
    const subscribe = useCallback(
        (cb: () => void) => {
            if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
            const m = window.matchMedia(consulta);
            try {
                m.addEventListener("change", cb);
                return () => m.removeEventListener("change", cb);
            } catch {
                m.addListener?.(cb);
                return () => m.removeListener?.(cb);
            }
        },
        [consulta],
    );
    const leer = useCallback(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return defecto;
        return window.matchMedia(consulta).matches;
    }, [consulta, defecto]);
    return useSyncExternalStore(subscribe, leer, () => defecto);
}

/** Pantalla de móvil (menos de 768 px): la tabla pasa a una tarjeta por fila. */
export function useEsMovil(): boolean {
    return useMediaQuery("(max-width: 767px)");
}
