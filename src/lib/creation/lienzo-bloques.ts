// src/lib/creation/lienzo-bloques.ts
// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN Y SERIALIZACIÓN de los bloques del Lienzo Universal.
//
// Vive aparte del compositor (`lienzo-composer.tsx`, "use client") para poder
// probarse como módulo puro: entrada → salida, sin React, sin DOM y sin red.
// El compositor lo usa y reexporta `blockHasContent` por compatibilidad con los
// llamadores que ya lo importaban de allí.
//
// Un bloque RICO cuenta como contenido sólo si el campo que de verdad usa su
// tipo tiene algo útil. Esto se alinea con `serializeBlock` (post-blocks.ts):
// nada de NaN/Infinity en coordenadas, nada de referencias sin id y nada de
// gráficas con la fila por defecto (etiqueta vacía y valor 0) contando como si
// el autor hubiera escrito algo.
// ─────────────────────────────────────────────────────────────────────────────

import {
    isRichBlock,
    serializeBlocks,
    type PostBlock,
    type PostBlockRefKind,
} from "@/lib/creation/post-blocks";

/** Tipos de referencia que apuntan a una ENTIDAD de la red (incluye `event` = evento). */
export const ENTIDAD_REF_KINDS: readonly PostBlockRefKind[] = [
    "page",
    "profile",
    "group",
    "community",
    "event",
] as const;

/** ¿Hay texto con algo visible (no vacío ni sólo espacios)? */
function tieneTexto(v: string | null | undefined): boolean {
    return typeof v === "string" && v.trim().length > 0;
}

/** ¿Es un número real (rechaza undefined, NaN e Infinity)? */
function esNumeroFinito(v: number | null | undefined): boolean {
    return typeof v === "number" && Number.isFinite(v);
}

/** ¿La referencia enlaza un recurso con id y, si es `entidad`, un tipo válido? */
export function refConContenido(b: PostBlock): boolean {
    const ref = b.ref;
    if (!ref || typeof ref !== "object") return false;
    if (!tieneTexto(ref.id)) return false;
    if (b.type === "entidad") return ENTIDAD_REF_KINDS.includes(ref.kind);
    return true;
}

/** ¿El bloque tiene contenido significativo (para validar antes de publicar)? */
export function blockHasContent(b: PostBlock): boolean {
    switch (b.type) {
        case "texto":
        case "enlace":
            return tieneTexto(b.text) || tieneTexto(b.url);
        case "imagen":
        case "archivo":
        case "portada":
        case "widget":
        case "repo":
        case "pizarra":
        // Penpot es el bloque de prototipos de diseño: se valida por su URL.
        case "penpot":
        case "video":
            return tieneTexto(b.url);
        case "codigo":
        case "pagina":
        case "protomolecula":
        // Respuesta viva (OpenUI): el texto vive en `code`.
        case "respuesta-viva":
            return tieneTexto(b.code);
        case "agente":
            return tieneTexto(b.system) || tieneTexto(b.name) || tieneTexto(b.persona);
        case "mapa":
            return esNumeroFinito(b.lat) && esNumeroFinito(b.lng);
        case "grafica":
            return (
                Array.isArray(b.data) &&
                b.data.some(
                    (d) =>
                        tieneTexto(d?.label) ||
                        (esNumeroFinito(d?.value) && (d?.value ?? 0) !== 0),
                )
            );
        case "referencia":
        case "entidad":
            return refConContenido(b);
        default:
            return false;
    }
}

/**
 * Bloques que viajan en `ss:meta.blocks`: sólo los RICOS, ya limpios por
 * `serializeBlock`. Es el mismo filtro que usaba el compositor, ahora en un
 * único sitio para que validación y serialización no se separen.
 */
export function bloquesRicosParaMeta(blocks: PostBlock[]): PostBlock[] {
    return serializeBlocks((blocks || []).filter((b) => isRichBlock(b.type)));
}
