/* biblioteca-plan — validar → vista previa → deshacer, sin ejecutar nada.
 * Patrón de Spacedrive. Puro: sin red, disco ni reloj; instantáneas y permisos
 * entran por parámetro. Entidad Única: se referencia, no se duplica. */
import type { EntityLibraryDoc, EntityRef, SavedItem } from "./entity-library";

export type TipoOperacionBiblioteca = "copiar" | "mover" | "fusionar" | "quitar" | "deduplicar";
export interface OperacionBiblioteca { tipo: TipoOperacionBiblioteca; origen: EntityRef; destino?: EntityRef; itemIds?: string[]; }
export interface PasoDeshacer { op: "quitar" | "restaurar" | "mover"; ref: EntityRef; itemId: string; haciaCarpeta?: string | null; }
export interface VistaPreviaBiblioteca { crea: string[]; modifica: string[]; omite: { id: string; motivo: string }[]; quitaReversible: string[]; ultimaCopia: string[]; }
export interface PlanBiblioteca { operacion: OperacionBiblioteca; validacion: { ok: boolean; errores: string[]; avisos: string[] }; vistaPrevia: VistaPreviaBiblioteca; deshacer: PasoDeshacer[]; }
export interface PermisosBiblioteca { puedeVer(ref: EntityRef, item: SavedItem): boolean; puedeEditar(ref: EntityRef, item?: SavedItem): boolean; }
const AVISO_ULTIMA = "es la última copia: haz una antes de quitarla";
const AVISO_DEDUP = "no se quita nada sin confirmación humana: la deduplicación solo propone";
const clave = (ref: EntityRef): string => `${ref.kind}:${ref.id}`;
const iguales = (a: EntityRef, b: EntityRef): boolean => a.kind === b.kind && a.id === b.id;
const ordenar = (xs: string[]): string[] => [...xs].sort((a, b) => a.localeCompare(b));
const vacia = (): VistaPreviaBiblioteca => ({ crea: [], modifica: [], omite: [], quitaReversible: [], ultimaCopia: [] });
const comparteRecurso = (a: SavedItem, b: SavedItem): boolean => (!!a.refId && a.refId === b.refId) || (!!a.url && a.url === b.url);
const mismaFicha = (a: SavedItem, b: SavedItem): boolean =>
    a.id !== b.id && (comparteRecurso(a, b) || (a.title === b.title && a.type === b.type));
const esUltimaCopia = (item: SavedItem, docs: Record<string, EntityLibraryDoc>, k: string): boolean =>
    Object.entries(docs).every(([kd, doc]) => kd === k || !doc.items.some((otro) => comparteRecurso(item, otro)));

function conflicto(item: SavedItem, doc: EntityLibraryDoc, conUrl: boolean): string | null {
    for (const otro of doc.items) {
        if (otro.id === item.id) return "ya existe un ítem con ese id en el destino";
        if (comparteRecurso(item, otro)) return "el destino ya tiene un ítem con el mismo recurso (Entidad Única)";
        if (conUrl && item.url && otro.url === item.url) return "el destino ya tiene un ítem con la misma URL";
    }
    return null;
}

export function planificar(op: OperacionBiblioteca, instantaneas: Record<string, EntityLibraryDoc>, permisos: PermisosBiblioteca): PlanBiblioteca {
    const errores: string[] = [], avisos: string[] = [], v = vacia(), deshacer: PasoDeshacer[] = [];
    const kOrigen = clave(op.origen), origen = instantaneas[kOrigen];
    if (!origen) return salida(op, [`No encuentro la biblioteca de origen (${kOrigen}).`], avisos, v, deshacer);
    const kDestino = op.destino ? clave(op.destino) : "", destino = op.destino ? instantaneas[kDestino] : undefined;
    if (op.tipo === "copiar" || op.tipo === "mover" || op.tipo === "fusionar") {
        if (!op.destino) errores.push("Falta la biblioteca de destino para esta operación.");
        else if (iguales(op.origen, op.destino)) errores.push("El destino es la misma biblioteca que el origen.");
        else if (!destino) errores.push(`No encuentro la biblioteca de destino (${kDestino}).`);
        else if (!permisos.puedeEditar(op.destino)) errores.push("No tienes permiso para editar la biblioteca de destino.");
    }
    if (op.tipo !== "copiar" && op.tipo !== "fusionar" && !permisos.puedeEditar(op.origen)) errores.push("No tienes permiso para editar la biblioteca de origen.");
    const visibles = origen.items.filter((it) => permisos.puedeVer(op.origen, it));
    if (origen.items.length > 0 && visibles.length === 0) errores.push("No tienes permiso para ver la biblioteca de origen.");
    const omitir = (id: string, motivo: string) => v.omite.push({ id, motivo });
    const porId = new Map(visibles.map((it) => [it.id, it])), items: SavedItem[] = [];
    for (const id of ordenar(op.itemIds ?? origen.items.map((it) => it.id))) {
        const it = porId.get(id);
        if (it) items.push(it);
        else if (origen.items.some((o) => o.id === id)) omitir(id, "la ACL del ítem no te permite verlo");
        else errores.push(`No encuentro el ítem «${id}» en la biblioteca de origen.`);
    }
    if (errores.length) return salida(op, errores, avisos, vacia(), []);
    if (op.tipo === "copiar" && op.destino && destino) for (const it of items) {
        if (!permisos.puedeEditar(op.destino, it)) { omitir(it.id, "la ACL del destino no te permite editar este ítem"); continue; }
        const motivo = conflicto(it, destino, false);
        if (motivo) { omitir(it.id, motivo); continue; }
        v.crea.push(it.id); deshacer.push({ op: "quitar", ref: op.destino, itemId: it.id });
    }
    if (op.tipo === "mover" && op.destino && destino) for (const it of items) {
        if (!permisos.puedeEditar(op.origen, it) || !permisos.puedeEditar(op.destino, it)) { omitir(it.id, "la ACL del ítem no te permite moverlo"); continue; }
        const motivo = conflicto(it, destino, true);
        if (motivo) { omitir(it.id, motivo); continue; }
        v.crea.push(it.id); v.quitaReversible.push(it.id);
        if (esUltimaCopia(it, instantaneas, kOrigen)) v.ultimaCopia.push(it.id);
        deshacer.push({ op: "quitar", ref: op.destino, itemId: it.id });
        deshacer.push({ op: "restaurar", ref: op.origen, itemId: it.id, haciaCarpeta: it.folderId ?? null });
    }
    if (op.tipo === "fusionar" && op.destino && destino) {
        avisos.push("fusionar nunca borra: lo que ya existe en el destino se conserva sin cambios");
        for (const it of items) {
            if (!permisos.puedeEditar(op.destino, it)) { omitir(it.id, "la ACL del destino no te permite fusionar este ítem"); continue; }
            const motivo = conflicto(it, destino, true);
            if (motivo) { omitir(it.id, motivo); continue; }
            v.crea.push(it.id); deshacer.push({ op: "quitar", ref: op.destino, itemId: it.id });
        }
    }
    if (op.tipo === "quitar") for (const it of items) {
        if (!permisos.puedeEditar(op.origen, it)) { omitir(it.id, "la ACL del ítem no te permite quitarlo"); continue; }
        v.quitaReversible.push(it.id);
        if (esUltimaCopia(it, instantaneas, kOrigen)) v.ultimaCopia.push(it.id);
        deshacer.push({ op: "restaurar", ref: op.origen, itemId: it.id, haciaCarpeta: it.folderId ?? null });
    }
    if (op.tipo === "deduplicar") {
        const grupos: SavedItem[][] = [];
        for (const it of items) {
            const grupo = grupos.find((g) => g.some((o) => mismaFicha(o, it)));
            if (grupo) grupo.push(it); else grupos.push([it]);
        }
        for (const grupo of grupos) if (grupo.length > 1) for (const it of [...grupo].sort((a, b) => a.id.localeCompare(b.id)).slice(1)) {
            if (!permisos.puedeEditar(op.origen, it)) { omitir(it.id, "la ACL del ítem no te permite proponer su retirada"); continue; }
            v.modifica.push(it.id);
        }
        if (v.modifica.length) avisos.push(AVISO_DEDUP);
    }
    if ((op.tipo === "quitar" || op.tipo === "mover") && v.ultimaCopia.length) avisos.push(AVISO_ULTIMA);
    return salida(op, errores, avisos, v, deshacer);
}

export function resumenPlan(plan: PlanBiblioteca): string {
    const { validacion, vistaPrevia, operacion } = plan;
    if (!validacion.ok) return `No se puede ${operacion.tipo}: ${validacion.errores.length} error(es).`;
    const verbo = { copiar: "Copiarías", mover: "Moverías", fusionar: "Fusionarías", quitar: "Quitarías", deduplicar: "Propondrías quitar" }[operacion.tipo];
    const cuantos = operacion.tipo === "quitar" ? vistaPrevia.quitaReversible.length : operacion.tipo === "deduplicar" ? vistaPrevia.modifica.length : vistaPrevia.crea.length;
    const partes = [`${verbo} ${cuantos}`];
    if (vistaPrevia.omite.length) partes.push(`omitiría ${vistaPrevia.omite.length}`);
    if (vistaPrevia.ultimaCopia.length) partes.push(`cuidado: ${vistaPrevia.ultimaCopia.length} es la última copia`);
    return `${partes.join(", ")}.`;
}

function salida(op: OperacionBiblioteca, errores: string[], avisos: string[], v: VistaPreviaBiblioteca, deshacer: PasoDeshacer[]): PlanBiblioteca {
    return {
        operacion: op,
        validacion: { ok: errores.length === 0, errores: ordenar(errores), avisos: ordenar(avisos) },
        vistaPrevia: { ...v, omite: [...v.omite].sort((a, b) => a.id.localeCompare(b.id)), crea: ordenar(v.crea), modifica: ordenar(v.modifica), quitaReversible: ordenar(v.quitaReversible), ultimaCopia: ordenar(v.ultimaCopia) },
        deshacer: [...deshacer].sort((a, b) => `${a.op}|${clave(a.ref)}|${a.itemId}`.localeCompare(`${b.op}|${clave(b.ref)}|${b.itemId}`)),
    };
}
