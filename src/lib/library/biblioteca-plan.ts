// StarSeed OS — Biblioteca · Plan antes de actuar (Ola 1025R · INF1025G)
// Módulo PURO: valida, enseña la vista previa y deja un diario para deshacer.
// No toca red, disco ni reloj; las instantáneas y los permisos entran por
// parámetro. Patrón de Spacedrive: validar → vista previa → ejecutar → deshacer.
// Entidad Única: se planifican REFERENCIAS, nunca se copia el contenido.

import type { EntityLibraryDoc, EntityRef, SavedItem } from "@/lib/library/entity-library";

export interface OperacionBiblioteca {
    tipo: "copiar" | "mover" | "fusionar" | "quitar" | "deduplicar";
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
    puedeVer(ref: EntityRef, item: SavedItem): boolean;
    puedeEditar(ref: EntityRef, item?: SavedItem): boolean;
}

function clave(ref: EntityRef): string {
    return `${ref.kind}:${ref.id}`;
}

/** Ítems del origen que entran en el plan, siempre ordenados por id. */
function itemsDelPlan(doc: EntityLibraryDoc, ids?: string[]): SavedItem[] {
    const orden = [...doc.items].sort((a, b) => a.id.localeCompare(b.id));
    if (ids === undefined) return orden;
    const pedidos = new Set(ids);
    return orden.filter((it) => pedidos.has(it.id));
}

/** ¿Otro documento conserva el mismo recurso? (regla de la última copia). */
function hayOtraCopia(item: SavedItem, docs: Record<string, EntityLibraryDoc>, excluir: string): boolean {
    return Object.entries(docs).some(([k, doc]) => {
        if (k === excluir) return false;
        return doc.items.some(
            (otro) => (!!item.refId && otro.refId === item.refId) || (!!item.url && otro.url === item.url),
        );
    });
}

function choqueAlCopiar(destino: EntityLibraryDoc, item: SavedItem): string | null {
    if (destino.items.some((d) => d.id === item.id)) return "Ya existe un ítem con el mismo id en el destino.";
    if (item.refId && destino.items.some((d) => d.refId === item.refId)) {
        return "Ya existe el mismo recurso en el destino (mismo refId); no se duplica.";
    }
    return null;
}

function yaEstaEnDestino(destino: EntityLibraryDoc, item: SavedItem): boolean {
    return destino.items.some(
        (d) =>
            d.id === item.id ||
            (!!item.refId && d.refId === item.refId) ||
            (!!item.url && d.url === item.url) ||
            (d.title === item.title && d.type === item.type),
    );
}

/** Agrupa por refId, url o title+type (union-find: una clave distinta une grupos). */
function gruposDuplicados(items: SavedItem[]): SavedItem[][] {
    const padre = items.map((_, i) => i);
    const raiz = (x: number): number => (padre[x] === x ? x : (padre[x] = raiz(padre[x])));
    const unir = (a: number, b: number) => {
        const ra = raiz(a);
        const rb = raiz(b);
        if (ra !== rb) padre[rb] = ra;
    };
    const visto = new Map<string, number>();
    items.forEach((it, i) => {
        const claves = [
            ...(it.refId ? [`ref:${it.refId}`] : []),
            ...(it.url ? [`url:${it.url}`] : []),
            `tt:${it.type}:${it.title.trim().toLowerCase()}`,
        ];
        for (const k of claves) {
            const previo = visto.get(k);
            if (previo === undefined) visto.set(k, i);
            else unir(previo, i);
        }
    });
    const grupos = new Map<number, SavedItem[]>();
    items.forEach((it, i) => {
        const r = raiz(i);
        const grupo = grupos.get(r) ?? [];
        grupo.push(it);
        grupos.set(r, grupo);
    });
    return [...grupos.values()].filter((g) => g.length > 1);
}

export function planificar(
    operacion: OperacionBiblioteca,
    instantaneas: Record<string, EntityLibraryDoc>,
    permisos: PermisosBiblioteca,
): PlanBiblioteca {
    const operacionSalida: OperacionBiblioteca = operacion.itemIds
        ? { ...operacion, itemIds: [...operacion.itemIds].sort() }
        : operacion;
    const errores: string[] = [];
    const avisos: string[] = [];
    const crea: string[] = [];
    const modifica: string[] = [];
    const omite: { id: string; motivo: string }[] = [];
    const quitaReversible: string[] = [];
    const ultimaCopia: string[] = [];
    const deshacer: PasoDeshacer[] = [];

    const origenKey = clave(operacion.origen);
    const origen = instantaneas[origenKey];
    const destinoRef = operacion.destino;
    const destinoKey = destinoRef ? clave(destinoRef) : "";
    const destino = destinoRef ? instantaneas[destinoKey] : undefined;
    const requiereDestino = operacion.tipo === "copiar" || operacion.tipo === "mover" || operacion.tipo === "fusionar";

    if (!origen) errores.push("No se encontró la biblioteca de origen.");
    if (requiereDestino && !destinoRef) errores.push("Falta la biblioteca de destino.");
    if (destinoRef && destinoKey === origenKey) errores.push("El destino no puede ser el mismo que el origen.");
    if (requiereDestino && destinoRef && !destino) errores.push("No se encontró la biblioteca de destino.");
    if (requiereDestino && destinoRef && destino && !permisos.puedeEditar(destinoRef)) {
        errores.push("Sin permiso para editar la biblioteca de destino.");
    }

    const terminar = (): PlanBiblioteca => ({
        operacion: operacionSalida,
        validacion: { ok: errores.length === 0, errores, avisos },
        vistaPrevia: {
            crea: crea.sort(),
            modifica: modifica.sort(),
            omite: omite.sort((a, b) => a.id.localeCompare(b.id) || a.motivo.localeCompare(b.motivo)),
            quitaReversible: quitaReversible.sort(),
            ultimaCopia: ultimaCopia.sort(),
        },
        deshacer,
    });

    if (!origen || errores.length > 0) return terminar();

    const items = itemsDelPlan(origen, operacion.itemIds);
    if (operacion.itemIds) {
        for (const id of operacion.itemIds) {
            if (!origen.items.some((it) => it.id === id)) omite.push({ id, motivo: "No existe en la biblioteca de origen." });
        }
    }

    if (operacion.tipo === "copiar" || operacion.tipo === "fusionar") {
        const destinoDoc = destino as EntityLibraryDoc;
        const refDestino = destinoRef as EntityRef;
        for (const item of items) {
            if (!permisos.puedeVer(operacion.origen, item)) {
                omite.push({ id: item.id, motivo: `No tienes permiso para ver «${item.title}».` });
                continue;
            }
            const motivo =
                operacion.tipo === "copiar"
                    ? choqueAlCopiar(destinoDoc, item)
                    : yaEstaEnDestino(destinoDoc, item)
                      ? "El destino ya tiene ese recurso; fusionar no lo toca."
                      : null;
            if (motivo) {
                omite.push({ id: item.id, motivo });
                continue;
            }
            crea.push(item.id);
            deshacer.push({ op: "quitar", ref: refDestino, itemId: item.id });
        }
        return terminar();
    }

    if (operacion.tipo === "mover") {
        const destinoDoc = destino as EntityLibraryDoc;
        const refDestino = destinoRef as EntityRef;
        let avisoUltima = false;
        for (const item of items) {
            if (!permisos.puedeVer(operacion.origen, item)) {
                omite.push({ id: item.id, motivo: `No tienes permiso para ver «${item.title}».` });
                continue;
            }
            if (!permisos.puedeEditar(operacion.origen, item)) {
                omite.push({ id: item.id, motivo: `No tienes permiso para mover «${item.title}».` });
                continue;
            }
            const motivo = choqueAlCopiar(destinoDoc, item);
            if (motivo) {
                omite.push({ id: item.id, motivo });
                continue;
            }
            crea.push(item.id);
            quitaReversible.push(item.id);
            if (!hayOtraCopia(item, instantaneas, origenKey)) {
                ultimaCopia.push(item.id);
                avisoUltima = true;
            }
            deshacer.push({ op: "quitar", ref: refDestino, itemId: item.id });
            deshacer.push({ op: "mover", ref: operacion.origen, itemId: item.id, haciaCarpeta: item.folderId ?? null });
        }
        if (avisoUltima) avisos.push("es la última copia: haz una antes de quitarla");
        return terminar();
    }

    if (operacion.tipo === "quitar") {
        let avisoUltima = false;
        for (const item of items) {
            if (!permisos.puedeVer(operacion.origen, item)) {
                omite.push({ id: item.id, motivo: `No tienes permiso para ver «${item.title}».` });
                continue;
            }
            if (!permisos.puedeEditar(operacion.origen, item)) {
                omite.push({ id: item.id, motivo: `No tienes permiso para quitar «${item.title}».` });
                continue;
            }
            quitaReversible.push(item.id);
            if (!hayOtraCopia(item, instantaneas, origenKey)) {
                ultimaCopia.push(item.id);
                avisoUltima = true;
            }
            deshacer.push({ op: "restaurar", ref: operacion.origen, itemId: item.id, haciaCarpeta: item.folderId ?? null });
        }
        if (avisoUltima) avisos.push("es la última copia: haz una antes de quitarla");
        return terminar();
    }

    const revisables: SavedItem[] = [];
    for (const item of items) {
        if (!permisos.puedeVer(operacion.origen, item)) {
            omite.push({ id: item.id, motivo: `No tienes permiso para ver «${item.title}».` });
        } else if (!permisos.puedeEditar(operacion.origen, item)) {
            omite.push({ id: item.id, motivo: `No tienes permiso para deduplicar «${item.title}».` });
        } else {
            revisables.push(item);
        }
    }
    for (const grupo of gruposDuplicados(revisables)) {
        for (const sobrante of grupo.slice(1)) {
            modifica.push(sobrante.id);
        }
    }
    if (modifica.length > 0) {
        avisos.push("Deduplicar solo propone: no se quita nada sin confirmación humana.");
    }
    return terminar();
}

export function resumenPlan(plan: PlanBiblioteca): string {
    const { validacion, vistaPrevia, operacion } = plan;
    if (!validacion.ok) return `No se puede planificar: ${validacion.errores.join(" ")}`;
    const n =
        operacion.tipo === "quitar" || operacion.tipo === "deduplicar"
            ? operacion.tipo === "quitar"
                ? vistaPrevia.quitaReversible.length
                : vistaPrevia.modifica.length
            : vistaPrevia.crea.length;
    const plural = (c: number, uno: string, varios: string) => (c === 1 ? uno : varios);
    const verbo =
        operacion.tipo === "copiar"
            ? "Copiarías"
            : operacion.tipo === "mover"
              ? "Moverías"
              : operacion.tipo === "fusionar"
                ? "Fusionarías"
                : operacion.tipo === "quitar"
                  ? "Quitarías"
                  : "Propondrías quitar";
    const sustantivo = operacion.tipo === "deduplicar" ? plural(n, "duplicado", "duplicados") : plural(n, "ítem", "ítems");
    const partes = [n > 0 ? `${verbo} ${n} ${sustantivo}` : `No ${verbo.toLowerCase()} nada`];
    if (vistaPrevia.omite.length > 0) {
        partes.push(`omitirías ${vistaPrevia.omite.length} ${plural(vistaPrevia.omite.length, "ítem", "ítems")}`);
    }
    if (vistaPrevia.ultimaCopia.length > 0) {
        partes.push(`hay ${vistaPrevia.ultimaCopia.length} ${plural(vistaPrevia.ultimaCopia.length, "última copia", "últimas copias")}`);
    }
    return `${partes.join(", ")}.`;
}
