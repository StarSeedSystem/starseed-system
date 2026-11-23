/**
 * pantalla-local — ajustes visuales del Centro de Control estrictamente locales a esta neurona.
 * --------------------------------------------------------------------------------------------
 * El rendimiento y la transparencia/brillo/atmósfera ajustados desde el Centro de Control
 * aplican SOLO en la neurona donde se seleccionan y nunca viajan con la cuenta ni pisan
 * `appearance-config-v2`. Módulo puro sin React.
 */

export const PANTALLA_LOCAL_KEY = "starseed.display.local.v1";
export const PANTALLA_LOCAL_EVENT = "starseed:pantalla-local-changed";

export interface AjustesPantallaLocal {
    opacity?: number;
    overlayOpacity?: number;
    intensity?: number;
    livingVariant?: string;
}

function acotarUnidad(v: unknown): number | undefined {
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    return Math.min(1, Math.max(0, v));
}

export function sanearPantallaLocal(bruto: unknown): AjustesPantallaLocal {
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
    const o = bruto as Record<string, unknown>;
    const salida: AjustesPantallaLocal = {};
    const opacity = acotarUnidad(o.opacity);
    if (opacity !== undefined) salida.opacity = opacity;
    const overlayOpacity = acotarUnidad(o.overlayOpacity);
    if (overlayOpacity !== undefined) salida.overlayOpacity = overlayOpacity;
    const intensity = acotarUnidad(o.intensity);
    if (intensity !== undefined) salida.intensity = intensity;
    if (typeof o.livingVariant === "string" && o.livingVariant.trim()) {
        salida.livingVariant = o.livingVariant.trim().slice(0, 48);
    }
    return salida;
}

export function leerPantallaLocal(): AjustesPantallaLocal {
    if (typeof window === "undefined") return {};
    try {
        const t = window.localStorage.getItem(PANTALLA_LOCAL_KEY);
        if (!t) return {};
        return sanearPantallaLocal(JSON.parse(t));
    } catch {
        return {};
    }
}

export function guardarPantallaLocal(parche: Partial<AjustesPantallaLocal>): AjustesPantallaLocal {
    const actual = leerPantallaLocal();
    const combinado: AjustesPantallaLocal = { ...actual };
    if ("opacity" in parche) {
        const v = acotarUnidad(parche.opacity);
        if (v !== undefined) combinado.opacity = v;
        else delete combinado.opacity;
    }
    if ("overlayOpacity" in parche) {
        const v = acotarUnidad(parche.overlayOpacity);
        if (v !== undefined) combinado.overlayOpacity = v;
        else delete combinado.overlayOpacity;
    }
    if ("intensity" in parche) {
        const v = acotarUnidad(parche.intensity);
        if (v !== undefined) combinado.intensity = v;
        else delete combinado.intensity;
    }
    if ("livingVariant" in parche) {
        if (typeof parche.livingVariant === "string" && parche.livingVariant.trim()) {
            combinado.livingVariant = parche.livingVariant.trim().slice(0, 48);
        } else {
            delete combinado.livingVariant;
        }
    }
    const limpio = sanearPantallaLocal(combinado);
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(PANTALLA_LOCAL_KEY, JSON.stringify(limpio));
            window.dispatchEvent(new CustomEvent(PANTALLA_LOCAL_EVENT));
        } catch {
            /* cuota o entorno sin escritura: el retorno mantiene el valor en memoria */
        }
    }
    return limpio;
}

export function limpiarPantallaLocal(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(PANTALLA_LOCAL_KEY);
        window.dispatchEvent(new CustomEvent(PANTALLA_LOCAL_EVENT));
    } catch {
        /* ignorar si localStorage no está disponible */
    }
}

export function suscribirPantallaLocal(cb: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const alCambiar = () => cb();
    const alStorage = (e: StorageEvent) => {
        if (e.key === null || e.key === PANTALLA_LOCAL_KEY) cb();
    };
    window.addEventListener(PANTALLA_LOCAL_EVENT, alCambiar);
    window.addEventListener("storage", alStorage);
    return () => {
        window.removeEventListener(PANTALLA_LOCAL_EVENT, alCambiar);
        window.removeEventListener("storage", alStorage);
    };
}
