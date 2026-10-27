/**
 * biblioteca-plan · Patrón Spacedrive para la Biblioteca del OS (INF1025G):
 * validar → vista previa → ejecutar queda PLANEADO, nunca ejecutado.
 *
 * Módulo PURO: sin red, sin disco, sin reloj (lo que llega por parámetro).
 * Solo `import type` de entity-library (el almacén real no se toca).
 *
 * Contrato de la ola: architecture/repos-libreria-1025.md §6 (Spacedrive).
 * Invariantes del OS: Entidad Única (se referencia, no se duplica contenido)
 * y «ningún borrado se propaga solo» (todo quitar/mover va sobre lápida).
 */

import type { EntityLibraryDoc, EntityRef, SavedItem } from "@/lib/library/entity-library";

/** Operación que se planea, sin ejecutar. */
export type OperacionBiblioteca = {
    tipo: "copiar" | "mover" | "fusionar" | "quitar" | "deduplicar";
    origen: EntityRef;
    /** Biblioteca de destino (copiar/mover/fusionar). */
    destino?: EntityRef;
    /** Si falta: todos los ítems de la biblioteca de origen. */
    itemIds?: string[];
};

/** Paso del diario para deshacer una operación ya ejecutada. */
export type PasoDeshacer = {
    op: "quitar" | "restaurar" | "mover";
    ref: EntityRef;
    itemId: string;
    haciaCarpeta?: string | null;
};

export type PlanBiblioteca = {
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
};

/** Permisos calculados FUERA (por quien conoce la ACL); aquí nunca se deducen. */
export type PermisosPlan = {
    puedeVer(ref: EntityRef, item: SavedItem): boolean;
    puedeEditar(ref: EntityRef, item?: SavedItem): boolean;
};

/** Clave de instantánea de una biblioteca en el mapa. */
export function claveInstantanea(ref: EntityRef): string {
    return `${ref.kind}:${ref.id}`;
}

export function planificar(
    op: OperacionBiblioteca,
    instantaneas: Record<string, EntityLibraryDoc>,
    permisos: PermisosPlan,
): PlanBiblioteca {
    return planificarInterno(op, instantaneas, permisos);
}

export function resumenPlan(plan: PlanBiblioteca): string {
    return resumenPlanInterno(plan);
}

/* ── implementación ───────────────────────────────────────────── */

type Acum = {
    vista: PlanBiblioteca["vistaPrevia"];
    errores: string[];
    avisos: string[];
    deshacer: PasoDeshacer[];
};

function estadoInicial(): Acum {
    return {
        vista: { crea: [], modifica: [], omite: [], quitaReversible: [], ultimaCopia: [] },
        errores: [],
        avisos: [],
        deshacer: [],
    };
}

function cerrar(op: OperacionBiblioteca, acum: Acum): PlanBiblioteca {
    return {
        operacion: op,
        validacion: { ok: acum.errores.length === 0, errores: acum.errores, avisos: acum.avisos },
        vistaPrevia: acum.vista,
        deshacer: acum.deshacer,
    };
}

function omitir(acum: Acum, id: string, motivo: string): void {
    acum.vista.omite.push({ id, motivo });
}

/**
 * ¿Quitar este ítem deja sin copia su contenido? Una copia la conserva
 * CUALQUIER ítem de cualquier instantánea (también los hermanos del mismo
 * documento) con el mismo `refId` o la misma `url`. Sin identidad
 * (`refId`+`url` vacíos) nadie puede conservarla: para quitar/mover se
 * avisa por prudencia; para deduplicar (`exigeIdentidad`) no cuenta de
 * losa y la confirmación humana decide.
 */
function esUltimaCopia(
    item: SavedItem,
    claveOrigen: string,
    instantaneas: Record<string, EntityLibraryDoc>,
    exigeIdentidad: boolean,
): boolean {
    const refId = (item.refId ?? "").trim();
    const url = (item.url ?? "").trim();
    if (!refId && !url) return !exigeIdentidad;
    for (const [clave, doc] of Object.entries(instantaneas)) {
        for (const otra of doc.items) {
            if (clave === claveOrigen && otra.id === item.id) continue;
            if ((refId && otra.refId === refId) || (url && otra.url === url)) return false;
        }
    }
    return true;
}

function planificarInterno(
    op: OperacionBiblioteca,
    instantaneas: Record<string, EntityLibraryDoc>,
    permisos: PermisosPlan,
): PlanBiblioteca {
    const acum = estadoInicial();
    const claveOrigen = claveInstantanea(op.origen);
    const docOrigen = instantaneas[claveOrigen];
    if (!docOrigen) {
        acum.errores.push(`No hay instantánea de la biblioteca de origen (${claveOrigen}).`);
        return cerrar(op, acum);
    }
    const necesitaDestino = op.tipo === "copiar" || op.tipo === "mover" || op.tipo === "fusionar";
    if (necesitaDestino) {
        const problema = validarDestino(op, instantaneas);
        if (problema) {
            acum.errores.push(problema);
            return cerrar(op, acum);
        }
    }
    switch (op.tipo) {
        case "copiar":
            planCopiar(op, docOrigen, instantaneas[claveInstantanea(op.destino as EntityRef)], permisos, acum);
            break;
        case "mover":
            planMover(op, docOrigen, instantaneas[claveInstantanea(op.destino as EntityRef)], permisos, acum, instantaneas, claveOrigen);
            break;
        case "fusionar":
            planFusionar(op, docOrigen, instantaneas[claveInstantanea(op.destino as EntityRef)], permisos, acum);
            break;
        case "quitar":
            planQuitar(op, docOrigen, permisos, acum, instantaneas, claveOrigen);
            break;
        case "deduplicar":
            planDeduplicar(op, docOrigen, permisos, acum, instantaneas, claveOrigen);
            break;
    }
    return cerrar(op, acum);
}

/** Mensaje de error en español si hace falta destino válido y no lo hay. */
function validarDestino(op: OperacionBiblioteca, instantaneas: Record<string, EntityLibraryDoc>): string | null {
    if (!op.destino) return "Falta la biblioteca de destino.";
    const claveDestino = claveInstantanea(op.destino);
    if (claveDestino === claveInstantanea(op.origen)) {
        return "El destino es la misma biblioteca que el origen.";
    }
    if (!instantaneas[claveDestino]) {
        return `No hay instantánea de la biblioteca de destino (${claveDestino}).`;
    }
    return null;
}

/**
 * Selecciona los ítems de origen a tratar y anota los OMITES con su motivo
 * (nunca silencio, español con acentos). Los permisos llegan ya calculados
 * desde quien conoce la ACL; aquí solo se consultan.
 */
function seleccionar(
    op: OperacionBiblioteca,
    docOrigen: EntityLibraryDoc,
    permisos: PermisosPlan,
    acum: Acum,
    opciones: { editarOrigen: boolean; destino?: { ref: EntityRef; doc: EntityLibraryDoc } },
): SavedItem[] {
    const pedidos = op.itemIds ? [...op.itemIds].sort() : docOrigen.items.map((it) => it.id).sort();
    const porId = new Map(docOrigen.items.map((it) => [it.id, it] as const));
    const elegibles: SavedItem[] = [];
    for (const id of pedidos) {
        const it = porId.get(id);
        if (!it) {
            omitir(acum, id, "No existe en la biblioteca de origen.");
            continue;
        }
        if (!permisos.puedeVer(op.origen, it)) {
            omitir(acum, id, "Sin permiso para ver este ítem.");
            continue;
        }
        if (opciones.editarOrigen && !permisos.puedeEditar(op.origen, it)) {
            omitir(acum, id, "Sin permiso para editar este ítem.");
            continue;
        }
        if (opciones.destino && !permisos.puedeEditar(opciones.destino.ref, it)) {
            omitir(acum, id, "Sin permiso para escribir en la biblioteca de destino.");
            continue;
        }
        elegibles.push(it);
    }
    return elegibles;
}

/**
 * Copiar: crea en el destino UNA REFERENCIA nueva por ítem; nunca pisa lo que
 * ya está (mismo id o misma referencia en `refId`). Deshacer = quitar lo creado.
 */
function planCopiar(
    op: OperacionBiblioteca,
    docOrigen: EntityLibraryDoc,
    docDestino: EntityLibraryDoc,
    permisos: PermisosPlan,
    acum: Acum,
): void {
    const destino = { ref: op.destino as EntityRef, doc: docDestino };
    for (const it of seleccionar(op, docOrigen, permisos, acum, { editarOrigen: false, destino })) {
        if (docDestino.items.some((o) => o.id === it.id)) {
            omitir(acum, it.id, "Ya existe un ítem con el mismo id en el destino.");
            continue;
        }
        if (it.refId && docDestino.items.some((o) => o.refId === it.refId)) {
            omitir(acum, it.id, "La misma referencia ya está guardada en el destino.");
            continue;
        }
        acum.vista.crea.push(it.id);
        acum.deshacer.push({ op: "quitar", ref: destino.ref, itemId: it.id });
    }
}

/**
 * Mover: referencia en el destino + lápida reversible en el origen. El ítem
 * NO se pierde (se restaura), pero si el contenido solo vive aquí se avisa de
 * la última copia antes de quitarla.
 */
function planMover(
    op: OperacionBiblioteca,
    docOrigen: EntityLibraryDoc,
    docDestino: EntityLibraryDoc,
    permisos: PermisosPlan,
    acum: Acum,
    instantaneas: Record<string, EntityLibraryDoc>,
    claveOrigen: string,
): void {
    const destino = { ref: op.destino as EntityRef, doc: docDestino };
    for (const it of seleccionar(op, docOrigen, permisos, acum, { editarOrigen: true, destino })) {
        if (docDestino.items.some((o) => o.id === it.id)) {
            omitir(acum, it.id, "Ya existe un ítem con el mismo id en el destino.");
            continue;
        }
        if (it.refId && docDestino.items.some((o) => o.refId === it.refId)) {
            omitir(acum, it.id, "La misma referencia ya está guardada en el destino.");
            continue;
        }
        if (esUltimaCopia(it, claveOrigen, instantaneas, false)) {
            acum.vista.ultimaCopia.push(it.id);
            acum.avisos.push(`«${it.title}» es la última copia: haz una antes de quitarla.`);
        }
        acum.vista.crea.push(it.id);
        acum.vista.quitaReversible.push(it.id);
        acum.deshacer.push({ op: "quitar", ref: destino.ref, itemId: it.id });
        acum.deshacer.push({ op: "restaurar", ref: op.origen, itemId: it.id, haciaCarpeta: it.folderId ?? null });
    }
}

/**
 * Fusionar: trae al destino lo que le FALTA del origen y NUNCA toca lo que ya
 * tiene (ni en el destino ni en el origen: borrar aquí no existe).
 */
function planFusionar(
    op: OperacionBiblioteca,
    docOrigen: EntityLibraryDoc,
    docDestino: EntityLibraryDoc,
    permisos: PermisosPlan,
    acum: Acum,
): void {
    const destino = { ref: op.destino as EntityRef, doc: docDestino };
    for (const it of seleccionar(op, docOrigen, permisos, acum, { editarOrigen: false, destino })) {
        const yaEsta =
            docDestino.items.some((o) => o.id === it.id) ||
            (!!it.refId && docDestino.items.some((o) => o.refId === it.refId)) ||
            (!!it.url && docDestino.items.some((o) => o.url === it.url));
        if (yaEsta) {
            omitir(acum, it.id, "Ya está en el destino; fusionar nunca lo toca.");
            continue;
        }
        acum.vista.crea.push(it.id);
        acum.deshacer.push({ op: "quitar", ref: destino.ref, itemId: it.id });
    }
}

/**
 * Quitar: SIEMPRE reversible (lápida, nunca borrado definitivo) y, si el
 * contenido no queda conservado en ninguna otra entrada, aviso de última
 * copia ANTES de quitarla. «Ningún borrado se propaga solo».
 */
function planQuitar(
    op: OperacionBiblioteca,
    docOrigen: EntityLibraryDoc,
    permisos: PermisosPlan,
    acum: Acum,
    instantaneas: Record<string, EntityLibraryDoc>,
    claveOrigen: string,
): void {
    for (const it of seleccionar(op, docOrigen, permisos, acum, { editarOrigen: true })) {
        if (esUltimaCopia(it, claveOrigen, instantaneas, false)) {
            acum.vista.ultimaCopia.push(it.id);
            acum.avisos.push(`«${it.title}» es la última copia: haz una antes de quitarla.`);
        }
        acum.vista.quitaReversible.push(it.id);
        acum.deshacer.push({ op: "restaurar", ref: op.origen, itemId: it.id, haciaCarpeta: it.folderId ?? null });
    }
}

/**
 * Deduplicar: solo PROPONE. Agrupa por `refId`, `url` o `title`+`type`; en
 * `modifica` quedan los que sobrarían, jamás los de `ultimaCopia`, y NADA
 * se quita sin confirmación humana.
 */
function planDeduplicar(
    op: OperacionBiblioteca,
    docOrigen: EntityLibraryDoc,
    permisos: PermisosPlan,
    acum: Acum,
    instantaneas: Record<string, EntityLibraryDoc>,
    claveOrigen: string,
): void {
    acum.avisos.push("La deduplicación solo PROPONE: no se quita nada sin confirmación humana.");
    const elegibles = seleccionar(op, docOrigen, permisos, acum, { editarOrigen: true });
    const grupos = new Map<string, SavedItem[]>();
    for (const it of elegibles) {
        const clave = it.refId ? `ref:${it.refId}` : it.url ? `url:${it.url}` : `tit:${it.type}::${it.title}`;
        const grupo = grupos.get(clave) ?? [];
        grupo.push(it); // elegibles ya va ordenado por id: el primero queda fijo
        grupos.set(clave, grupo);
    }
    for (const clave of [...grupos.keys()].sort()) {
        const grupo = grupos.get(clave) as SavedItem[];
        if (grupo.length < 2) continue;
        for (const sobrante of grupo.slice(1)) {
            if (esUltimaCopia(sobrante, claveOrigen, instantaneas, true)) continue;
            acum.vista.modifica.push(sobrante.id);
        }
    }
}

/**
 * Resumen para personas, en español con acentos: «Copiarías 3, omitiría 1…».
 * Determinista: los mismos datos dan el mismo texto.
 */
function resumenPlanInterno(plan: PlanBiblioteca): string {
    const v = plan.vistaPrevia;
    const nCrea = v.crea.length;
    const nOmite = v.omite.length;
    const nQuita = v.quitaReversible.length;
    const nMod = v.modifica.length;
    const nUlt = v.ultimaCopia.length;
    const cuantos = (n: number, uno: string, muchos: string) => (n === 1 ? uno : muchos);
    const partes: string[] = [];
    switch (plan.operacion.tipo) {
        case "copiar":
            if (nCrea) partes.push(cuantos(nCrea, "Copiaría 1", `Copiarías ${nCrea}`));
            break;
        case "mover":
            if (nCrea) partes.push(cuantos(nCrea, "Movería 1", `Moverías ${nCrea}`));
            break;
        case "fusionar":
            if (nCrea) partes.push(cuantos(nCrea, "Fusionaría 1", `Fusionarías ${nCrea}`));
            break;
        case "quitar":
            if (nQuita) partes.push(cuantos(nQuita, "Quitaría 1 (reversible)", `Quitarías ${nQuita} (reversible)`));
            break;
        case "deduplicar":
            if (nMod) partes.push(cuantos(nMod, "Propondría quitar 1 duplicado", `Propondría quitar ${nMod} duplicados`));
            break;
    }
    if (nOmite) partes.push(cuantos(nOmite, "omitiría 1", `omitirías ${nOmite}`));
    if (nUlt) partes.push(cuantos(nUlt, "habría 1 última copia", `habría ${nUlt} últimas copias`));
    if (!partes.length) return plan.validacion.ok ? "No haría nada." : plan.validacion.errores[0];
    const cuerpo = partes.join(", ");
    const texto = `${cuerpo.charAt(0).toUpperCase()}${cuerpo.slice(1)}.`;
    if (plan.operacion.tipo === "deduplicar") {
        return `${texto} No se quita nada sin tu confirmación.`;
    }
    return texto;
}
