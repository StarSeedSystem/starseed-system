/**
 * biblioteca-plan — PLANIFICA operaciones de Biblioteca sin ejecutar nada
 * (patrón Spacedrive v2: validar → vista previa → ejecutar → deshacer).
 * Módulo puro: sin red, sin disco, sin reloj; instantáneas y permisos por
 * parámetro. Tipos y ayudas: biblioteca-plan-tipos.ts.
 */
import type { EntityLibraryDoc, SavedItem } from "./entity-library";
import type { EntityRef } from "@/lib/sync/entity-state";
import {
    AVISO_SOLO_PROPONE,
    AVISO_ULTIMA,
    armarPlan,
    claveDedupe,
    claveRef,
    esUltimaCopia,
    type Acumulador,
    type OperacionBiblioteca,
    type PermisosBiblioteca,
    type PlanBiblioteca,
} from "./biblioteca-plan-tipos";

export * from "./biblioteca-plan-tipos";

export function planificar(
    op: OperacionBiblioteca,
    instantaneas: Record<string, EntityLibraryDoc>,
    permisos: PermisosBiblioteca,
): PlanBiblioteca {
    const l: Acumulador = {
        crea: [], modifica: [], omite: [], quita: [], ultimas: [], deshacer: [], errores: [], avisos: [],
    };
    const aDestino = op.tipo === "copiar" || op.tipo === "mover" || op.tipo === "fusionar";
    const origenDoc = instantaneas[claveRef(op.origen)];
    const destinoDoc = op.destino ? instantaneas[claveRef(op.destino)] : undefined;
    // ── Validación estructural: errores en español, nunca silencio ──
    if (!origenDoc) l.errores.push(`No se encontró la biblioteca de origen (${claveRef(op.origen)}).`);
    if (op.destino && claveRef(op.destino) === claveRef(op.origen))
        l.errores.push("El destino es la misma biblioteca que el origen.");
    if (aDestino && !op.destino) l.errores.push("Esta operación necesita una biblioteca de destino.");
    if (aDestino && op.destino && !destinoDoc)
        l.errores.push(`No se encontró la biblioteca de destino (${claveRef(op.destino)}).`);
    if (aDestino && destinoDoc && !permisos.puedeEditar(op.destino!, undefined))
        l.errores.push("No tienes permiso de edición en la biblioteca de destino.");
    if ((op.tipo === "quitar" || op.tipo === "mover") && origenDoc && !permisos.puedeEditar(op.origen, undefined))
        l.errores.push("No tienes permiso de edición en la biblioteca de origen.");
    const activa = !!origenDoc && l.errores.length === 0;
    if (activa && op.tipo === "deduplicar") {
        propuestaDedupe(origenDoc!, op.origen, permisos, Object.values(instantaneas), l);
    } else if (activa) {
        const porId = new Map(origenDoc!.items.map((it) => [it.id, it]));
        for (const id of op.itemIds ?? origenDoc!.items.map((it) => it.id)) {
            const item = porId.get(id);
            if (!item) {
                l.omite.push({ id, motivo: "no está en la biblioteca de origen" });
            } else if (!permisos.puedeVer(op.origen, item)) {
                // Sin permiso de lectura NO se planifica en silencio: es un error.
                l.errores.push(`Sin permiso para ver «${item.title}» (${id}) en el origen.`);
            } else if (!permisos.puedeEditar(op.origen, item)) {
                l.omite.push({ id, motivo: "sin permiso de edición sobre este ítem" });
            } else {
                planItem(op, item, destinoDoc, Object.values(instantaneas), l);
            }
        }
    }
    return armarPlan(op, l);
}

/** Planifica UN ítem: copiar/fusionar crean en el destino; mover/quitar usan lápida. */
function planItem(op: OperacionBiblioteca, item: SavedItem, destinoDoc: EntityLibraryDoc | undefined,
    todas: EntityLibraryDoc[], l: Acumulador,
): void {
    const id = item.id;
    const tiene = (conUrl: boolean): boolean =>
        destinoDoc?.items.some((o) =>
            o.id === id || (!!item.refId && o.refId === item.refId) || (conUrl && !!item.url && o.url === item.url),
        ) ?? false;
    if (op.tipo !== "quitar" && tiene(op.tipo === "fusionar")) {
        l.omite.push({ id, motivo: "el destino ya lo tiene" });
        return;
    }
    if (op.tipo === "quitar" || op.tipo === "mover") {
        l.quita.push(id);
        if (esUltimaCopia(item, todas)) {
            l.ultimas.push(id);
            if (!l.avisos.includes(AVISO_ULTIMA)) l.avisos.push(AVISO_ULTIMA);
        }
        if (op.tipo === "mover" && op.destino) l.deshacer.push({ op: "quitar", ref: op.destino, itemId: id });
        l.deshacer.push({ op: "restaurar", ref: op.origen, itemId: id });
        return;
    }
    // copiar o fusionar: se crea en el destino lo que faltaba.
    l.crea.push(id);
    if (op.destino) l.deshacer.push({ op: "quitar", ref: op.destino, itemId: id });
}

/** deduplicar: agrupa por refId, url o título+tipo y PROPONE quitar los sobrantes. */
function propuestaDedupe(origenDoc: EntityLibraryDoc, origen: EntityRef, permisos: PermisosBiblioteca,
    todas: EntityLibraryDoc[], l: Acumulador,
): void {
    const grupos = new Map<string, SavedItem[]>();
    for (const it of origenDoc.items) {
        const k = claveDedupe(it);
        grupos.set(k, [...(grupos.get(k) ?? []), it]);
    }
    for (const g of grupos.values()) {
        // El primero (id menor) se queda; el resto son sobrantes que se PROPONEN.
        const sobran = [...g].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(1);
        for (const s of sobran) {
            if (!permisos.puedeVer(origen, s)) {
                l.errores.push(`Sin permiso para ver «${s.title}» (${s.id}) en el origen.`);
            } else if (esUltimaCopia(s, todas)) {
                l.ultimas.push(s.id);
                l.omite.push({ id: s.id, motivo: "es la última copia: no se propone quitarla" });
            } else if (!permisos.puedeEditar(origen, s)) {
                l.omite.push({ id: s.id, motivo: "sin permiso de edición sobre este ítem" });
            } else {
                l.modifica.push(s.id);
                l.deshacer.push({ op: "quitar", ref: origen, itemId: s.id });
            }
        }
    }
    if (l.modifica.length > 0 && !l.avisos.includes(AVISO_SOLO_PROPONE)) l.avisos.push(AVISO_SOLO_PROPONE);
}
