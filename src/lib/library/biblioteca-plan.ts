/*
 * biblioteca-plan — PLANIFICAR operaciones de la Biblioteca SIN ejecutar nada.
 *
 * Patrón tomado de Spacedrive v2: validar → vista previa → ejecutar → deshacer.
 * Este módulo es PURO (sin red, disco ni reloj) y trabaja sobre instantáneas de
 * `EntityLibraryDoc` que entran por parámetro. Los permisos también entran por
 * parámetro: aquí no se calculan identidades ni ACL.
 *
 * Invariantes del OS que este plan respeta:
 *   · Entidad Única: se referencia, no se duplica el contenido.
 *   · Ningún borrado se propaga solo: quitar y mover son reversibles (lápida).
 *   · Fusionar nunca borra y deduplicar solo PROPONE; la persona confirma.
 */

import type { EntityLibraryDoc, EntityRef, SavedItem } from "./entity-library";

export type TipoOperacionBiblioteca = "copiar" | "mover" | "fusionar" | "quitar" | "deduplicar";

export interface OperacionBiblioteca {
    tipo: TipoOperacionBiblioteca;
    origen: EntityRef;
    destino?: EntityRef;
    itemIds?: string[];
}

export interface PasoDeshacer {
    op: "quitar" | "restaurar" | "mover";
    ref: EntityRef;
    itemId: string;
    haciaCarpeta?: string | null;
}

export interface ValidacionPlan {
    ok: boolean;
    errores: string[];
    avisos: string[];
}

export interface VistaPreviaPlan {
    crea: string[];
    modifica: string[];
    omite: { id: string; motivo: string }[];
    quitaReversible: string[];
    ultimaCopia: string[];
}

export interface PlanBiblioteca {
    operacion: OperacionBiblioteca;
    validacion: ValidacionPlan;
    vistaPrevia: VistaPreviaPlan;
    deshacer: PasoDeshacer[];
}

export interface PermisosBiblioteca {
    puedeVer(ref: EntityRef, item?: string): boolean;
    puedeEditar(ref: EntityRef, item?: string): boolean;
}

export function planificar(
    op: OperacionBiblioteca,
    instantaneas: Record<string, EntityLibraryDoc>,
    permisos: PermisosBiblioteca
): PlanBiblioteca {
    return construirPlan(op, instantaneas, permisos);
}

export function resumenPlan(plan: PlanBiblioteca): string {
    return construirResumen(plan);
}

const clave = (ref: EntityRef): string => `${ref.kind}:${ref.id}`;

const mismaEntidad = (a: EntityRef, b: EntityRef): boolean => a.kind === b.kind && a.id === b.id;

/** Comparación por unidades de código: no depende del idioma del navegador. */
const compararTexto = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Motivo legible: distingue una denegación por ACL de una falta de permiso general. */
function motivoPermiso(item: SavedItem, accion: "ver" | "editar"): string {
    const porAcl = accion === "ver" ? (item.acl?.read?.length ?? 0) > 0 : (item.acl?.write?.length ?? 0) > 0;
    return porAcl
        ? `el ACL del elemento no permite ${accion}`
        : `sin permiso para ${accion} el elemento`;
}

/** ¿Hay OTRO documento (fuera del excluido) que conserve la misma referencia o URL? */
function hayOtraCopia(
    item: SavedItem,
    instantaneas: Record<string, EntityLibraryDoc>,
    excluir: EntityLibraryDoc
): boolean {
    const refId = item.refId;
    const url = item.url;
    for (const doc of Object.values(instantaneas)) {
        if (doc === excluir) continue;
        for (const otro of doc.items ?? []) {
            if (refId && otro.refId === refId) return true;
            if (url && otro.url === url) return true;
        }
    }
    return false;
}

/** Conflicto al escribir en el destino: Entidad Única, mismo id o misma referencia. */
function conflictoEnDestino(item: SavedItem, destino: EntityLibraryDoc | undefined): string | null {
    if (!destino) return null;
    for (const otro of destino.items ?? []) {
        if (otro.id === item.id) return "ya existe en el destino con el mismo id";
        if (item.refId && otro.refId === item.refId) return "ya existe en el destino con la misma referencia";
    }
    return null;
}

function construirPlan(
    op: OperacionBiblioteca,
    instantaneas: Record<string, EntityLibraryDoc>,
    permisos: PermisosBiblioteca
): PlanBiblioteca {
    const errores: string[] = [];
    const avisos: string[] = [];
    const crea = new Set<string>();
    const modifica = new Set<string>();
    const omite: { id: string; motivo: string }[] = [];
    const quitaReversible = new Set<string>();
    const ultimaCopia = new Set<string>();
    const deshacer: PasoDeshacer[] = [];

    const origenDoc = instantaneas[clave(op.origen)];
    const destinoDoc = op.destino ? instantaneas[clave(op.destino)] : undefined;
    const ids = Array.from(new Set(op.itemIds ?? [])).sort();

    const necesitaDestino = op.tipo === "copiar" || op.tipo === "mover" || op.tipo === "fusionar";
    const editaOrigen = op.tipo === "mover" || op.tipo === "quitar";

    if (op.destino && mismaEntidad(op.origen, op.destino)) {
        errores.push("El destino no puede ser igual al origen.");
    }
    if (!permisos.puedeVer(op.origen)) {
        errores.push(`Sin permiso para ver la biblioteca de origen (${clave(op.origen)}).`);
    }
    if (!origenDoc) {
        errores.push(`No se encontró la biblioteca de origen (${clave(op.origen)}).`);
    }
    if (editaOrigen && !permisos.puedeEditar(op.origen)) {
        errores.push(`Sin permiso para editar la biblioteca de origen (${clave(op.origen)}).`);
    }
    if (necesitaDestino && !op.destino) {
        errores.push(`La operación «${op.tipo}» necesita una biblioteca de destino.`);
    }
    if (op.destino) {
        if (!permisos.puedeVer(op.destino)) {
            errores.push(`Sin permiso para ver la biblioteca de destino (${clave(op.destino)}).`);
        }
        if (necesitaDestino && !destinoDoc) {
            errores.push(`No se encontró la biblioteca de destino (${clave(op.destino)}).`);
        }
        if (necesitaDestino && !permisos.puedeEditar(op.destino)) {
            errores.push(`Sin permiso para editar la biblioteca de destino (${clave(op.destino)}).`);
        }
    }
    const analizaTodo = op.tipo === "deduplicar" && op.itemIds === undefined;
    if (ids.length === 0 && !analizaTodo) {
        avisos.push("No hay elementos que planificar.");
    }

    if (errores.length > 0 || !origenDoc) {
        return armarPlan(op, errores, avisos, crea, modifica, omite, quitaReversible, ultimaCopia, deshacer);
    }

    const items: SavedItem[] = [];
    if (analizaTodo) {
        items.push(...(origenDoc.items ?? []));
    } else {
        for (const id of ids) {
            const item = (origenDoc.items ?? []).find((it) => it.id === id);
            if (item) items.push(item);
            else errores.push(`El elemento ${id} no existe en la biblioteca de origen.`);
        }
    }
    items.sort((a, b) => compararTexto(a.id, b.id));

    let avisoUltima = false;

    for (const item of items) {
        if (!permisos.puedeVer(op.origen, item.id)) {
            omite.push({ id: item.id, motivo: motivoPermiso(item, "ver") });
            continue;
        }
        if (op.tipo === "deduplicar") continue;

        if (editaOrigen && !permisos.puedeEditar(op.origen, item.id)) {
            omite.push({ id: item.id, motivo: motivoPermiso(item, "editar") });
            continue;
        }
        if (necesitaDestino && op.destino && !permisos.puedeEditar(op.destino, item.id)) {
            omite.push({ id: item.id, motivo: "sin permiso para editar en el destino" });
            continue;
        }

        switch (op.tipo) {
            case "copiar": {
                if (!op.destino) break;
                const conflicto = conflictoEnDestino(item, destinoDoc);
                if (conflicto) {
                    omite.push({ id: item.id, motivo: conflicto });
                    break;
                }
                crea.add(item.id);
                deshacer.push({
                    op: "quitar",
                    ref: op.destino,
                    itemId: item.id,
                    haciaCarpeta: item.folderId ?? null,
                });
                break;
            }
            case "mover": {
                if (!op.destino) break;
                const conflicto = conflictoEnDestino(item, destinoDoc);
                if (conflicto) {
                    omite.push({ id: item.id, motivo: conflicto });
                    break;
                }
                quitaReversible.add(item.id);
                deshacer.push({
                    op: "mover",
                    ref: op.origen,
                    itemId: item.id,
                    haciaCarpeta: item.folderId ?? null,
                });
                if (!hayOtraCopia(item, instantaneas, origenDoc)) {
                    ultimaCopia.add(item.id);
                    avisoUltima = true;
                }
                break;
            }
            case "quitar": {
                quitaReversible.add(item.id);
                deshacer.push({
                    op: "restaurar",
                    ref: op.origen,
                    itemId: item.id,
                    haciaCarpeta: item.folderId ?? null,
                });
                if (!hayOtraCopia(item, instantaneas, origenDoc)) {
                    ultimaCopia.add(item.id);
                    avisoUltima = true;
                }
                break;
            }
            case "fusionar": {
                if (!op.destino || !destinoDoc) break;
                const existente = (destinoDoc.items ?? []).find(
                    (it) => it.id === item.id || (item.refId ? it.refId === item.refId : false)
                );
                if (existente) {
                    modifica.add(existente.id);
                    deshacer.push({
                        op: "restaurar",
                        ref: op.destino,
                        itemId: existente.id,
                        haciaCarpeta: existente.folderId ?? null,
                    });
                } else {
                    crea.add(item.id);
                    deshacer.push({
                        op: "quitar",
                        ref: op.destino,
                        itemId: item.id,
                        haciaCarpeta: item.folderId ?? null,
                    });
                }
                break;
            }
        }
    }

    if (op.tipo === "deduplicar") {
        proponerDuplicados(items, omite, instantaneas, modifica, avisos);
    }
    if (avisoUltima) {
        avisos.push("es la última copia: haz una antes de quitarla");
    }

    return armarPlan(op, errores, avisos, crea, modifica, omite, quitaReversible, ultimaCopia, deshacer);
}

function clavesDeDuplicado(item: SavedItem): string[] {
    const claves: string[] = [];
    if (item.refId) claves.push(`ref:${item.refId}`);
    if (item.url) claves.push(`url:${item.url}`);
    if (item.title) claves.push(`titulo:${item.type}:${item.title.trim().toLowerCase()}`);
    return claves;
}

/** Última copia REAL: su recurso no aparece en ningún otro ítem de ninguna instantánea. */
function esRepresentacionUnica(
    item: SavedItem,
    instantaneas: Record<string, EntityLibraryDoc>
): boolean {
    const claves = clavesDeDuplicado(item);
    if (claves.length === 0) return true;
    for (const claveItem of claves) {
        let copias = 0;
        for (const doc of Object.values(instantaneas)) {
            for (const otro of doc.items ?? []) {
                if (clavesDeDuplicado(otro).includes(claveItem)) copias += 1;
            }
        }
        if (copias > 1) return false;
    }
    return true;
}

function proponerDuplicados(
    items: SavedItem[],
    omite: { id: string; motivo: string }[],
    instantaneas: Record<string, EntityLibraryDoc>,
    modifica: Set<string>,
    avisos: string[]
): void {
    const omitidos = new Set(omite.map((o) => o.id));
    const grupos = new Map<string, SavedItem[]>();
    for (const item of items) {
        if (omitidos.has(item.id)) continue;
        for (const claveItem of clavesDeDuplicado(item)) {
            const grupo = grupos.get(claveItem) ?? [];
            grupo.push(item);
            grupos.set(claveItem, grupo);
        }
    }
    const sobrantes = new Set<string>();
    for (const grupo of grupos.values()) {
        if (grupo.length < 2) continue;
        const orden = grupo.slice().sort((a, b) => compararTexto(a.id, b.id));
        for (let i = 1; i < orden.length; i += 1) sobrantes.add(orden[i].id);
    }
    for (const id of sobrantes) {
        const item = items.find((it) => it.id === id);
        if (item && !esRepresentacionUnica(item, instantaneas)) modifica.add(id);
    }
    if (modifica.size > 0) {
        avisos.push("Solo es una propuesta: no se quita nada sin confirmación humana.");
    }
}

function armarPlan(
    op: OperacionBiblioteca,
    errores: string[],
    avisos: string[],
    crea: Set<string>,
    modifica: Set<string>,
    omite: { id: string; motivo: string }[],
    quitaReversible: Set<string>,
    ultimaCopia: Set<string>,
    deshacer: PasoDeshacer[]
): PlanBiblioteca {
    const ordenarIds = (ids: Set<string>): string[] => Array.from(ids).sort();
    const omiteOrdenado = omite
        .slice()
        .sort((a, b) => compararTexto(a.id, b.id) || compararTexto(a.motivo, b.motivo));
    const deshacerOrdenado = deshacer
        .slice()
        .sort((a, b) => compararTexto(a.itemId, b.itemId) || compararTexto(a.op, b.op));
    return {
        operacion: op,
        validacion: { ok: errores.length === 0, errores, avisos },
        vistaPrevia: {
            crea: ordenarIds(crea),
            modifica: ordenarIds(modifica),
            omite: omiteOrdenado,
            quitaReversible: ordenarIds(quitaReversible),
            ultimaCopia: ordenarIds(ultimaCopia),
        },
        deshacer: deshacerOrdenado,
    };
}

function construirResumen(plan: PlanBiblioteca): string {
    const { crea, modifica, omite, quitaReversible, ultimaCopia } = plan.vistaPrevia;
    const trozo = (n: number, singular: string, plural: string): string =>
        `${n} ${n === 1 ? singular : plural}`;
    const partes: string[] = [];

    switch (plan.operacion.tipo) {
        case "copiar":
            if (crea.length) partes.push(`Copiarías ${trozo(crea.length, "elemento", "elementos")}`);
            break;
        case "mover":
            if (quitaReversible.length) {
                partes.push(`Moverías ${trozo(quitaReversible.length, "elemento", "elementos")}`);
            }
            break;
        case "fusionar": {
            const total = crea.length + modifica.length;
            if (total) partes.push(`Fusionarías ${trozo(total, "elemento", "elementos")}`);
            break;
        }
        case "quitar":
            if (quitaReversible.length) {
                partes.push(`Quitarías ${trozo(quitaReversible.length, "elemento", "elementos")} (reversible)`);
            }
            break;
        case "deduplicar":
            if (modifica.length) {
                partes.push(`Propondrías quitar ${trozo(modifica.length, "duplicado", "duplicados")}`);
            }
            break;
    }
    if (omite.length) partes.push(`omitiría ${trozo(omite.length, "elemento", "elementos")}`);
    if (ultimaCopia.length) {
        partes.push(`avisaría de ${trozo(ultimaCopia.length, "última copia", "últimas copias")}`);
    }
    if (partes.length === 0) {
        if (!plan.validacion.ok) {
            return `No se puede planificar: ${plan.validacion.errores[0] ?? "error desconocido"}.`;
        }
        return "No hay cambios que planificar.";
    }
    return `${partes.join(", ")}.`;
}
