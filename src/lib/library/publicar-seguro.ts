// src/lib/library/publicar-seguro.ts
// Handoff seguro de un ítem de la Biblioteca hacia /publish: el payload sale por
// POST (cuerpo JSON) y en la pestaña queda solo la referencia saneada; la URL
// lleva un flag sin datos (nada en historial ni logs). Portadas locales, sin
// enviar títulos a servicios externos de portadas. Módulo puro: el almacén se inyecta.
/** Clave de sessionStorage donde se deja el adjunto pendiente (un solo uso). */
export const CLAVE_ADJUNTO_PUBLICACION = "starseed.publish.adjunto.v1";
export const ENDPOINT_ADJUNTO_PUBLICACION = "/api/publish/adjunto";
export const RUTA_PUBLICACION_SEGURA = "/publish?attach=1";
export interface AdjuntoPublicacion {
    title: string;
    url?: string;
    route?: string;
    note?: string;
}
export interface AlmacenAdjuntos {
    getItem(clave: string): string | null;
    setItem(clave: string, valor: string): void;
    removeItem(clave: string): void;
}
export interface PeticionAdjunto {
    url: string;
    init: RequestInit;
}
const LIMITES = { title: 160, url: 2048, route: 2048, note: 500 } as const;
const PORTADAS_LOCALES: Record<string, string> = {
    app: "/app-icons/nexus.png",
    widget: "/assets/stitch/icons/window-widgets-v1.png",
    tema: "/assets/stitch/icons/organic-dock-v1.png",
    plantilla: "/assets/stitch/icons/liquid-dock-v1.png",
    personalidad: "/app-icons/agent.png",
    cerebro: "/app-icons/audiomorphic.png",
    recurso: "/app-icons/library.png",
    calendario: "/assets/stitch/icons/system-status-v1.png",
};
const PORTADA_RESERVA = "/app-icons/library.png";
function texto(valor: unknown, limite: number): string {
    return typeof valor === "string" ? valor.trim().slice(0, limite) : "";
}
function esRegistro(valor: unknown): valor is Record<string, unknown> {
    return !!valor && typeof valor === "object" && !Array.isArray(valor);
}
export function recortarAdjunto(entrada: unknown): AdjuntoPublicacion | null {
    if (!esRegistro(entrada)) return null;
    const url = texto(entrada.url, LIMITES.url);
    const route = texto(entrada.route, LIMITES.route);
    if (!url && !route) return null;
    const title = texto(entrada.title, LIMITES.title) || "Ítem de la Biblioteca";
    const note = texto(entrada.note, LIMITES.note);
    return {
        title,
        ...(url ? { url } : {}),
        ...(route ? { route } : {}),
        ...(note ? { note } : {}),
    };
}
export function portadaLocalDeCategoria(categoria: string | null | undefined): string {
    const clave = (categoria ?? "").trim().toLowerCase();
    return PORTADAS_LOCALES[clave] || PORTADA_RESERVA;
}
export function serializarAdjunto(adjunto: AdjuntoPublicacion): string {
    return JSON.stringify(adjunto);
}
export function parsearAdjunto(crudo: string | null | undefined): AdjuntoPublicacion | null {
    if (!crudo) return null;
    try {
        return recortarAdjunto(JSON.parse(crudo));
    } catch {
        return null;
    }
}
export function adjuntoDeRespuesta(respuesta: unknown): AdjuntoPublicacion | null {
    return esRegistro(respuesta) ? recortarAdjunto(respuesta.adjunto) : null;
}
export function peticionAdjunto(adjunto: AdjuntoPublicacion): PeticionAdjunto {
    return {
        url: ENDPOINT_ADJUNTO_PUBLICACION,
        init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(adjunto),
            credentials: "same-origin",
            cache: "no-store",
        },
    };
}
export function guardarAdjunto(almacen: AlmacenAdjuntos | null, adjunto: AdjuntoPublicacion): boolean {
    if (!almacen) return false;
    try {
        almacen.setItem(CLAVE_ADJUNTO_PUBLICACION, serializarAdjunto(adjunto));
        return true;
    } catch {
        return false;
    }
}
export function consumirAdjunto(almacen: AlmacenAdjuntos | null): AdjuntoPublicacion | null {
    if (!almacen) return null;
    let crudo: string | null = null;
    try {
        crudo = almacen.getItem(CLAVE_ADJUNTO_PUBLICACION);
        almacen.removeItem(CLAVE_ADJUNTO_PUBLICACION);
    } catch {
        return null;
    }
    return parsearAdjunto(crudo);
}
export function almacenDeSesion(): AlmacenAdjuntos | null {
    if (typeof window === "undefined") return null;
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}
