// ════════════════════════════════════════════════════════════════════════
// StarSeed OS — Plan de la Biblioteca · tipos y utilidades puras (Ola 1025R · INF1025G)
// Contrato de la ola: architecture/repos-libreria-1025.md (§3, Spacedrive).
// ════════════════════════════════════════════════════════════════════════

import type { EntityRef, EntityLibraryDoc, SavedItem } from "./entity-library";

export type TipoOperacion = "copiar" | "mover" | "fusionar" | "quitar" | "deduplicar";

/** Operación a planificar entre bibliotecas de perfiles, grupos y páginas. */
export interface OperacionBiblioteca {
    tipo: TipoOperacion;
    origen: EntityRef;
    destino?: EntityRef;
    /** Ítems concretos; si falta, valen todos los del origen. */
    itemIds?: string[];
}

/** Paso del diario para deshacer (mover vuelve con su carpeta; quitar restaura la lápida). */
export interface PasoDeshacer {
    op: "quitar" | "restaurar" | "mover";
    ref: EntityRef;
    itemId: string;
    haciaCarpeta?: string | null;
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
    deshacer: PasoDeshacer[];
}

/** Permisos resueltos POR QUIEN LLAMA (el plan no los adivina). */
export interface PermisosBiblioteca {
    puedeVer(ref: EntityRef, item?: SavedItem): boolean;
    puedeEditar(ref: EntityRef, item?: SavedItem): boolean;
}

export const claveRef = (r: EntityRef): string => `${r.kind}:${r.id}`;
export const ordenar = (ids: string[]): string[] => [...ids].sort((a, b) => a.localeCompare(b));
export const ordenarOmite = (o: { id: string; motivo: string }[]) => [...o].sort((a, b) => a.id.localeCompare(b.id));

export function seleccion(items: SavedItem[], ids?: string[]): SavedItem[] {
    if (!ids) return items;
    const quiero = new Set(ids);
    return items.filter((it) => quiero.has(it.id));
}

/** ¿El destino ya tiene el mismo id o la misma referencia (Entidad Única)? */
export function choqueEn(destino: EntityLibraryDoc, it: SavedItem): string | null {
    if (destino.items.some((o) => o.id === it.id)) return "el destino ya tiene un ítem con ese mismo id";
    if (it.refId && destino.items.some((o) => o.refId === it.refId))
        return "el destino ya guarda esta referencia (Entidad Única: se referencia, no se duplica)";
    return null;
}

/** true si, fuera de este ítem, NINGUNA copia conocida conserva su mismo refId o url. */
export function ceroCopiasAdemas(it: SavedItem, instantaneas: Record<string, EntityLibraryDoc>): boolean {
    return Object.values(instantaneas).every(
        (d) =>
            !d.items.some(
                (o) => o.id !== it.id && ((!!it.refId && o.refId === it.refId) || (!!it.url && o.url === it.url)),
            ),
    );
}
