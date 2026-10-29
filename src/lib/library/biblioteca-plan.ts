import type { EntityLibraryDoc, SavedItem } from "@/lib/library/entity-library";

export type EntityRef = { kind: string; id: string };

export type OperacionBiblioteca = 
  | { tipo: 'copiar'; origen: EntityRef; destino?: EntityRef }
  | { tipo: 'mover'; origen: EntityRef; destino: EntityRef; itemIds: string[] }
  | { tipo: 'fusionar'; origen: EntityRef; destino: EntityRef }
  | { tipo: 'quitar'; origen: EntityRef; itemIds: string[] }
  | { tipo: 'deduplicar'; origen: EntityRef };

export interface PasoDeshacer {
  op: 'quitar' | 'restaurar' | 'mover';
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

export function planificar(
  op: OperacionBiblioteca,
  instantaneas: Record<string, EntityLibraryDoc>,
  permisos: { puedeVer(ref: EntityRef, item?: SavedItem): boolean; puedeEditar(ref: EntityRef, item?: SavedItem): boolean }
): PlanBiblioteca {
  const errores: string[] = [];
  const avisos: string[] = [];
  const crea: string[] = [];
  const modifica: string[] = [];
  const omite: { id: string; motivo: string }[] = [];
  const quitaReversible: string[] = [];
  const ultimaCopia: string[] = [];
  const deshacer: PasoDeshacer[] = [];

  const getKey = (ref: EntityRef) => `${ref.kind}:${ref.id}`;
  const origenDoc = instantaneas[getKey(op.origen)];

  if (!origenDoc) {
    errores.push("El origen no existe.");
  } else if (!permisos.puedeVer(op.origen)) {
    errores.push("No tienes permiso para ver el origen.");
  }

  if (op.tipo === 'copiar') {
    if (!op.destino) {
      errores.push("Falta el destino para copiar.");
    } else if (op.origen.kind === op.destino.kind && op.origen.id === op.destino.id) {
      errores.push("El destino es igual al origen.");
    } else {
      const destinoDoc = instantaneas[getKey(op.destino)];
      if (!destinoDoc) {
        errores.push("El destino no existe.");
      } else {
        for (const item of origenDoc.items) {
          if (!permisos.puedeVer(op.origen, item)) {
            omite.push({ id: item.id, motivo: "Sin permiso de lectura" });
            continue;
          }
          const existeEnDestino = destinoDoc.items.some(d => d.id === item.id || (d.refId && d.refId === item.refId));
          if (existeEnDestino) {
            omite.push({ id: item.id, motivo: "Ya existe el ítem con el mismo id o refId" });
          } else {
            crea.push(item.id);
            deshacer.push({ op: 'quitar', ref: op.destino, itemId: item.id });
          }
        }
      }
    }
  } else if (op.tipo === 'quitar' && origenDoc) {
    for (const id of op.itemIds) {
      const item = origenDoc.items.find(i => i.id === id);
      if (!item) {
        omite.push({ id, motivo: "Ítem no encontrado" });
        continue;
      }
      if (!permisos.puedeEditar(op.origen, item)) {
        omite.push({ id, motivo: "Sin permiso de edición" });
        continue;
      }

      const otrasCopias = Object.entries(instantaneas).some(([key, doc]) => {
        if (key === getKey(op.origen)) return false;
        return doc.items.some(other => (other.refId && other.refId === item.refId) || (other.url && other.url === item.url));
      });

      quitaReversible.push(item.title);
      if (!otrasCopias) {
        ultimaCopia.push(item.id);
        avisos.push(`«${item.title}» es la última copia: haz una antes de quitarla.`);
      }
      deshacer.push({ op: 'restaurar', ref: op.origen, itemId: item.id });
    }
  } else if (op.tipo === 'fusionar') {
    if (!op.destino) {
      errores.push("Falta el destino para fusionar.");
    } else if (op.origen.kind === op.destino.kind && op.origen.id === op.destino.id) {
      errores.push("El destino es igual al origen.");
    } else {
      const destinoDoc = instantaneas[getKey(op.destino)];
      if (!destinoDoc) {
        errores.push("El destino no existe.");
      } else if (origenDoc) {
        for (const item of origenDoc.items) {
          const existe = destinoDoc.items.some(d => d.id === item.id || (d.refId && d.refId === item.refId));
          if (!existe) {
            crea.push(item.id);
          }
        }
      }
    }
  } else if (op.tipo === 'deduplicar' && origenDoc) {
    const vistos = new Set<string>();
    for (const item of origenDoc.items) {
      const clave = item.refId || item.url || `${item.title}-${item.type}`;
      if (vistos.has(clave)) {
        modifica.push(item.id);
      } else {
        vistos.add(clave);
      }
    }
    if (modifica.length > 0) {
      avisos.push("No se quita nada sin confirmación humana y nunca los de última copia.");
    }
  }

  return {
    operacion: op,
    validacion: { ok: errores.length === 0, errores, avisos },
    vistaPrevia: { crea, modifica, omite, quitaReversible, ultimaCopia },
    deshacer
  };
}

export function resumenPlan(plan: PlanBiblioteca): string {
  const { crea, modifica, omite, quitaReversible } = plan.vistaPrevia;
  let partes = [];
  if (crea.length) partes.push(`Crearía ${crea.length}`);
  if (modifica.length) partes.push(`modificaría ${modifica.length}`);
  if (omite.length) partes.push(`omitiría ${omite.length}`);
  if (quitaReversible.length) partes.push(`quitaría ${quitaReversible.length}`);
  return partes.join(", ") || "Sin cambios previstos.";
}
