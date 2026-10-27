import type { EntityLibraryDoc, SavedItem, EntityRef } from "@/lib/library/entity-library";

export type OperacionBiblioteca = {
  tipo: "copiar" | "mover" | "fusionar" | "quitar" | "deduplicar";
  origen: EntityRef;
  destino?: EntityRef;
  itemIds?: string[];
};

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

function refKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

function getAllItems(instantaneas: Record<string, EntityLibraryDoc>): Array<{ ref: EntityRef; refKeyStr: string; item: SavedItem }> {
  const result: Array<{ ref: EntityRef; refKeyStr: string; item: SavedItem }> = [];
  for (const k of Object.keys(instantaneas).sort()) {
    const doc = instantaneas[k];
    if (!doc) continue;
    const [kind, ...idParts] = k.split(":");
    const id = idParts.join(":");
    const ref = { kind: kind as any, id };
    for (const item of doc.items || []) {
      result.push({ ref, refKeyStr: k, item });
    }
  }
  return result;
}

function itemHasOtherCopy(
  item: SavedItem,
  itemRef: EntityRef,
  instantaneas: Record<string, EntityLibraryDoc>
): boolean {
  const all = getAllItems(instantaneas);
  for (const other of all) {
    const sameRef = other.refKeyStr === refKey(itemRef) && other.item.id === item.id;
    if (sameRef) continue;
    if (item.refId && other.item.refId && item.refId === other.item.refId) return true;
    if (item.url && other.item.url && item.url === other.item.url) return true;
  }
  return false;
}

export function planificar(
  op: OperacionBiblioteca,
  instantaneas: Record<string, EntityLibraryDoc>,
  permisos: { puedeVer(ref: EntityRef, item: SavedItem): boolean; puedeEditar(ref: EntityRef, item?: SavedItem): boolean }
): PlanBiblioteca {
  const errores: string[] = [];
  const avisos: string[] = [];
  const omite: { id: string; motivo: string }[] = [];
  const crea: string[] = [];
  const modifica: string[] = [];
  const quitaReversible: string[] = [];
  const ultimaCopia: string[] = [];
  const deshacer: PasoDeshacer[] = [];

  const origenKey = refKey(op.origen);
  const origenDoc = instantaneas[origenKey];

  if (op.tipo === "copiar") {
    if (!op.destino) {
      errores.push("Falta el destino para copiar.");
      return { operacion: op, validacion: { ok: false, errores, avisos }, vistaPrevia: { crea, modifica, omite, quitaReversible, ultimaCopia }, deshacer };
    }
    if (refKey(op.destino) === origenKey) {
      errores.push("El destino debe ser distinto al origen.");
      return { operacion: op, validacion: { ok: false, errores, avisos }, vistaPrevia: { crea, modifica, omite, quitaReversible, ultimaCopia }, deshacer };
    }
    if (!origenDoc) {
      errores.push("No se encuentra la instantánea de origen.");
      return { operacion: op, validacion: { ok: false, errores, avisos }, vistaPrevia: { crea, modifica, omite, quitaReversible, ultimaCopia }, deshacer };
    }
    const destinoDoc = instantaneas[refKey(op.destino)];
    if (!destinoDoc) {
      errores.push("No se encuentra la instantánea de destino.");
      return { operacion: op, validacion: { ok: false, errores, avisos }, vistaPrevia: { crea, modifica, omite, quitaReversible, ultimaCopia }, deshacer };
    }
    if (!permisos.puedeEditar(op.destino)) {
      errores.push("Sin permiso para editar el destino.");
      return { operacion: op, validacion: { ok: false, errores, avisos }, vistaPrevia: { crea, modifica, omite, quitaReversible, ultimaCopia }, deshacer };
    }
    const itemIds = op.itemIds && op.itemIds.length > 0 ? [...op.itemIds].sort() : origenDoc.items.map((i) => i.id).sort();
    for (const itemId of itemIds) {
      const item = origenDoc.items.find((i) => i.id === itemId);
      if (!item) continue;
      if (!permisos.puedeVer(op.origen, item)) {
        omite.push({ id: itemId, motivo: "Sin permiso para ver el ítem." });
        continue;
      }
      if (item.acl) {
        const acl = item.acl;
        if ((acl.read && acl.read.length > 0) || (acl.write && acl.write.length > 0)) {
          // if acl exists and seems restrictive, check - but follow permissions
        }
      }
      const dupById = destinoDoc.items.some((d) => d.id === item.id);
      if (dupById) {
        omite.push({ id: itemId, motivo: "Ya existe un ítem con el mismo id en el destino." });
        continue;
      }
      if (item.refId) {
        const dupByRef = destinoDoc.items.some((d) => d.refId && d.refId === item.refId);
        if (dupByRef) {
          omite.push({ id: itemId, motivo: "Ya existe un ítem con el mismo refId en el destino." });
          continue;
        }
      }
      crea.push(itemId);
      deshacer.push({ op: "quitar", ref: op.destino, itemId });
    }
    return { operacion: op, validacion: { ok: errores.length === 0, errores, avisos }, vistaPrevia: { crea: crea.sort(), modifica: modifica.sort(), omite: omite.sort((a,b)=>a.id.localeCompare(b.id)), quitaReversible: quitaReversible.sort(), ultimaCopia: ultimaCopia.sort() }, deshacer: deshacer.sort((a,b)=>a.itemId.localeCompare(b.itemId)) };
  }
