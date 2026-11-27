// src/lib/creation/block-content.ts
// ─────────────────────────────────────────────────────────────────────────────
// ¿TIENE CONTENIDO un bloque del Lienzo Universal? (validación PURA)
//
// Vive fuera del compositor para poder probarse sin React, sin DOM y sin red.
// El compositor lo usa antes de publicar: un lienzo sin título solo se publica
// si al menos un bloque tiene contenido real.
//
// «Evento» no es un tipo de bloque aparte: es una ENTIDAD con `ref.kind` =
// "event". La «protomolécula» (prototipo serializado) viaja en `code`. Aquí se
// validan ambos junto con el resto de tipos, sin dejar ninguno al azar.
// ─────────────────────────────────────────────────────────────────────────────

import type {
    PostBlock,
    PostBlockRef,
    PostBlockRefKind,
} from "@/lib/creation/post-blocks";

/** Tipos de recurso que una referencia/entidad puede enlazar. */
const REF_KINDS: readonly PostBlockRefKind[] = [
    "brain",
    "library",
    "folder",
    "file",
    "page",
    "profile",
    "group",
    "community",
    "event",
    "neuron",
    "url",
];

/** Texto con contenido real (no vacío ni solo espacios). */
function conTexto(v: string | null | undefined): boolean {
    return typeof v === "string" && v.trim().length > 0;
}

/** Una referencia es válida si tiene un tipo conocido y un destino no vacío. */
export function refTieneDestino(ref: PostBlockRef | null | undefined): boolean {
    return (
        !!ref &&
        typeof ref.kind === "string" &&
        (REF_KINDS as readonly string[]).includes(ref.kind) &&
        conTexto(ref.id)
    );
}

/** Guardia de exhaustividad: si aparece un tipo nuevo sin validar, tsc falla. */
function inalcanzable(tipo: never): false {
    void tipo;
    return false;
}

/**
 * ¿El bloque tiene contenido significativo? Entrada → salida, sin efectos.
 * - Entidad/referencia (incluido un EVENTO): `ref.kind` conocido + `ref.id`.
 * - Protomolécula (prototipo serializado): `code` no vacío.
 * - Gráfica: al menos una fila con etiqueta o un valor distinto de cero.
 */
export function blockHasContent(b: PostBlock): boolean {
    switch (b.type) {
        case "texto":
        case "enlace":
            return conTexto(b.text) || conTexto(b.url);
        case "imagen":
        case "archivo":
        case "portada":
        case "widget":
        case "repo":
        case "pizarra":
        case "penpot":
        case "video":
            return conTexto(b.url);
        case "codigo":
        case "pagina":
        case "protomolecula":
        case "respuesta-viva":
            return conTexto(b.code);
        case "agente":
            return conTexto(b.system) || conTexto(b.name);
        case "mapa":
            return (
                typeof b.lat === "number" &&
                Number.isFinite(b.lat) &&
                typeof b.lng === "number" &&
                Number.isFinite(b.lng)
            );
        case "grafica":
            return (
                Array.isArray(b.data) &&
                b.data.some(
                    (d) =>
                        conTexto(d?.label) ||
                        (Number.isFinite(d?.value) && d.value !== 0),
                )
            );
        case "referencia":
        case "entidad":
            return refTieneDestino(b.ref);
        default:
            return inalcanzable(b.type);
    }
}
