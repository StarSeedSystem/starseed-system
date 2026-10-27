// ═════════════════════════════════════════════════════════════════════════════
// biblioteca-plan — Plan de la Biblioteca (tarea INF1025G · Ola 1025R).
// Patrón que enseña Spacedrive v2: toda operación pasa por validar → vista
// previa → ejecutar, deja un diario para deshacer y avisa antes de quitar la
// ÚLTIMA copia. Este módulo SOLO PLANIFICA: no ejecuta nada, no toca red,
// disco ni reloj (el reloj lo aporta quien ejecute el plan).
// Solo `import type` de entity-library: ese módulo es de cliente (Supabase,
// window) y aquí se necesitan sus TIPOS, nunca sus valores.
// SOP: architecture/repos-libreria-1025.md §6.3. Invariantes del OS: Entidad
// Única (se referencia, no se duplica el contenido) y «ningún borrado se
// propaga solo» (lápidas reversibles, nunca borrado físico).
// ═════════════════════════════════════════════════════════════════════════════

import type { EntityLibraryDoc, EntityRef, SavedItem } from "./entity-library";

/** Tipos de operación que la Biblioteca puede planificar. */
export type TipoOperacionBiblioteca =
    | "copiar"
    | "mover"
    | "fusionar"
    | "quitar"
    | "deduplicar";

export interface OperacionBiblioteca {
    tipo: TipoOperacionBiblioteca;
    origen: EntityRef;
    destino?: EntityRef;
    itemIds?: string[];
}

/** Un paso del diario para deshacer: ejecutable tal cual por el ejecutor. */
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

/** Permisos que ENTRAN POR PARÁMETRO: este módulo no los calcula. */
export interface PermisosBiblioteca {
    puedeVer(ref: EntityRef, item: SavedItem): boolean;
    puedeEditar(ref: EntityRef, item?: SavedItem): boolean;
}

/** Aviso obligatorio antes de quitar lo que ya no tiene copia en ningún sitio. */
const AVISO_ULTIMA_COPIA = "Es la última copia: haz una antes de quitarla.";
/** La deduplicación NUNCA quita: solo propone lo que sobraría. */
const AVISO_DEDUPLICAR = "La deduplicación solo propone: no se quita nada sin confirmación humana.";
/** La fusión añade lo que falta; lo que el destino ya tiene no se toca. */
const AVISO_FUSIONAR = "La fusión nunca borra: solo añade al destino lo que le falta.";

/** Clave de una instantánea en el registro: `${kind}:${id}`. */
export function claveInstantanea(ref: EntityRef): string {
    return `${ref.kind}:${ref.id}`;
}

/** Comparación byte a byte (sin `localeCompare`: determinista en cualquier máquina). */
function cmp(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** Ids únicos y ordenados: la salida del plan es siempre determinista. */
function ordenarIds(ids: Iterable<string>): string[] {
    return Array.from(new Set(ids)).sort(cmp);
}

function mismasRef(a: EntityRef, b: EntityRef): boolean {
    return a.kind === b.kind && a.id === b.id;
}

/**
 * ¿Quitar este ítem dejaría sin copia su `refId` o su `url`? Se mira TODO el
 * conjunto de instantáneas (cualquier otro ítem que conserve el mismo `refId`
 * o la misma `url` cuenta como otra copia real). Un ítem sin `refId` ni `url`
 * (p. ej. una nota con solo contenido) ES la última copia: es lo único que hay.
 */
function esUltimaCopia(
    item: SavedItem,
    instantaneas: Record<string, EntityLibraryDoc>,
    claveOrigen: string,
): boolean {
    for (const [clave, doc] of Object.entries(instantaneas)) {
        for (const it of doc.items) {
            if (clave === claveOrigen && it.id === item.id) continue; // el propio ítem
            if (item.refId && it.refId === item.refId) return false;
            if (item.url && it.url === item.url) return false;
        }
    }
    return true;
}

/** Motivo por el que el destino ya tiene este recurso (Entidad Única), o null. */
function choqueEnDestino(item: SavedItem, docDestino: EntityLibraryDoc): string | null {
    if (docDestino.items.some((it) => it.id === item.id)) {
        return "Ya existe un ítem con el mismo id en el destino.";
    }
    if (item.refId && docDestino.items.some((it) => it.refId === item.refId)) {
        return "El destino ya referencia este recurso (Entidad Única): no se duplica.";
    }
    return null;
}

interface Seleccion {
    items: SavedItem[];
    omite: { id: string; motivo: string }[];
}

/** Resuelve `itemIds` (o todos los del origen) en orden determinista. */
function seleccionar(op: OperacionBiblioteca, docOrigen: EntityLibraryDoc): Seleccion {
    const porId = new Map(docOrigen.items.map((it) => [it.id, it] as const));
    const pedidos = op.itemIds
        ? ordenarIds(op.itemIds)
        : ordenarIds(docOrigen.items.map((it) => it.id));
    const items: SavedItem[] = [];
    const omite: { id: string; motivo: string }[] = [];
    for (const id of pedidos) {
        const it = porId.get(id);
        if (it) items.push(it);
        else omite.push({ id, motivo: "No existe en la biblioteca de origen." });
    }
    return { items, omite };
}

/** Planifica SIN ejecutar nada: pura, determinista (ids ordenados). */
export function planificar(
    op: OperacionBiblioteca,
    instantaneas: Record<string, EntityLibraryDoc>,
    permisos: PermisosBiblioteca,
): PlanBiblioteca {
    const errores: string[] = [];
    const avisos: string[] = [];
    const crea: string[] = [];
    const modifica: string[] = [];
    const omite: { id: string; motivo: string }[] = [];
    const quitaReversible: string[] = [];
    const ultimaCopia: string[] = [];
    const deshacer: PasoDeshacer[] = [];

    const avisoUnaVez = (texto: string): void => {
        if (!avisos.includes(texto)) avisos.push(texto);
    };
    const omitePor = (id: string, motivo: string): void => {
        omite.push({ id, motivo });
    };

    const claveOrigen = claveInstantanea(op.origen);
    const docOrigen = instantaneas[claveOrigen];
    if (!docOrigen) {
        errores.push(`No hay instantánea de la biblioteca de origen (${claveOrigen}).`);
    }
    const necesitaDestino = op.tipo === "copiar" || op.tipo === "mover" || op.tipo === "fusionar";
    let docDestino: EntityLibraryDoc | undefined;
    let refDestino: EntityRef | undefined;
    if (necesitaDestino) {
        if (!op.destino) {
            errores.push(`La operación «${op.tipo}» necesita una biblioteca destino.`);
        } else if (mismasRef(op.origen, op.destino)) {
            errores.push("El destino es igual al origen: no hay nada que hacer.");
        } else {
            refDestino = op.destino;
            const claveDestino = claveInstantanea(op.destino);
            docDestino = instantaneas[claveDestino];
            if (!docDestino) {
                errores.push(`No hay instantánea de la biblioteca destino (${claveDestino}).`);
            } else if (!permisos.puedeEditar(op.destino)) {
                errores.push("Sin permiso de edición en la biblioteca destino.");
            }
        }
    } else if (!permisos.puedeEditar(op.origen)) {
        errores.push("Sin permiso de edición en la biblioteca de origen.");
    }

    // ── Armar el plan (solo si la validación pasa; con error, la vista previa queda vacía) ──
    if (docOrigen && errores.length === 0) {
        const sel = seleccionar(op, docOrigen);
        omite.push(...sel.omite);
        if (op.tipo === "deduplicar") {
            deduplicarItems(sel.items);
        } else {
            if (op.tipo === "fusionar") avisoUnaVez(AVISO_FUSIONAR);
            for (const item of sel.items) {
                if (op.tipo === "copiar") copiarItem(item);
                else if (op.tipo === "mover") moverItem(item);
                else if (op.tipo === "fusionar") fusionarItem(item);
                else quitarItem(item);
            }
        }
    }

    // ── Pasos por ítem (cierres: ven las listas del plan directamente) ──

    function copiarItem(item: SavedItem): void {
        if (!docDestino || !refDestino) return; // la validación ya lo marca como error
        if (!permisos.puedeVer(op.origen, item)) {
            omitePor(item.id, "Sin permiso para ver este ítem.");
            return;
        }
        const choque = choqueEnDestino(item, docDestino);
        if (choque) {
            omitePor(item.id, choque);
            return;
        }
        if (!permisos.puedeEditar(refDestino, item)) {
            omitePor(item.id, "Sin permiso para crear este ítem en el destino.");
            return;
        }
        crea.push(item.id);
        // Deshacer una copia = quitar lo creado en el destino.
        deshacer.push({ op: "quitar", ref: refDestino, itemId: item.id });
    }

    function moverItem(item: SavedItem): void {
        if (!docDestino || !refDestino) return;
        if (!permisos.puedeVer(op.origen, item)) {
            omitePor(item.id, "Sin permiso para ver este ítem.");
            return;
        }
        const choque = choqueEnDestino(item, docDestino);
        if (choque) {
            // Si el destino ya lo tiene, mover borrará la copia del origen sin
            // crear nada nuevo: no se mueve (ningún borrado se propaga solo).
            omitePor(item.id, `${choque} No se mueve.`);
            return;
        }
        if (!permisos.puedeEditar(refDestino, item)) {
            omitePor(item.id, "Sin permiso para crear este ítem en el destino.");
            return;
        }
        if (!permisos.puedeEditar(op.origen, item)) {
            omitePor(item.id, "Sin permiso de edición sobre este ítem en el origen.");
            return;
        }
        crea.push(item.id);
        quitaReversible.push(item.id);
        if (esUltimaCopia(item, instantaneas, claveOrigen)) {
            ultimaCopia.push(item.id);
            avisoUnaVez(AVISO_ULTIMA_COPIA);
        }
        // Deshacer un movimiento, en orden: quitar la copia del destino y
        // restaurar el ítem en su carpeta original del origen.
        deshacer.push({ op: "quitar", ref: refDestino, itemId: item.id });
        deshacer.push({
            op: "restaurar",
            ref: op.origen,
            itemId: item.id,
            haciaCarpeta: item.folderId ?? null,
        });
    }

    function quitarItem(item: SavedItem): void {
        if (!permisos.puedeVer(op.origen, item)) {
            omitePor(item.id, "Sin permiso para ver este ítem.");
            return;
        }
        if (!permisos.puedeEditar(op.origen, item)) {
            omitePor(item.id, "Sin permiso de edición sobre este ítem.");
            return;
        }
        quitaReversible.push(item.id);
        if (esUltimaCopia(item, instantaneas, claveOrigen)) {
            ultimaCopia.push(item.id);
            avisoUnaVez(AVISO_ULTIMA_COPIA);
        }
        // Deshacer una lápida = restaurar el ítem donde estaba.
        deshacer.push({ op: "restaurar", ref: op.origen, itemId: item.id });
    }

    function fusionarItem(item: SavedItem): void {
        if (!docDestino || !refDestino) return;
        if (!permisos.puedeVer(op.origen, item)) {
            omitePor(item.id, "Sin permiso para ver este ítem.");
            return;
        }
        const choque = choqueEnDestino(item, docDestino);
        if (choque) {
            // Lo que el destino ya tiene NO se toca: la fusión nunca borra.
            omitePor(item.id, `Ya está en el destino: la fusión no lo toca. (${choque})`);
            return;
        }
        if (!permisos.puedeEditar(refDestino, item)) {
            omitePor(item.id, "Sin permiso para crear este ítem en el destino.");
            return;
        }
        crea.push(item.id);
        deshacer.push({ op: "quitar", ref: refDestino, itemId: item.id });
    }

    function deduplicarItems(items: SavedItem[]): void {
        const grupos = new Map<string, SavedItem[]>();
        for (const item of items) {
            if (!permisos.puedeVer(op.origen, item)) {
                omitePor(item.id, "Sin permiso para ver este ítem.");
                continue;
            }
            const clave = item.refId
                ? `ref:${item.refId}`
                : item.url
                  ? `url:${item.url}`
                  : `tt:${item.title.trim()}::${item.type}`;
            const lista = grupos.get(clave) ?? [];
            lista.push(item);
            grupos.set(clave, lista);
        }
        for (const lista of grupos.values()) {
            const orden = lista.slice().sort((a, b) => cmp(a.id, b.id));
            // El primero del grupo se queda; los demás SOBRARÍAN (solo se propone).
            for (let i = 1; i < orden.length; i++) {
                const sobrante = orden[i];
                if (!permisos.puedeEditar(op.origen, sobrante)) {
                    omitePor(sobrante.id, "Sin permiso de edición sobre este ítem.");
                    continue;
                }
                if (esUltimaCopia(sobrante, instantaneas, claveOrigen)) {
                    omitePor(sobrante.id, "Es la última copia: no se propone quitarla.");
                    continue;
                }
                modifica.push(sobrante.id);
                avisoUnaVez(AVISO_DEDUPLICAR);
            }
        }
    }

    return {
        operacion: op,
        validacion: { ok: errores.length === 0, errores, avisos },
        vistaPrevia: {
            crea: ordenarIds(crea),
            modifica: ordenarIds(modifica),
            omite: omite.slice().sort((a, b) => cmp(a.id, b.id)),
            quitaReversible: ordenarIds(quitaReversible),
            ultimaCopia: ordenarIds(ultimaCopia),
        },
        deshacer,
    };
}

/** Resumen del plan en español para personas. Determinista. */
export function resumenPlan(plan: PlanBiblioteca): string {
    if (!plan.validacion.ok) {
        return `Plan bloqueado: ${plan.validacion.errores.join(" ")}`;
    }
    const vista = plan.vistaPrevia;
    const crea = vista.crea.length;
    const quita = vista.quitaReversible.length;
    const propone = vista.modifica.length;
    const omite = vista.omite.length;
    let principal = "";
    switch (plan.operacion.tipo) {
        case "copiar":
            if (crea > 0) principal = `Copiarías ${crea}`;
            break;
        case "mover":
            if (crea > 0) principal = `Moverías ${crea}`;
            break;
        case "fusionar":
            if (crea > 0) principal = `Añadirías ${crea} al destino (la fusión nunca borra)`;
            break;
        case "quitar":
            if (quita > 0) principal = `Quitarías ${quita} (reversible con lápida)`;
            break;
        case "deduplicar":
            if (propone > 0) {
                principal = `Deduplicarías ${propone} (solo propuesta: no se quita nada sin tu confirmación)`;
            }
            break;
    }
    if (!principal) {
        return omite > 0
            ? `No habría cambios: se omitiría${omite === 1 ? "" : "n"} ${omite}.`
            : "No habría cambios.";
    }
    let resumen = principal;
    if (omite > 0) resumen += ` y omitirías ${omite}`;
    resumen += ".";
    if (vista.ultimaCopia.length > 0) resumen += ` ${AVISO_ULTIMA_COPIA}`;
    return resumen;
}
