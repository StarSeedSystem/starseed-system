/**
 * Versiones ⇄ cambios: qué se guarda como «foto» de un documento o una presentación y cómo se
 * restaura una foto sin romper la colaboración. Restaurar NO sustituye el doc: se convierte en
 * cambios por unidad (reescribir las que difieren, revivir las borradas, poner lápida a las que no
 * estaban), con sellos nuevos, así que viaja a los demás como una edición más y se puede deshacer.
 * Puro.
 */

import {
    jsonEstable,
    leerRegistro,
    leerUnidad,
    serializarUnidad,
    visibles,
    type CambioUnidad,
    type UnidadColab,
} from "./modelo";

export interface ContenidoVersion {
    app: string;
    v: 1;
    unidades: Record<string, unknown>[];
    meta: unknown;
}

/** La foto de lo visible ahora (sin lápidas). */
export function contenidoDeVersion<P, M>(app: string, unidadesVisibles: UnidadColab<P>[], meta: M): ContenidoVersion {
    return { app, v: 1, unidades: unidadesVisibles.map(serializarUnidad), meta: { valor: meta, actualizado: 0, autor: "version" } };
}

export interface Restauracion<P, M> {
    cambios: CambioUnidad<P>[];
    meta: M | null;
}

/**
 * Cambios que dejan el documento como en la foto. null si la foto no es de esta app o no se
 * entiende. `todas` = todas las versiones vigentes (incluidas las borradas).
 */
export function cambiosParaRestaurar<P, M>(
    contenido: unknown,
    app: string,
    todas: UnidadColab<P>[],
    validarDatos: (d: unknown) => P | null,
    validarMeta: (m: unknown) => M | null,
): Restauracion<P, M> | null {
    if (!contenido || typeof contenido !== "object" || Array.isArray(contenido)) return null;
    const c = contenido as Record<string, unknown>;
    if (c.app !== app || !Array.isArray(c.unidades)) return null;
    const objetivo = new Map<string, UnidadColab<P>>();
    for (const raw of c.unidades) {
        const u = leerUnidad(raw, validarDatos);
        if (u && !u.borrado && u.datos !== undefined) objetivo.set(u.id, u);
    }
    const porId = new Map(todas.map((u) => [u.id, u]));
    const cambios: CambioUnidad<P>[] = [];
    for (const [id, u] of objetivo) {
        const ahora = porId.get(id);
        const igual = ahora && !ahora.borrado && ahora.orden === u.orden && jsonEstable(ahora.datos) === jsonEstable(u.datos);
        if (!igual) cambios.push({ id, datos: u.datos, orden: u.orden, borrar: false });
    }
    for (const u of visibles(todas)) if (!objetivo.has(u.id)) cambios.push({ id: u.id, borrar: true });
    const meta = leerRegistro(c.meta, validarMeta)?.valor ?? null;
    return { cambios, meta };
}
