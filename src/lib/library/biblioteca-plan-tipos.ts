/**
 * Tipos y ayudas compartidas de `biblioteca-plan` (módulo puro).
 * Patrón Spacedrive v2: validar → vista previa → ejecutar → deshacer.
 * Solo `import type` de entity-library; sin red, ni disco, ni reloj.
 */

import type { EntityLibraryDoc, SavedItem } from "./entity-library";
import type { EntityRef } from "@/lib/sync/entity-state";

/** Tipos de operación planificable. `deduplicar` SOLO propone: no quita nada. */
export type TipoOperacion = "copiar" | "mover" | "fusionar" | "quitar" | "deduplicar";

export interface OperacionBiblioteca {
    tipo: TipoOperacion;
    origen: EntityRef;
    /** Biblioteca de destino (copiar/mover/fusionar). */
    destino?: EntityRef;
    /** Ids concretos; ausente = todos del origen. `deduplicar` lo ignora. */
    itemIds?: string[];
}

/** Un paso reversible: lo que habría que hacer para DESHACER la operación. */
export interface PasoDeshacer {
    op: "quitar" | "restaurar" | "mover";
    ref: EntityRef;
    itemId: string;
    haciaCarpeta?: string | null;
}

/** Permisos calculados FUERA; `item === undefined` = la biblioteca entera. */
export interface PermisosBiblioteca {
    puedeVer(ref: EntityRef, item: SavedItem): boolean;
    puedeEditar(ref: EntityRef, item?: SavedItem): boolean;
}

export interface PlanBiblioteca {
    operacion: OperacionBiblioteca;
    validacion: { ok: boolean; errores: string[]; avisos: string[] };
    vistaPrevia: {
        crea: string[];
        modifica: string[];
        omite: { id: string; motivo: string }[];
        quitaReversible: string[];
        ultimaCopia: string[];
    };
    /** Diario de deshacer: pasos en orden, ejecutables contra el ref nombrado. */
    deshacer: PasoDeshacer[];
}

export const AVISO_ULTIMA = "es la última copia: haz una antes de quitarla";
export const AVISO_SOLO_PROPONE = "La deduplicación solo propone: no se quita nada sin confirmación humana.";

/** Clave de una biblioteca dentro de las instantáneas. */
export const claveRef = (r: EntityRef): string => `${r.kind}:${r.id}`;

/** Dos ítems apuntan al mismo contenido: mismo refId o misma url (Entidad Única). */
export const comparten = (a: SavedItem, b: SavedItem): boolean =>
    (!!a.refId && a.refId === b.refId) || (!!a.url && a.url === b.url);

/** true si quitar `item` dejaría la ÚLTIMA copia viva entre todas las instantáneas. */
export function esUltimaCopia(item: SavedItem, todas: EntityLibraryDoc[]): boolean {
    if (!item.refId && !item.url) return true; // sin referencia rastreable: se advierte siempre
    return !todas.some((d) => d.items.some((o) => o.id !== item.id && comparten(item, o)));
}

/** Clave de deduplicación: refId, luego url, luego título+tipo. */
export function claveDedupe(it: SavedItem): string {
    if (it.refId) return `ref:${it.refId}`;
    if (it.url) return `url:${it.url}`;
    return `titulo:${it.title}::${it.type}`;
}

/** Resumen breve en español para personas. */
export function resumenPlan(plan: PlanBiblioteca): string {
    const v = plan.vistaPrevia;
    const omite = v.omite.length ? `, omitirías ${v.omite.length}` : "";
    const ult = v.ultimaCopia.length ? ` (ojo: ${v.ultimaCopia.length} quedaría en última copia)` : "";
    switch (plan.operacion.tipo) {
        case "copiar": return `Copiarías ${v.crea.length}${omite}.`;
        case "mover": return `Moverías ${v.crea.length}${omite}${ult}: reversible con lápida.`;
        case "quitar": return `Quitarías ${v.quitaReversible.length}${omite}${ult}: reversible con lápida.`;
        case "fusionar":
            return `Fusionarías ${v.crea.length} (solo lo que falta en el destino)${omite}: no se borra nada.`;
        case "deduplicar":
            return `Deduplicarías ${v.modifica.length}, sin quitar nada sin tu confirmación${omite}.`;
    }
}

/** Listas acumuladas durante la planificación. */
export interface Acumulador {
    crea: string[]; modifica: string[]; omite: { id: string; motivo: string }[];
    quita: string[]; ultimas: string[]; deshacer: PasoDeshacer[]; errores: string[]; avisos: string[];
}

/** Ensambla el plan: con errores la vista previa queda vacía (nada se ejecuta). */
export function armarPlan(op: OperacionBiblioteca, l: Acumulador): PlanBiblioteca {
    const vacio = l.errores.length > 0;
    const ids = (xs: string[]) => Array.from(new Set(xs)).sort();
    const omOrden = (xs: Acumulador["omite"]) =>
        [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.motivo.localeCompare(b.motivo)));
    const pasos = (xs: PasoDeshacer[]) =>
        [...xs].sort(
            (a, b) =>
                claveRef(a.ref).localeCompare(claveRef(b.ref)) ||
                (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : a.op.localeCompare(b.op)),
        );
    return {
        operacion: op,
        validacion: { ok: !vacio, errores: l.errores, avisos: vacio ? [] : Array.from(new Set(l.avisos)) },
        vistaPrevia: {
            crea: vacio ? [] : ids(l.crea),
            modifica: vacio ? [] : ids(l.modifica),
            omite: vacio ? [] : omOrden(l.omite),
            quitaReversible: vacio ? [] : ids(l.quita),
            ultimaCopia: vacio ? [] : ids(l.ultimas),
        },
        deshacer: vacio ? [] : pasos(l.deshacer),
    };
}
