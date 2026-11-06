// src/lib/library/publicacion-biblioteca.ts
// ─────────────────────────────────────────────────────────────────────────────
// Handoff seguro entre el Finder de la Biblioteca y el compositor /publish.
//
// Antes, el ítem completo viajaba en la querystring (`/publish?attach=<JSON>`):
// quedaba en el historial del navegador, en los logs del servidor y en cualquier
// captura de la URL. Ahora se deja una referencia COMPACTA en el almacenamiento
// de la pestaña (sessionStorage) y la navegación solo lleva un flag `attach=1`.
//
// Portadas: la Biblioteca ya no pide imágenes a placehold.co con el título del
// recurso (eso filtraba el texto a un tercero). Usa arte local del proyecto.
//
// Todo lo de este módulo es puro: no toca red, disco, DOM ni almacenamiento.
// ─────────────────────────────────────────────────────────────────────────────

/** Clave de sessionStorage donde el Finder deja el adjunto pendiente. */
export const ADJUNTO_PUBLICACION_KEY = "starseed.publish.adjunto.v1";

/** Referencia mínima de un recurso de la Biblioteca para el compositor. */
export interface AdjuntoPublicacion {
    kind: string;
    id?: string;
    name: string;
    url?: string;
    route?: string;
    note?: string;
}

/** Entrada tolerante (campos opcionales de un `SavedItem` ya resuelto). */
export interface EntradaAdjuntoPublicacion {
    kind?: string;
    id?: string;
    title?: string;
    url?: string;
    route?: string;
    note?: string;
}

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

function textoOpcional(valor: string | null | undefined): string | undefined {
    const limpio = (valor ?? "").trim();
    return limpio ? limpio : undefined;
}

function nombreDesdeHref(href: string | undefined): string | undefined {
    if (!href) return undefined;
    try {
        const url = new URL(href, "https://starseed.local");
        const ultimo = url.pathname.split("/").filter(Boolean).pop();
        return ultimo || url.hostname || undefined;
    } catch {
        return undefined;
    }
}

/** Portada local determinista por categoría; nunca contiene el título ni sale a la red. */
export function portadaLocalDeCategoria(categoria: string | null | undefined): string {
    const clave = textoOpcional(categoria)?.toLowerCase();
    return (clave && PORTADAS_LOCALES[clave]) || PORTADA_RESERVA;
}

/** Construye la referencia compacta que se deja para /publish; null si no hay nada útil. */
export function crearAdjuntoPublicacion(
    entrada: EntradaAdjuntoPublicacion,
): AdjuntoPublicacion | null {
    const url = textoOpcional(entrada.url);
    const route = textoOpcional(entrada.route);
    const name =
        textoOpcional(entrada.title) ?? nombreDesdeHref(url ?? route);
    if (!name && !url && !route) return null;

    const id = textoOpcional(entrada.id);
    const note = textoOpcional(entrada.note);
    const kind = textoOpcional(entrada.kind) ?? "recurso";
    return {
        kind,
        ...(id ? { id } : {}),
        name: name ?? "Recurso",
        ...(url ? { url } : {}),
        ...(route ? { route } : {}),
        ...(note ? { note } : {}),
    };
}

/** Serializa la referencia para sessionStorage. */
export function serializarAdjuntoPublicacion(adjunto: AdjuntoPublicacion): string {
    return JSON.stringify(adjunto);
}

/** Lee y sanea una referencia guardada; JSON corrupto o vacío devuelve null. */
export function parsearAdjuntoPublicacion(crudo: string | null | undefined): AdjuntoPublicacion | null {
    if (!crudo) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(crudo);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const obj = parsed as Record<string, unknown>;
    const name = typeof obj.name === "string" ? textoOpcional(obj.name) : undefined;
    const url = typeof obj.url === "string" ? textoOpcional(obj.url) : undefined;
    const route = typeof obj.route === "string" ? textoOpcional(obj.route) : undefined;
    if (!name && !url && !route) return null;

    const id = typeof obj.id === "string" ? textoOpcional(obj.id) : undefined;
    const note = typeof obj.note === "string" ? textoOpcional(obj.note) : undefined;
    const kind = typeof obj.kind === "string" ? textoOpcional(obj.kind) : undefined;
    return {
        kind: kind ?? "recurso",
        ...(id ? { id } : {}),
        name: name ?? url ?? route ?? "Recurso",
        ...(url ? { url } : {}),
        ...(route ? { route } : {}),
        ...(note ? { note } : {}),
    };
}
