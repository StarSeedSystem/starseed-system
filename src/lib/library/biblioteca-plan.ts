import type { EntityLibraryDoc, EntityRef, SavedItem } from "./entity-library";

export type TipoOperacion = "copiar" | "mover" | "fusionar" | "quitar" | "deduplicar";

export interface OperacionBiblioteca {
    tipo: TipoOperacion;
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

export interface PermisosBiblioteca {
    puedeVer(ref: EntityRef, item: string): boolean;
    puedeEditar(ref: EntityRef, item?: string): boolean;
}

const DOC_VACIO: EntityLibraryDoc = { items: [], folders: [], rev: 0, updatedAt: "" };

function clave(ref: EntityRef): string {
    return `${ref.kind}:${ref.id}`;
}

function mismaRef(a: EntityRef, b: EntityRef): boolean {
    return a.kind === b.kind && a.id === b.id;
}

function docDe(instantaneas: Record<string, EntityLibraryDoc>, ref: EntityRef): EntityLibraryDoc {
    return instantaneas[clave(ref)] ?? DOC_VACIO;
}

function ordenados(ids: string[]): string[] {
    return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

/** Identidades de contenido de un ítem. Sin refId ni url no hay «copia» que contar. */
function identidades(item: SavedItem): string[] {
    const claves: string[] = [];
    if (item.refId?.trim()) claves.push(`ref:${item.refId.trim()}`);
    if (item.url?.trim()) claves.push(`url:${item.url.trim()}`);
    const titulo = item.title?.trim().toLowerCase();
    if (titulo) claves.push(`titulo:${item.type}:${titulo}`);
    return claves;
}

/** true si, quitando `seVan`, ninguna otra copia conserva el mismo refId o url. */
function esUltimaCopia(
    item: SavedItem,
    instantaneas: Record<string, EntityLibraryDoc>,
    origen: EntityRef,
    seVan: Set<string>,
): boolean {
    const refId = item.refId?.trim();
    const url = item.url?.trim();
    // Sin refId ni url no hay identidad de contenido: el ítem es su única copia.
    if (!refId && !url) return true;
    const claveOrigen = clave(origen);
    for (const [k, doc] of Object.entries(instantaneas)) {
        for (const otro of doc.items) {
            if (k === claveOrigen && (otro.id === item.id || seVan.has(otro.id))) continue;
            if (refId && otro.refId?.trim() === refId) return false;
            if (url && otro.url?.trim() === url) return false;
        }
    }
    return true;
}

function conflictoEnDestino(destino: SavedItem[], creados: SavedItem[], item: SavedItem): string | null {
    const juntos = [...destino, ...creados];
    if (juntos.some((o) => o.id === item.id)) return "ya existe un ítem con el mismo id en el destino";
    const refId = item.refId?.trim();
    if (refId && juntos.some((o) => o.refId?.trim() === refId)) {
        return "ya hay una referencia al mismo recurso en el destino";
    }
    return null;
}

function seleccionar(op: OperacionBiblioteca, doc: EntityLibraryDoc): { items: SavedItem[]; faltan: string[] } {
    const porId = new Map(doc.items.map((it) => [it.id, it]));
    const pedidos = op.itemIds?.length ? op.itemIds : doc.items.map((it) => it.id);
    const items: SavedItem[] = [];
    const faltan: string[] = [];
    for (const id of ordenados(pedidos)) {
        const item = porId.get(id);
        if (item) items.push(item);
        else faltan.push(id);
    }
    return { items, faltan };
}

function buscarEnDestino(item: SavedItem, destino: SavedItem[], usados: Set<string>): SavedItem | undefined {
    const libres = destino.filter((o) => !usados.has(o.id));
    const porId = libres.find((o) => o.id === item.id);
    if (porId) return porId;
    const refId = item.refId?.trim();
    const porRef = refId ? libres.find((o) => o.refId?.trim() === refId) : undefined;
    if (porRef) return porRef;
    const url = item.url?.trim();
    const porUrl = url ? libres.find((o) => o.url?.trim() === url) : undefined;
    if (porUrl) return porUrl;
    const titulo = item.title?.trim().toLowerCase();
    return titulo
        ? libres.find((o) => o.type === item.type && o.title?.trim().toLowerCase() === titulo)
        : undefined;
}

/** Devuelve el ítem de destino con lo que le falte del origen, o null si ya lo tiene todo. */
function rellenarFaltantes(destino: SavedItem, origen: SavedItem): SavedItem | null {
    let hay = false;
    const patch: Partial<SavedItem> = {};
    if (!destino.note && origen.note) { patch.note = origen.note; hay = true; }
    if (!destino.content && origen.content) { patch.content = origen.content; hay = true; }
    if (!destino.url && origen.url) { patch.url = origen.url; hay = true; }
    if (!destino.description && origen.description) { patch.description = origen.description; hay = true; }
    if (!destino.mime && origen.mime) { patch.mime = origen.mime; hay = true; }
    if (!destino.language && origen.language) { patch.language = origen.language; hay = true; }
    if (!destino.thumbnail && origen.thumbnail) { patch.thumbnail = origen.thumbnail; hay = true; }
    const tags = (origen.tags ?? []).filter((t) => !(destino.tags ?? []).includes(t));
    if (tags.length) { patch.tags = [...(destino.tags ?? []), ...tags]; hay = true; }
    return hay ? { ...destino, ...patch } : null;
}

function agruparDuplicados(items: SavedItem[]): SavedItem[][] {
    const padre = new Map(items.map((it) => [it.id, it.id]));
    const raiz = (id: string): string => {
        let actual = padre.get(id) ?? id;
        while (actual !== (padre.get(actual) ?? actual)) actual = padre.get(actual) ?? actual;
        return actual;
    };
    const unir = (a: string, b: string) => {
        const ra = raiz(a);
        const rb = raiz(b);
        if (ra !== rb) padre.set(ra, rb);
    };
    const porClave = new Map<string, string[]>();
    for (const item of items) {
        for (const k of identidades(item)) {
            porClave.set(k, [...(porClave.get(k) ?? []), item.id]);
        }
    }
    for (const ids of porClave.values()) for (let i = 1; i < ids.length; i++) unir(ids[0], ids[i]);
    const grupos = new Map<string, SavedItem[]>();
    for (const item of items) {
        const r = raiz(item.id);
        grupos.set(r, [...(grupos.get(r) ?? []), item]);
    }
    return Array.from(grupos.values());
}

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
    const origenDoc = docDe(instantaneas, op.origen);
    const destino = op.destino;
    const destinoDoc = destino ? docDe(instantaneas, destino) : DOC_VACIO;
    const requiereDestino = op.tipo === "copiar" || op.tipo === "mover" || op.tipo === "fusionar";

    if (requiereDestino && !destino) errores.push("Falta la biblioteca de destino para esta operación.");
    if (destino && mismaRef(op.origen, destino)) errores.push("El destino es la misma biblioteca que el origen.");
    if (errores.length === 0) {
        if (requiereDestino && destino && !permisos.puedeEditar(destino)) {
            errores.push("No tienes permiso para editar la biblioteca de destino.");
        }
        if ((op.tipo === "mover" || op.tipo === "quitar") && !permisos.puedeEditar(op.origen)) {
            errores.push("No tienes permiso para editar la biblioteca de origen.");
        }
    }

    const { items, faltan } = errores.length ? { items: [], faltan: [] } : seleccionar(op, origenDoc);
    for (const id of faltan) omite.push({ id, motivo: "no existe en la biblioteca de origen" });

    if (op.tipo === "copiar" && destino) {
        const creados: SavedItem[] = [];
        for (const item of items) {
            if (!permisos.puedeVer(op.origen, item.id)) {
                omite.push({ id: item.id, motivo: "sin permiso para ver el ítem" });
                continue;
            }
            const motivo = conflictoEnDestino(destinoDoc.items, creados, item);
            if (motivo) {
                omite.push({ id: item.id, motivo });
                continue;
            }
            creados.push(item);
            crea.push(item.id);
            deshacer.push({ op: "quitar", ref: destino, itemId: item.id });
        }
    } else if (op.tipo === "mover" && destino) {
        const candidatos = items.filter((item) => {
            if (permisos.puedeVer(op.origen, item.id) && permisos.puedeEditar(op.origen, item.id)) return true;
            omite.push({ id: item.id, motivo: "sin permiso para mover el ítem" });
            return false;
        });
        const movidos: SavedItem[] = [];
        for (const item of candidatos) {
            const motivo = conflictoEnDestino(destinoDoc.items, movidos, item);
            if (motivo) {
                omite.push({ id: item.id, motivo });
                continue;
            }
            movidos.push(item);
            quitaReversible.push(item.id);
            deshacer.push({ op: "mover", ref: op.origen, itemId: item.id, haciaCarpeta: item.folderId ?? null });
        }
        const seVan = new Set(movidos.map((it) => it.id));
        for (const item of movidos) {
            if (esUltimaCopia(item, instantaneas, op.origen, seVan)) ultimaCopia.push(item.id);
        }
        if (ultimaCopia.length) avisos.push("es la última copia: haz una antes de quitarla");
    } else if (op.tipo === "quitar") {
        const candidatos = items.filter((item) => {
            if (permisos.puedeEditar(op.origen, item.id)) return true;
            omite.push({ id: item.id, motivo: "sin permiso para quitar el ítem" });
            return false;
        });
        const seVan = new Set(candidatos.map((it) => it.id));
        for (const item of candidatos) {
            quitaReversible.push(item.id);
            deshacer.push({ op: "restaurar", ref: op.origen, itemId: item.id });
            if (esUltimaCopia(item, instantaneas, op.origen, seVan)) ultimaCopia.push(item.id);
        }
        if (ultimaCopia.length) avisos.push("es la última copia: haz una antes de quitarla");
    } else if (op.tipo === "fusionar" && destino) {
        const usados = new Set<string>();
        for (const item of items) {
            if (!permisos.puedeVer(op.origen, item.id)) {
                omite.push({ id: item.id, motivo: "sin permiso para ver el ítem" });
                continue;
            }
            const match = buscarEnDestino(item, destinoDoc.items, usados);
            if (match) {
                if (!permisos.puedeEditar(destino, match.id)) {
                    omite.push({ id: item.id, motivo: "sin permiso para editar el ítem de destino" });
                    continue;
                }
                const fusionado = rellenarFaltantes(match, item);
                if (!fusionado) {
                    omite.push({ id: item.id, motivo: "el destino ya lo tiene completo" });
                    continue;
                }
                usados.add(match.id);
                modifica.push(match.id);
                continue;
            }
            if (destinoDoc.items.some((o) => o.id === item.id) || crea.includes(item.id)) {
                omite.push({ id: item.id, motivo: "ya existe un ítem con el mismo id en el destino" });
                continue;
            }
            crea.push(item.id);
        }
        if (crea.length || modifica.length) avisos.push("Fusionar nunca borra: el origen se conserva intacto");
    } else if (op.tipo === "deduplicar") {
        const candidatos = items.filter((item) => {
            if (permisos.puedeVer(op.origen, item.id) && permisos.puedeEditar(op.origen, item.id)) return true;
            omite.push({ id: item.id, motivo: "sin permiso para proponer cambios en el ítem" });
            return false;
        });
        const sobrantes = new Set<string>();
        for (const grupo of agruparDuplicados(candidatos)) {
            const orden = [...grupo].sort(
                (a, b) => (Date.parse(a.addedAt) || 0) - (Date.parse(b.addedAt) || 0) || a.id.localeCompare(b.id),
            );
            for (const sobrante of orden.slice(1)) sobrantes.add(sobrante.id);
        }
        for (const item of candidatos) {
            if (!sobrantes.has(item.id)) continue;
            // Con identidad de contenido, nunca se propone quitar la última copia.
            // Sin refId ni url se agrupa por título+tipo: queda el canónico del grupo.
            const conIdentidad = !!(item.refId?.trim() || item.url?.trim());
            if (conIdentidad && esUltimaCopia(item, instantaneas, op.origen, sobrantes)) {
                ultimaCopia.push(item.id);
                continue;
            }
            modifica.push(item.id);
        }
        avisos.push("La deduplicación solo propone: no se quita nada sin confirmación humana");
    }

    return {
        operacion: op,
        validacion: { ok: errores.length === 0, errores, avisos },
        vistaPrevia: {
            crea: ordenados(crea),
            modifica: ordenados(modifica),
            omite: omite.sort((a, b) => a.id.localeCompare(b.id)),
            quitaReversible: ordenados(quitaReversible),
            ultimaCopia: ordenados(ultimaCopia),
        },
        deshacer: deshacer.sort((a, b) => a.itemId.localeCompare(b.itemId) || a.op.localeCompare(b.op)),
    };
}

export function resumenPlan(plan: PlanBiblioteca): string {
    const { operacion, validacion, vistaPrevia } = plan;
    if (!validacion.ok) {
        return `No se puede ${operacion.tipo}: ${validacion.errores[0] ?? "revisa la operación"}.`;
    }
    const omitidos = vistaPrevia.omite.length;
    const ultimas = vistaPrevia.ultimaCopia.length;
    const colaOmision = omitidos ? ` Omitiría ${omitidos}.` : "";
    const colaUltima = ultimas ? ` ${ultimas} ${ultimas === 1 ? "es" : "son"} la última copia.` : "";
    switch (operacion.tipo) {
        case "copiar":
            return `Copiarías ${vistaPrevia.crea.length}.${colaOmision}`;
        case "mover":
            return `Moverías ${vistaPrevia.quitaReversible.length}.${colaOmision}${colaUltima}`;
        case "fusionar":
            return `Fusionarías ${vistaPrevia.modifica.length} y crearías ${vistaPrevia.crea.length} sin borrar nada.${colaOmision}`;
        case "quitar":
            return `Quitarías ${vistaPrevia.quitaReversible.length} de forma reversible.${colaOmision}${colaUltima}`;
        case "deduplicar":
            return `Propondrías quitar ${vistaPrevia.modifica.length} duplicado(s); no se quita nada sin confirmación humana.${colaOmision}`;
    }
}
