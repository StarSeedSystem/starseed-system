import type { EntityLibraryDoc, EntityRef, SavedItem } from "./entity-library";

export type OperacionTipo = "copiar" | "mover" | "fusionar" | "quitar" | "deduplicar";

export interface OperacionBiblioteca {
    tipo: OperacionTipo;
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
    puedeVer(ref: EntityRef, item: SavedItem): boolean;
    puedeEditar(ref: EntityRef, item?: SavedItem): boolean;
}

function claveDoc(ref: EntityRef): string {
    return `${ref.kind}:${ref.id}`;
}

function tienePermisoParaLeer(perm: PermisosBiblioteca, ref: EntityRef, item: SavedItem): boolean {
    try {
        return perm.puedeVer(ref, item);
    } catch {
        return false;
    }
}

function tienePermisoParaEditar(perm: PermisosBiblioteca, ref: EntityRef, item?: SavedItem): boolean {
    try {
        return perm.puedeEditar(ref, item);
    } catch {
        return false;
    }
}

function obtenerItem(doc: EntityLibraryDoc, itemId: string): SavedItem | undefined {
    return doc.items.find((it) => it.id === itemId);
}

function otroDocumentoTieneRefId(instantaneas: Record<string, EntityLibraryDoc>, refId?: string, excluirClave?: string): boolean {
    if (!refId) return false;
    for (const [clave, doc] of Object.entries(instantaneas)) {
        if (excluirClave && clave === excluirClave) continue;
        for (const it of doc.items) {
            if (it.refId && it.refId === refId) return true;
            if (it.url && it.url === (undefined as any)) {
                /* no */
            }
        }
    }
    return false;
}

function otroDocumentoTieneUrl(instantaneas: Record<string, EntityLibraryDoc>, url?: string, excluirClave?: string): boolean {
    if (!url) return false;
    for (const [clave, doc] of Object.entries(instantaneas)) {
        if (excluirClave && clave === excluirClave) continue;
        for (const it of doc.items) {
            if (it.url && it.url === url) return true;
        }
    }
    return false;
}

function esUltimaCopia(
    item: SavedItem,
    instantaneas: Record<string, EntityLibraryDoc>,
    claveActual: string,
): boolean {
    if (item.refId && otroDocumentoTieneRefId(instantaneas, item.refId, claveActual)) {
        return false;
    }
    if (item.url && otroDocumentoTieneUrl(instantaneas, item.url, claveActual)) {
        return false;
    }
    if (!item.refId && !item.url) {
        let total = 0;
        for (const [clave, doc] of Object.entries(instantaneas)) {
            if (clave === claveActual) {
                total += doc.items.filter((it) => it.id === item.id || (it.title === item.title && it.type === item.type)).length;
            } else {
                total += doc.items.filter((it) => it.refId && item.refId && it.refId === item.refId).length;
            }
        }
        if (total <= 1) return true;
    }
    if (item.refId && !otroDocumentoTieneRefId(instantaneas, item.refId, claveActual)) {
        return true;
    }
    if (item.url && !otroDocumentoTieneUrl(instantaneas, item.url, claveActual)) {
        return true;
    }
    return false;
}

function dedupKey(item: SavedItem): string {
    if (item.refId) return `ref:${item.refId}`;
    if (item.url) return `url:${item.url}`;
    return `t:${item.title}|${item.type}`;
}

export function planificar(
    op: OperacionBiblioteca,
    instantaneas: Record<string, EntityLibraryDoc>,
    permisos: PermisosBiblioteca,
): PlanBiblioteca {
    const validacion: ValidacionPlan = { ok: true, errores: [], avisos: [] };
    const vistaPrevia: VistaPreviaPlan = {
        crea: [],
        modifica: [],
        omite: [],
        quitaReversible: [],
        ultimaCopia: [],
    };
    const deshacer: PasoDeshacer[] = [];

    const claveOrigen = claveDoc(op.origen);
    const docOrigen = instantaneas[claveOrigen];

    if (!docOrigen) {
        validacion.ok = false;
        validacion.errores.push("No existe el documento de origen.");
        return { operacion: op, validacion, vistaPrevia, deshacer };
    }

    const itemsOrigen: SavedItem[] = op.itemIds && op.itemIds.length > 0
        ? op.itemIds.map((id) => obtenerItem(docOrigen, id)).filter((x): x is SavedItem => Boolean(x))
        : docOrigen.items;

    for (const item of itemsOrigen) {
        if (!tienePermisoParaVerItem(permisos, op.origen, item)) {
            validacion.ok = false;
            validacion.errores.push("Sin permiso para ver el elemento.");
            break;
        }
    }

    if (!validacion.ok) {
        return { operacion: op, validacion, vistaPrevia, deshacer };
    }

    if (op.tipo === "copiar" || op.tipo === "mover") {
        if (!op.destino) {
            validacion.ok = false;
            validacion.errores.push("Falta el destino.");
            return { operacion: op, validacion, vistaPrevia, deshacer };
        }
        const claveDestino = claveDoc(op.destino);
        if (claveDestino === claveOrigen) {
            validacion.ok = false;
            validacion.errores.push("El destino debe ser distinto al origen.");
            return { operacion: op, validacion, vistaPrevia, deshacer };
        }
        const docDestino = instantaneas[claveDestino];
        if (!docDestino) {
            validacion.ok = false;
            validacion.errores.push("No existe el documento de destino.");
            return { operacion: op, validacion, vistaPrevia, deshacer };
        }
        for (const item of itemsOrigen) {
            if (!tienePermisoParaEditar(permisos, op.destino, item)) {
                validacion.ok = false;
                validacion.errores.push("Sin permiso para editar en destino.");
                break;
            }
        }
        if (!validacion.ok) {
            return { operacion: op, validacion, vistaPrevia, deshacer };
        }

        for (const item of itemsOrigen) {
            const dup = docDestino.items.find((di) => di.id === item.id || (di.refId && item.refId && di.refId === item.refId));
            if (dup) {
                vistaPrevia.omite.push({ id: item.id, motivo: "ya existe un ítem con el mismo id o refId en destino" });
                continue;
            }
            vistaPrevia.crea.push(item.id);
            deshacer.push({ op: "quitar", ref: op.destino, itemId: item.id });
            if (op.tipo === "mover") {
                vistaPrevia.quitaReversible.push(item.id);
                if (esUltimaCopia(item, instantaneas, claveOrigen)) {
                    vistaPrevia.ultimaCopia.push(item.id);
                    validacion.avisos.push("es la última copia: haz una antes de quitarla");
                }
                deshacer.push({ op: "restaurar", ref: op.origen, itemId: item.id, haciaCarpeta: item.folderId ?? null });
            }
        }
        if (op.tipo === "copiar") {
            const creaOrdenados = [...vistaPrevia.crea].sort();
            const omiteOrdenados = [...vistaPrevia.omite].sort((a, b) => a.id.localeCompare(b.id));
            vistaPrevia.crea = creaOrdenados;
            vistaPrevia.omite = omiteOrdenados;
        } else if (op.tipo === "mover") {
            vistaPrevia.crea = [...vistaPrevia.crea].sort();
            vistaPrevia.omite = [...vistaPrevia.omite].sort((a, b) => a.id.localeCompare(b.id));
            vistaPrevia.quitaReversible = [...vistaPrevia.quitaReversible].sort();
            vistaPrevia.ultimaCopia = [...vistaPrevia.ultimaCopia].sort();
        }
        return { operacion: op, validacion, vistaPrevia, deshacer };
    }

    if (op.tipo === "fusionar") {
        if (!op.destino) {
            validacion.ok = false;
            validacion.errores.push("Falta el destino.");
            return { operacion: op, validacion, vistaPrevia, deshacer };
        }
        const claveDestino = claveDoc(op.destino);
        if (claveDestino === claveOrigen) {
            validacion.ok = false;
            validacion.errores.push("El destino debe ser distinto al origen.");
            return { operacion: op, validacion, vistaPrevia, deshacer };
        }
        const docDestino = instantaneas[claveDestino];
        if (!docDestino) {
            validacion.ok = false;
            validacion.errores.push("No existe el documento de destino.");
            return { operacion: op, validacion, vistaPrevia, deshacer };
        }
        for (const item of itemsOrigen) {
            if (!tienePermisoParaEditar(permisos, op.destino, item)) {
                validacion.ok = false;
                validacion.errores.push("Sin permiso para editar en destino.");
                break;
            }
        }
        if (!validacion.ok) {
            return { operacion: op, validacion, vistaPrevia, deshacer };
        }
        for (const item of itemsOrigen) {
            const yaExiste = docDestino.items.some((di) => di.refId && item.refId && di.refId === item.refId);
            if (yaExiste) {
                vistaPrevia.omite.push({ id: item.id, motivo: "ya existe en destino" });
                continue;
            }
            vistaPrevia.crea.push(item.id);
            deshacer.push({ op: "quitar", ref: op.destino, itemId: item.id });
        }
        vistaPrevia.crea = [...vistaPrevia.crea].sort();
        vistaPrevia.omite = [...vistaPrevia.omite].sort((a, b) => a.id.localeCompare(b.id));
        return { operacion: op, validacion, vistaPrevia, deshacer };
    }

    if (op.tipo === "quitar") {
        for (const item of itemsOrigen) {
            if (!tienePermisoParaEditar(permisos, op.origen, item)) {
                validacion.ok = false;
                validacion.errores.push("Sin permiso para editar.");
                break;
            }
        }
        if (!validacion.ok) {
            return { operacion: op, validacion, vistaPrevia, deshacer };
        }
        for (const item of itemsOrigen) {
            vistaPrevia.quitaReversible.push(item.id);
            if (esUltimaCopia(item, instantaneas, claveOrigen)) {
                vistaPrevia.ultimaCopia.push(item.id);
                validacion.avisos.push("es la última copia: haz una antes de quitarla");
            }
            deshacer.push({ op: "restaurar", ref: op.origen, itemId: item.id, haciaCarpeta: item.folderId ?? null });
        }
        vistaPrevia.quitaReversible = [...vistaPrevia.quitaReversible].sort();
        vistaPrevia.ultimaCopia = [...vistaPrevia.ultimaCopia].sort();
        return { operacion: op, validacion, vistaPrevia, deshacer };
    }

    if (op.tipo === "deduplicar") {
        const grupos = new Map<string, SavedItem[]>();
        for (const item of docOrigen.items) {
            const k = dedupKey(item);
            if (!grupos.has(k)) grupos.set(k, []);
            grupos.get(k)!.push(item);
        }
        for (const [k, lista] of grupos.entries()) {
            if (lista.length <= 1) continue;
            const [primero, ...resto] = [...lista].sort((a, b) => a.id.localeCompare(b.id));
            for (const sobra of resto) {
                if (esUltimaCopia(sobra, instantaneas, claveOrigen)) {
                    continue;
                }
                if (!tienePermisoParaEditar(permisos, op.origen, sobra)) {
                    vistaPrevia.omite.push({ id: sobra.id, motivo: "sin permiso para editar" });
                    continue;
                }
                vistaPrevia.modifica.push(sobra.id);
            }
        }
        validacion.avisos.push("NO se quita nada sin confirmación humana");
        vistaPrevia.modifica = [...vistaPrevia.modifica].sort();
        vistaPrevia.omite = [...vistaPrevia.omite].sort((a, b) => a.id.localeCompare(b.id));
        vistaPrevia.ultimaCopia = [...vistaPrevia.ultimaCopia].sort();
        return { operacion: op, validacion, vistaPrevia, deshacer };
    }

    validacion.ok = false;
    validacion.errores.push("Operación no soportada.");
    return { operacion: op, validacion, vistaPrevia, deshacer };
}

function tienePermisoParaVerItem(perm: PermisosBiblioteca, ref: EntityRef, item: SavedItem): boolean {
    return tienePermisoParaLeer(perm, ref, item);
}

export function resumenPlan(plan: PlanBiblioteca): string {
    const crea = plan.vistaPrevia.crea.length;
    const modifica = plan.vistaPrevia.modifica.length;
    const omite = plan.vistaPrevia.omite.length;
    const partes: string[] = [];
    if (crea > 0) partes.push(`Copiarías ${crea}`);
    if (modifica > 0) partes.push(`modificarías ${modifica}`);
    if (omite > 0) partes.push(`omitiría ${omite}`);
    if (partes.length === 0) return "No hay cambios previstos.";
    return partes.join(", ") + ".";
}
