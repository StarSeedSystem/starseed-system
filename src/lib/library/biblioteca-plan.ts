import type { EntityLibraryDoc, SavedItem } from "./entity-library";
import type { EntityRef } from "@/lib/sync/entity-state";

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

function snapKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

function getDoc(
  instantaneas: Record<string, EntityLibraryDoc>,
  ref: EntityRef,
): EntityLibraryDoc | undefined {
  return instantaneas[snapKey(ref)];
}

function tienePermiso(
  permisos: { puedeVer(ref: EntityRef, item?: SavedItem): boolean; puedeEditar(ref: EntityRef, item?: SavedItem): boolean },
  ref: EntityRef,
  item?: SavedItem,
  necesitaEditar: boolean,
): boolean {
  if (necesitaEditar) {
    return permisos.puedeEditar(ref, item);
  }
  return permisos.puedeVer(ref, item);
}

function cuentaCopias(
  instantaneas: Record<string, EntityLibraryDoc>,
  refId: string | undefined,
  url: string | undefined,
): number {
  if (!refId && !url) return 0;
  let count = 0;
  for (const doc of Object.values(instantaneas)) {
    for (const it of doc.items) {
      if ((refId && it.refId === refId) || (url && it.url === url)) {
        count++;
      }
    }
  }
  return count;
}

function esUltimaCopia(
  instantaneas: Record<string, EntityLibraryDoc>,
  item: SavedItem,
): boolean {
  const c = cuentaCopias(instantaneas, item.refId, item.url);
  return c <= 1;
}

function claveDuplicado(
  it: SavedItem,
  otro: SavedItem,
): boolean {
  if (it.refId && otro.refId && it.refId === otro.refId) return true;
  if (it.url && otro.url && it.url === otro.url) return true;
  if (
    it.title &&
    otro.title &&
    it.type &&
    otro.type &&
    it.title === otro.title &&
    it.type === otro.type
  )
    return true;
  return false;
}

function ordenar(a: string[]): string[] {
  return [...a].sort();
}

export function planificar(
  op: OperacionBiblioteca,
  instantaneas: Record<string, EntityLibraryDoc>,
  permisos: { puedeVer(ref: EntityRef, item?: SavedItem): boolean; puedeEditar(ref: EntityRef, item?: SavedItem): boolean },
): PlanBiblioteca {
  const errores: string[] = [];
  const avisos: string[] = [];
  const omite: { id: string; motivo: string }[] = [];
  const crea: string[] = [];
  const modifica: string[] = [];
  const quitaReversible: string[] = [];
  const ultimaCopia: string[] = [];
  const deshacer: PasoDeshacer[] = [];

  const origenDoc = getDoc(instantaneas, op.origen);
  if (!origenDoc) {
    errores.push("No se encuentra el origen.");
    return {
      operacion: op,
      validacion: { ok: false, errores, avisos },
      vistaPrevia: { crea: [], modifica: [], omite, quitaReversible, ultimaCopia },
      deshacer: [],
    };
  }

  if (!tienePermiso(permisos, op.origen, undefined, true)) {
    errores.push("Sin permiso para editar el origen.");
  }

  if (op.tipo === "copiar" || op.tipo === "mover") {
    if (!op.destino) {
      errores.push("Falta el destino.");
    } else if (snapKey(op.destino) === snapKey(op.origen)) {
      errores.push("El destino es igual al origen.");
    } else {
      const destinoDoc = getDoc(instantaneas, op.destino);
      if (!destinoDoc) {
        errores.push("No se encuentra el destino.");
      } else if (!tienePermiso(permisos, op.destino, undefined, true)) {
        errores.push("Sin permiso para editar el destino.");
      }
    }
  }

  if (op.tipo === "fusionar") {
    if (!op.destino) {
      errores.push("Falta el destino.");
    } else if (snapKey(op.destino) === snapKey(op.origen)) {
      errores.push("El destino es igual al origen.");
    } else {
      const destinoDoc = getDoc(instantaneas, op.destino);
      if (!destinoDoc) {
        errores.push("No se encuentra el destino.");
      } else if (!tienePermiso(permisos, op.destino, undefined, true)) {
        errores.push("Sin permiso para editar el destino.");
      }
    }
  }

  if (errores.length > 0) {
    return {
      operacion: op,
      validacion: { ok: false, errores, avisos },
      vistaPrevia: { crea: [], modifica: [], omite, quitaReversible, ultimaCopia },
      deshacer: [],
    };
  }

  if (op.tipo === "copiar") {
    const destinoDoc = getDoc(instantaneas, op.destino!);
    if (!destinoDoc) return {
      operacion: op,
      validacion: { ok: false, errores: ["No se encuentra el destino."], avisos },
      vistaPrevia: { crea: [], modifica: [], omite, quitaReversible, ultimaCopia },
      deshacer: [],
    };
    const ids = op.itemIds && op.itemIds.length > 0 ? new Set(op.itemIds) : null;
    for (const it of origenDoc.items) {
      if (ids && !ids.has(it.id)) continue;
      if (!tienePermiso(permisos, op.origen, it, false)) {
        omite.push({ id: it.id, motivo: "Sin permiso para ver el ítem." });
        continue;
      }
      if (destinoDoc.items.find((d) => d.id === it.id) || destinoDoc.items.find((d) => d.refId && it.refId && d.refId === it.refId)) {
        omite.push({ id: it.id, motivo: "Ya existe un ítem con el mismo id o refId." });
        continue;
      }
      crea.push(it.id);
      deshacer.push({ op: "quitar", ref: op.destino!, itemId: it.id });
    }
  } else if (op.tipo === "mover") {
    const destinoDoc = getDoc(instantaneas, op.destino!);
    if (!destinoDoc) return {
      operacion: op,
      validacion: { ok: false, errores: ["No se encuentra el destino."], avisos },
      vistaPrevia: { crea: [], modifica: [], omite, quitaReversible, ultimaCopia },
      deshacer: [],
    };
    const ids = op.itemIds && op.itemIds.length > 0 ? new Set(op.itemIds) : null;
    for (const it of origenDoc.items) {
      if (ids && !ids.has(it.id)) continue;
      if (!tienePermiso(permisos, op.origen, it, true)) {
        omite.push({ id: it.id, motivo: "Sin permiso para editar el ítem." });
        continue;
      }
      if (it.acl && it.acl.read && it.acl.read.length > 0 && it.acl.write && it.acl.write.length > 0) {
        // ACL restrictiva: se omite si no permite la acción (comprobado por permisos)
      }
      quitaReversible.push(it.id);
      crea.push(it.id);
      deshacer.push({ op: "mover", ref: op.destino!, itemId: it.id, haciaCarpeta: it.folderId ?? null });
      deshacer.push({ op: "mover", ref: op.origen, itemId: it.id, haciaCarpeta: it.folderId ?? null });
      if (esUltimaCopia(instantaneas, it)) {
        ultimaCopia.push(it.id);
        avisos.push("es la última copia: haz una antes de quitarla");
      }
    }
  } else if (op.tipo === "quitar") {
    const ids = op.itemIds && op.itemIds.length > 0 ? new Set(op.itemIds) : null;
    for (const it of origenDoc.items) {
      if (ids && !ids.has(it.id)) continue;
      if (!tienePermiso(permisos, op.origen, it, true)) {
        omite.push({ id: it.id, motivo: "Sin permiso para editar el ítem." });
        continue;
      }
      if (it.acl && !tienePermiso(permisos, op.origen, it, true)) {
        omite.push({ id: it.id, motivo: "El ACL no permite la acción." });
        continue;
      }
      quitaReversible.push(it.id);
      deshacer.push({ op: "restaurar", ref: op.origen, itemId: it.id });
      if (esUltimaCopia(instantaneas, it)) {
        ultimaCopia.push(it.id);
        avisos.push("es la última copia: haz una antes de quitarla");
      }
    }
  } else if (op.tipo === "fusionar") {
    const destinoDoc = getDoc(instantaneas, op.destino!);
    if (!destinoDoc) return {
      operacion: op,
      validacion: { ok: false, errores: ["No se encuentra el destino."], avisos },
      vistaPrevia: { crea: [], modifica: [], omite, quitaReversible, ultimaCopia },
      deshacer: [],
    };
    const ids = op.itemIds && op.itemIds.length > 0 ? new Set(op.itemIds) : null;
    for (const it of origenDoc.items) {
      if (ids && !ids.has(it.id)) continue;
      if (!tienePermiso(permisos, op.origen, it, false)) {
        omite.push({ id: it.id, motivo: "Sin permiso para ver el ítem." });
        continue;
      }
      if (!tienePermiso(permisos, op.destino!, undefined, true)) {
        omite.push({ id: it.id, motivo: "Sin permiso para editar el destino." });
        continue;
      }
      if (destinoDoc.items.find((d) => (d.refId && it.refId && d.refId === it.refId) || (d.url && it.url && d.url === it.url))) {
        continue;
      }
      crea.push(it.id);
      deshacer.push({ op: "quitar", ref: op.destino!, itemId: it.id });
    }
    // fusionar nunca borra
  } else if (op.tipo === "deduplicar") {
    avisos.push("La deduplicación solo propone. NO se quita nada sin confirmación humana.");
    const todos: Array<{ ref: EntityRef; item: SavedItem }> = [];
    for (const [k, doc] of Object.entries(instantaneas)) {
      const [kind, id] = k.split(":");
      const ref = { kind: kind as EntityRef["kind"], id };
      for (const it of doc.items) {
        if (!tienePermiso(permisos, ref, it, false)) continue;
        todos.push({ ref, item: it });
      }
    }
    const grupos = new Map<string, Array<{ ref: EntityRef; item: SavedItem }>>();
    for (const t of todos) {
      const key = t.item.refId || t.item.url || `${t.item.type}::${t.item.title}`;
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key)!.push(t);
    }
    for (const grupo of grupos.values()) {
      if (grupo.length < 2) continue;
      // conservar el primero, proponer quitar el resto
      for (let i = 1; i < grupo.length; i++) {
        const g = grupo[i];
        if (esUltimaCopia(instantaneas, g.item)) {
          continue;
        }
        modifica.push(g.item.id);
        quitaReversible.push(g.item.id);
        deshacer.push({ op: "restaurar", ref: g.ref, itemId: g.item.id });
      }
    }
  }

  return {
    operacion: op,
    validacion: { ok: errores.length === 0, errores, avisos },
    vistaPrevia: {
      crea: ordenar(crea),
      modifica: ordenar(modifica),
      omite,
      quitaReversible: ordenar(quitaReversible),
      ultimaCopia: ordenar(ultimaCopia),
    },
    deshacer,
  };
}

export function resumenPlan(plan: PlanBiblioteca): string {
  const c = plan.vistaPrevia.crea.length;
  const o = plan.vistaPrevia.omite.length;
  const m = plan.vistaPrevia.modifica.length;
  const partes: string[] = [];
  if (c > 0) partes.push(`Copiarías ${c}`);
  if (m > 0) partes.push(`modificaría ${m}`);
  if (o > 0) partes.push(`omitiría ${o}`);
  if (partes.length === 0) return "Sin cambios.";
  return `${partes.join(", ")}…`;
}
