// src/lib/library/adjunto-publicacion.ts
// Handoff SEGURO de un ítem de la Biblioteca hacia /publish: solo se recortan
// los campos necesarios y el cuerpo JSON se guarda en la pestaña; la URL lleva
// la marca mínima `?attach=1`. Nada sensible viaja en la barra de direcciones.
// Las portadas son PNG locales (geometría sagrada: flor de la vida, vesica
// piscis y espiral áurea), nunca un servicio externo con títulos en la URL.

export interface AdjuntoPublicacion {
    title: string;
    url?: string;
    route?: string;
    note?: string;
}

/** Contrato mínimo de un almacén web (sessionStorage lo cumple tal cual). */
export interface AlmacenAdjuntos {
    getItem(clave: string): string | null;
    setItem(clave: string, valor: string): void;
    removeItem(clave: string): void;
}

export const CLAVE_ADJUNTO_PUBLICACION = "starseed.publish.attach.v1";
export const RUTA_PUBLICACION_SEGURA = "/publish?attach=1";

const LIMITES = { title: 160, url: 2048, route: 2048, note: 500 } as const;

const PORTADAS: Record<string, string> = {
    app: "/library-covers/portada-violeta.png",
    personalidad: "/library-covers/portada-violeta.png",
    cerebro: "/library-covers/portada-cian.png",
    widget: "/library-covers/portada-esmeralda.png",
    plantilla: "/library-covers/portada-esmeralda.png",
    calendario: "/library-covers/portada-esmeralda.png",
    tema: "/library-covers/portada-ambar.png",
    recurso: "/library-covers/portada-ambar.png",
};

/** Portada local por contexto; las categorías desconocidas caen a «recurso». */
export function portadaLocalDeCategoria(categoria: string): string {
    return PORTADAS[categoria] ?? PORTADAS.recurso;
}

function texto(valor: unknown, limite: number): string {
    return typeof valor === "string" ? valor.trim().slice(0, limite) : "";
}

/** Deja solo los campos imprescindibles; devuelve null si no hay destino abrible. */
export function recortarAdjunto(
    entrada: Record<string, unknown> | null | undefined,
): AdjuntoPublicacion | null {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return null;

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

/** JSON del cuerpo que se guarda en la pestaña (nunca va en la URL). */
export function serializarAdjunto(adjunto: AdjuntoPublicacion): string {
    return JSON.stringify(adjunto);
}

function almacenDelNavegador(): AlmacenAdjuntos | null {
    if (typeof window === "undefined") return null;
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

/** Guarda el adjunto para /publish. Best-effort: sin almacén devuelve false. */
export function guardarAdjunto(
    adjunto: AdjuntoPublicacion,
    almacen?: AlmacenAdjuntos | null,
): boolean {
    const destino = almacen ?? almacenDelNavegador();
    if (!destino) return false;
    try {
        destino.setItem(CLAVE_ADJUNTO_PUBLICACION, serializarAdjunto(adjunto));
        return true;
    } catch {
        return false;
    }
}

/** Lee y borra el adjunto pendiente (un solo uso). Nunca lanza. */
export function consumirAdjunto(almacen?: AlmacenAdjuntos | null): AdjuntoPublicacion | null {
    const origen = almacen ?? almacenDelNavegador();
    if (!origen) return null;

    let crudo: string | null = null;
    try {
        crudo = origen.getItem(CLAVE_ADJUNTO_PUBLICACION);
    } catch {
        return null;
    }
    try {
        origen.removeItem(CLAVE_ADJUNTO_PUBLICACION);
    } catch {
        /* almacén bloqueado: no impide seguir con el compositor */
    }
    if (!crudo) return null;

    try {
        return recortarAdjunto(JSON.parse(crudo) as Record<string, unknown>);
    } catch {
        return null;
    }
}
