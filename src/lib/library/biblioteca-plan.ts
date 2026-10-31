import { EntityRef, EntityLibraryDoc } from "./entity-library";

export type TipoOper = 'copiar' | 'mover' | 'fusionar' | 'quitar' | 'deduplicar';
export type OperacionBiblioteca = {
  tipo: TipoOper;
  origen: EntityRef;
  destino?: EntityRef;
  itemIds?: string[];
};
export type PasoDeshacer = {
  op: 'quitar' | 'restaurar' | 'mover';
  ref: EntityRef;
  itemId: string;
  haciaCarpeta?: string | null;
};
export type Validacion = { ok: boolean; errores: string[]; avisos: string[] };
export type VistaPrevia = {
  crea: string[];
  modifica: string[];
  omite: { id: string; motivo: string }[];
  quitaReversible: string[];
  ultimaCopia: string[];
};
export type PlanBiblioteca = {
  operacion: OperacionBiblioteca;
  validacion: Validacion;
  vistaPrevia: VistaPrevia;
  deshacer: PasoDeshacer[];
};

export function planificar(
  op: OperacionBiblioteca,
  instantaneas: Record<string, EntityLibraryDoc>,
  permisos: { puedeVer(ref: EntityRef, item?: string): boolean; puedeEditar(ref: EntityRef, item?: string): boolean }
): PlanBiblioteca {
  const errores: string[] = [];
  const avisos: string[] = [];
  const crea: string[] = [];
  const modifica: string[] = [];
  const omite: { id: string; motivo: string }[] = [];
  const quitaReversible: string[] = [];
  const ultimaCopia: string[] = [];
  const deshacer: PasoDeshacer[] = [];

  const origenKey = `${op.origen.kind}:${op.origen.id}`;
  const origenDoc = instantaneas[origenKey];
  if (!op.itemIds || op.itemIds.length === 0) {
    return { operacion: op, validacion: { ok: true, errores, avisos }, vistaPrevia: { crea, modifica, omite, quitaReversible, ultimaCopia }, deshacer };
  }

  if (!permisos.puedeVer(op.origen)) {
    errores.push(`Sin permiso de ver en origen ${op.origen.kind}:${op.origen.id}`);
  }
  if (op.destino) {
    if (!permisos.puedeVer(op.destino)) {
      errores.push(`Sin permiso de ver en destino ${op.destino.kind}:${op.destino.id}`);
    }
    if (!permisos.puedeEditar(op.destino)) {
      errores.push(`Sin permiso de editar en destino ${op.destino.kind}:${op.destino.id}`);
    }
  }
  if (op.destino && op.origen.kind === op.destino.kind && op.origen.id === op.destino.id) {
    errores.push('El destino no puede ser igual al origen');
  }

  for (const id of op.itemIds) {
    const item = origenDoc?.items?.find(it => it.id === id);
    if (!item) {
      errores.push(`Elemento ${id} no encontrado en origen`);
      continue;
    }

    const puedeEditarOrigen = permisos.puedeEditar(op.origen, id);
    if (!puedeEditarOrigen) {
      omite.push({ id, motivo: 'sin permiso para la acción' });
      continue;
    }

    const destinoKey = op.destino ? `${op.destino.kind}:${op.destino.id}` : undefined;
    if (destinoKey) {
      const puedeEditarDestino = permisos.puedeEditar(op.destino!, id);
      if (!puedeEditarDestino) {
        omite.push({ id, motivo: 'sin permiso en destino' });
        continue;
      }
    }

    switch (op.tipo) {
      case 'copiar': {
        const destDoc = destinoKey ? instantaneas[destinoKey] : undefined;
        const sameId = destDoc?.items?.some(it => it.id === id || it.refId === item.refId);
        if (sameId) {
          omite.push({ id, motivo: 'ya existe en destino con mismo id o refId' });
        } else {
          crea.push(id);
        }
        break;
      }
      case 'mover': {
        if (!op.destino) { errores.push('Mover requiere destino'); break; }
        const destDoc = instantaneas[destinoKey];
        const destHas = destDoc?.items?.some(it => it.id === id);
        if (destHas) {
          omite.push({ id, motivo: 'ya en destino' });
          break;
        }
        deshacer.push({ op: 'mover', ref: op.origen, itemId: id, haciaCarpeta: null });
        const others = Object.values(instantaneas)
          .filter(d => d !== origenDoc)
          .flatMap(d => d.items ?? []);
        const sameRef = others.some(it => it.refId === item.refId || it.url === item.url);
        if (!sameRef) {
          ultimaCopia.push(id);
          avisos.push(`es la última copia: haz una antes de quitarla`);
        }
        break;
      }
      case 'fusionar': {
        break;
      }
      case 'quitar': {
        if (!op.destino) {
          const others = Object.values(instantaneas)
            .filter(d => d !== origenDoc)
            .flatMap(d => d.items ?? []);
          const sameRef = others.some(it => it.refId === item.refId || it.url === item.url);
          if (!sameRef) {
            ultimaCopia.push(id);
            avisos.push(`es la última copia: haz una antes de quitarla`);
          }
          quitaReversible.push(id);
        } else {
          const destDoc = instantaneas[destinoKey];
          const sameDoc = destDoc?.items?.some(it => it.id === id);
          if (!sameDoc) {
            quitaReversible.push(id);
          }
        }
        deshacer.push({ op: 'quitar', ref: op.origen, itemId: id, haciaCarpeta: null });
        break;
      }
      case 'deduplicar': {
        const same = origenDoc?.items?.filter(it => it.refId === item.refId && it.id !== id);
        if (same && same.length > 0) {
          modifica.push(id);
        }
        break;
      }
    }
  }

  const validacion: Validacion = { ok: errores.length === 0, errores, avisos };
  const vistaPrevia: VistaPrevia = { crea, modifica, omite, quitaReversible, ultimaCopia };
  return { operacion: op, validacion, vistaPrevia, deshacer };
}

export function resumenPlan(plan: PlanBiblioteca): string {
  const { crea, omite, modifica, quitaReversible, ultimaCopia } = plan.vistaPrevia;
  const parts: string[] = [];
  if (crea.length) parts.push(`Copiarías ${crea.length}`);
  if (omite.length) parts.push(`omitiría ${omite.length}`);
  if (modifica.length) parts.push(`modificaría ${modifica.length}`);
  if (quitaReversible.length) parts.push(`eliminaría ${quitaReversible.length}`);
  if (ultimaCopia.length) parts.push(`la última copia: ${ultimaCopia.length}`);
  return parts.join(', ') + '.';
}