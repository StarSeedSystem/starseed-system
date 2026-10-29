// StarSeed OS — Plan de la Biblioteca (Ola 1025R · INF1025G · patrón Spacedrive)
// Validar → vista previa → ejecutar → deshacer. Módulo PURO: planifica y NUNCA
// ejecuta nada (sin red, disco ni reloj); solo `import type` de entity-library.
import type { EntityLibraryDoc, SavedItem } from "./entity-library";
import {
    ceroCopiasAdemas, choqueEn, claveRef, ordenar, ordenarOmite, seleccion,
    type OperacionBiblioteca, type PasoDeshacer, type PermisosBiblioteca, type PlanBiblioteca,
} from "./biblioteca-plan.tipos";

export type { TipoOperacion, OperacionBiblioteca, PasoDeshacer, PlanBiblioteca, PermisosBiblioteca } from "./biblioteca-plan.tipos";

export function planificar(
    op: OperacionBiblioteca,
    instantaneas: Record<string, EntityLibraryDoc>,
    permisos: PermisosBiblioteca,
): PlanBiblioteca {
    const errores: string[] = [];
    const avisos: string[] = [];
    const omite: { id: string; motivo: string }[] = [];
    const crea: string[] = [];
    const modifica: string[] = [];
    const quitaReversible: string[] = [];
    const ultimaCopia: string[] = [];
    const deshacer: PasoDeshacer[] = [];
    const traeDestino = op.tipo === "copiar" || op.tipo === "mover" || op.tipo === "fusionar";
    const origen = instantaneas[claveRef(op.origen)];
    const destino = op.destino ? instantaneas[claveRef(op.destino)] : undefined;
    const esUltima = (it: SavedItem): boolean => ceroCopiasAdemas(it, instantaneas);
    const avisoUltima = (it: SavedItem): void => {
        ultimaCopia.push(it.id);
        avisos.push(`«${it.title}» es la última copia: haz una antes de quitarla`);
    };
    const sinPermisos = (ver: boolean, it: SavedItem): void => {
        omite.push({ id: it.id, motivo: ver ? "sin permiso de lectura de este ítem" : "El acl no permite esta acción" });
    };

    // ── Validar: los problemas nunca van en silencio ──
    if (traeDestino) {
        if (!op.destino) errores.push("Esta operación necesita una biblioteca de destino.");
        else if (destino && claveRef(op.origen) === claveRef(op.destino))
            errores.push("El origen y el destino son la misma biblioteca.");
        if (op.destino && !destino) errores.push("Falta la instantánea de la biblioteca de destino.");
    }
    if (!origen) errores.push("Falta la instantánea de la biblioteca de origen.");
    if (origen && !permisos.puedeVer(op.origen)) errores.push("No tienes permiso para leer la biblioteca de origen.");
    if (origen && traeDestino && op.destino && destino && !permisos.puedeEditar(op.destino))
        errores.push("No tienes permiso para editar la biblioteca de destino.");
    if (origen && !traeDestino && (op.tipo === "quitar" || op.tipo === "mover") && !permisos.puedeEditar(op.origen))
        errores.push("No tienes permiso para editar la biblioteca de origen.");

    if (!errores.length && origen) {
        if (traeDestino && destino) {
            for (const it of seleccion(origen.items, op.itemIds)) {
                if (!permisos.puedeVer(op.origen, it)) { sinPermisos(true, it); continue; }
                if (op.tipo === "mover" && !permisos.puedeEditar(op.origen, it)) { sinPermisos(false, it); continue; }
                const choque = choqueEn(destino, it);
                if (choque) { omite.push({ id: it.id, motivo: choque }); continue; }
                crea.push(it.id);
                if (op.tipo === "mover") {
                    quitaReversible.push(it.id); // lápida en el origen: reversible
                    deshacer.push({ op: "mover", ref: op.origen, itemId: it.id, haciaCarpeta: it.folderId ?? null });
                    if (esUltima(it)) avisoUltima(it);
                } else if (op.destino) {
                    deshacer.push({ op: "quitar", ref: op.destino, itemId: it.id }); // deshace copiar/fusionar
                }
            }
        } else if (op.tipo === "quitar") {
            for (const it of seleccion(origen.items, op.itemIds)) {
                if (!permisos.puedeVer(op.origen, it)) { sinPermisos(true, it); continue; }
                if (!permisos.puedeEditar(op.origen, it)) { sinPermisos(false, it); continue; }
                quitaReversible.push(it.id);
                deshacer.push({ op: "restaurar", ref: op.origen, itemId: it.id });
                if (esUltima(it)) avisoUltima(it);
            }
        } else if (op.tipo === "deduplicar") {
            const grupos = new Map<string, SavedItem[]>();
            for (const it of origen.items) {
                const k = it.refId ? `ref:${it.refId}` : it.url ? `url:${it.url}` : `titulo:${it.type}:${it.title}`;
                grupos.set(k, [...(grupos.get(k) ?? []), it]);
            }
            for (const g of grupos.values()) {
                const sobran = [...g]
                    .sort((a, b) => (Date.parse(a.addedAt) || 0) - (Date.parse(b.addedAt) || 0) || a.id.localeCompare(b.id))
                    .slice(1);
                for (const it of sobran) {
                    if (!permisos.puedeVer(op.origen, it)) { sinPermisos(true, it); continue; }
                    if (!esUltima(it)) modifica.push(it.id); // jamás propone quitar una última copia
                }
            }
            avisos.push("La deduplicación solo propone: no se quita nada sin confirmación humana.");
        }
    }

    return {
        operacion: op,
        validacion: { ok: errores.length === 0, errores, avisos: [...new Set(avisos)] },
        vistaPrevia: {
            crea: ordenar(crea), modifica: ordenar(modifica), omite: ordenarOmite(omite),
            quitaReversible: ordenar(quitaReversible), ultimaCopia: ordenar(ultimaCopia),
        },
        deshacer,
    };
}

export function resumenPlan(plan: PlanBiblioteca): string {
    const v = plan.vistaPrevia;
    const omitidas = v.omite.length;
    switch (plan.operacion.tipo) {
        case "copiar":
            return `Copiarías ${v.crea.length}, omitirías ${omitidas}.`;
        case "mover":
            return `Moverías ${v.crea.length}, quitarías ${v.quitaReversible.length} del origen, omitirías ${omitidas}.`;
        case "fusionar":
            return `Añadirías ${v.crea.length}, omitirías ${omitidas}; lo que el destino ya tiene no se toca.`;
        case "quitar":
            return `Quitarías ${v.quitaReversible.length} (reversible), omitirías ${omitidas}.`;
        case "deduplicar":
            return `Quitarías ${v.modifica.length} duplicados solo si lo confirmas tú, omitirías ${omitidas}.`;
    }
}
