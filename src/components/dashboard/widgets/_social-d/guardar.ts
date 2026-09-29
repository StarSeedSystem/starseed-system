"use client";
/**
 * «Guardar en tu biblioteca» desde un widget (Ola 0929 · D): una REFERENCIA en la biblioteca de la
 * cuenta (Entidad Única, nunca una copia), la misma que guarda la tarjeta de /network. El módulo
 * de la biblioteca es grande: se carga solo al pulsar.
 */
export type ResultadoGuardar = "ok" | "sin-sesion" | "fallo";

export interface ElementoGuardable {
    tipo: "post" | "page" | "file" | "route" | "external";
    refId?: string;
    ruta?: string;
    url?: string;
    titulo: string;
    miniatura?: string | null;
}

export async function guardarEnBiblioteca(e: ElementoGuardable): Promise<ResultadoGuardar> {
    try {
        const [{ currentUserRef }, { saveItem }] = await Promise.all([
            import("@/lib/sync/entity-state"),
            import("@/lib/library/entity-library"),
        ]);
        const yo = await currentUserRef();
        if (!yo) return "sin-sesion";
        const r = await saveItem(yo, {
            type: e.tipo,
            refId: e.refId,
            route: e.ruta,
            url: e.url,
            title: e.titulo.slice(0, 120) || "Guardado desde el tablero",
            thumbnail: e.miniatura ?? undefined,
        });
        return r.ok ? "ok" : "fallo";
    } catch {
        return "fallo";
    }
}
