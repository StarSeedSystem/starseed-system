/* biblioteca-plan — planificador PURO de la Biblioteca del OS (Ola 1025R, INF1025G).
 * Patrón Spacedrive v2: validar → vista previa → ejecutar, con diario para deshacer y
 * aviso antes de quitar la ÚLTIMA copia; planifica SIN ejecutar nada (sin red, disco ni
 * reloj) y solo usa TIPOS de entity-library.ts. SOP: architecture/repos-libreria-1025.md §3. */
import type { EntityLibraryDoc, EntityRef, SavedItem } from "@/lib/library/entity-library";

export type TipoOperacion = "copiar" | "mover" | "fusionar" | "quitar" | "deduplicar";
export interface OperacionBiblioteca { tipo: TipoOperacion; origen: EntityRef; destino?: EntityRef; itemIds?: string[] }
export interface PasoDeshacer { op: "quitar" | "restaurar" | "mover"; ref: EntityRef; itemId: string; haciaCarpeta?: string | null }
export interface PermisosPlan { puedeVer(ref: EntityRef, item: SavedItem): boolean; puedeEditar(ref: EntityRef, item?: SavedItem): boolean }
export interface PlanBiblioteca { operacion: OperacionBiblioteca; validacion: { ok: boolean; errores: string[]; avisos: string[] }; vistaPrevia: { crea: string[]; modifica: string[]; omite: { id: string; motivo: string }[]; quitaReversible: string[]; ultimaCopia: string[] }; deshacer: PasoDeshacer[] }

const claveDe = (r: EntityRef): string => `${r.kind}:${r.id}`;
const menor = (x: string, y: string): number => (x === y ? 0 : x < y ? -1 : 1);
const err = (plan: PlanBiblioteca, m: string): void => { plan.validacion.errores.push(m); plan.validacion.ok = false; };
const omitePor = (plan: PlanBiblioteca, id: string, motivo: string): void => { plan.vistaPrevia.omite.push({ id, motivo }); };
const yaEsta = (doc: EntityLibraryDoc, it: SavedItem): boolean => doc.items.some((x) => x.id === it.id || (!!it.refId && x.refId === it.refId));

/** true si NINGÚN otro documento conserva el mismo refId o url (aviso de última copia). */
function esUltimaCopia(inst: Record<string, EntityLibraryDoc>, co: string, it: SavedItem): boolean {
  return !!it.refId || !!it.url ? Object.entries(inst).every(([c, d]) => c === co || !d.items.some((x) => (it.refId ? x.refId === it.refId : false) || (it.url ? x.url === it.url : false))) : false;
}
/** Si es la última copia la anota en el plan con su aviso en español; dice si lo era. */
function registrarUltimaCopia(plan: PlanBiblioteca, inst: Record<string, EntityLibraryDoc>, co: string, it: SavedItem): boolean {
  if (!esUltimaCopia(inst, co, it)) return false;
  plan.vistaPrevia.ultimaCopia.push(it.id);
  plan.validacion.avisos.push(`«${it.title}» es la última copia: haz una antes de quitarla`);
  return true;
}
/** Reglas fijas de entrada; el primer fallo manda como error en español (nunca silencio). */
function validar(plan: PlanBiblioteca, op: OperacionBiblioteca, inst: Record<string, EntityLibraryDoc>, perm: PermisosPlan): void {
  const co = claveDe(op.origen), cd = op.destino ? claveDe(op.destino) : "";
  const conDestino = op.tipo !== "quitar" && op.tipo !== "deduplicar";
  if (!inst[co]) return err(plan, `No hay instantánea del origen (${co}).`);
  if (conDestino && !op.destino) return err(plan, "La operación necesita un destino.");
  if (conDestino && cd === co) return err(plan, "El destino no puede ser el mismo que el origen.");
  if (conDestino && !inst[cd]) return err(plan, `No hay instantánea del destino (${cd}).`);
  if (conDestino && !perm.puedeEditar(op.destino as EntityRef)) return err(plan, "No tienes permiso para editar la biblioteca de destino.");
  if (op.tipo === "quitar" && !perm.puedeEditar(op.origen)) return err(plan, "No tienes permiso para editar la biblioteca de origen.");
  if (op.tipo === "quitar" && !op.itemIds?.length) return err(plan, "Para quitar hace falta la lista de ítems a quitar.");
}
/** Salida determinista: ids ordenados. */
function cerrar(plan: PlanBiblioteca): PlanBiblioteca {
  const vp = plan.vistaPrevia;
  vp.crea.sort(); vp.modifica.sort(); vp.quitaReversible.sort(); vp.ultimaCopia.sort();
  vp.omite.sort((a, b) => menor(a.id, b.id));
  plan.deshacer.sort((a, b) => (a.itemId === b.itemId ? menor(a.op, b.op) : menor(a.itemId, b.itemId)));
  return plan;
}

/** PLANIFICA sin ejecutar nada (patrón Spacedrive): fusionar nunca borra y deduplicar solo propone. */
export function planificar(op: OperacionBiblioteca, inst: Record<string, EntityLibraryDoc>, perm: PermisosPlan): PlanBiblioteca {
  const plan: PlanBiblioteca = { operacion: op, validacion: { ok: true, errores: [], avisos: [] }, vistaPrevia: { crea: [], modifica: [], omite: [], quitaReversible: [], ultimaCopia: [] }, deshacer: [] };
  validar(plan, op, inst, perm);
  if (!plan.validacion.ok) return cerrar(plan);
  const docOrigen = inst[claveDe(op.origen)], destino = op.destino ? (inst[claveDe(op.destino)] as EntityLibraryDoc) : docOrigen;
  const elegidos: SavedItem[] = (op.itemIds ?? docOrigen.items.map((i) => i.id)).flatMap((id) => {
    const it = docOrigen.items.find((x) => x.id === id);
    if (!it) omitePor(plan, id, "No existe en la biblioteca de origen.");
    return it ? [it] : [];
  });
  if (op.tipo === "copiar" || op.tipo === "fusionar") anadir(plan, op, inst, destino, elegidos, perm, false);
  else if (op.tipo === "mover") anadir(plan, op, inst, destino, elegidos, perm, true);
  else if (op.tipo === "quitar") quitar(plan, op, inst, elegidos, perm);
  else deduplicar(plan, op, docOrigen, inst);
  return cerrar(plan);
}

/** copiar/fusionar/mover: añade al destino lo que le falta; nunca pisa el mismo id o refId. */
function anadir(plan: PlanBiblioteca, op: OperacionBiblioteca, inst: Record<string, EntityLibraryDoc>, destino: EntityLibraryDoc, elegidos: SavedItem[], perm: PermisosPlan, mover: boolean): void {
  const vp = plan.vistaPrevia, dr = op.destino as EntityRef, co = claveDe(op.origen);
  for (const it of elegidos) {
    if (!perm.puedeVer(op.origen, it)) { omitePor(plan, it.id, "Sin permiso de lectura de este ítem (acl)."); continue; }
    if (!perm.puedeEditar(dr, it)) { omitePor(plan, it.id, "Sin permiso de edición en el destino."); continue; }
    if (yaEsta(destino, it)) { omitePor(plan, it.id, "La biblioteca de destino ya tiene un ítem con el mismo id o refId."); continue; }
    plan.deshacer.push({ op: "quitar", ref: dr, itemId: it.id }); vp.crea.push(it.id);
    if (!mover) continue;
    // `mover` deja lápida en el origen (reversible) y avisa si se va la ÚLTIMA copia.
    vp.quitaReversible.push(it.id);
    plan.deshacer.push({ op: "restaurar", ref: op.origen, itemId: it.id, haciaCarpeta: it.folderId ?? null });
    registrarUltimaCopia(plan, inst, co, it);
  }
}
/** quitar: lápida reversible en el origen + aviso si se va la ÚLTIMA copia. */
function quitar(plan: PlanBiblioteca, op: OperacionBiblioteca, inst: Record<string, EntityLibraryDoc>, elegidos: SavedItem[], perm: PermisosPlan): void {
  const vp = plan.vistaPrevia, co = claveDe(op.origen);
  for (const it of elegidos) {
    if (!perm.puedeVer(op.origen, it)) { omitePor(plan, it.id, "Sin permiso de lectura de este ítem (acl)."); continue; }
    if (!perm.puedeEditar(op.origen, it)) { omitePor(plan, it.id, "Sin permiso de edición en el origen."); continue; }
    vp.quitaReversible.push(it.id);
    plan.deshacer.push({ op: "restaurar", ref: op.origen, itemId: it.id, haciaCarpeta: it.folderId ?? null });
    registrarUltimaCopia(plan, inst, co, it);
  }
}
/** Agrupa por refId, url o title+type; solo PROPONE lo que sobraría, nunca quita. */
function deduplicar(plan: PlanBiblioteca, op: OperacionBiblioteca, docOrigen: EntityLibraryDoc, inst: Record<string, EntityLibraryDoc>): void {
  const co = claveDe(op.origen), grupos = new Map<string, SavedItem[]>();
  for (const it of docOrigen.items)
    for (const g of [it.refId ? `r:${it.refId}` : "", it.url ? `u:${it.url}` : "", `t:${it.type}::${it.title}`]) {
      if (!g) continue;
      grupos.set(g, [...(grupos.get(g) ?? []), it]);
    }
  const sobran = new Set<string>();
  for (const g of Array.from(grupos.keys()).sort()) {
    const lista = (grupos.get(g) as SavedItem[]).sort((a, b) => menor(a.id, b.id));
    if (lista.length > 1) lista.slice(1).forEach((it) => sobran.add(it.id));
  }
  let sinPropuesta = 0;
  for (const id of Array.from(sobran).sort()) {
    const it = docOrigen.items.find((x) => x.id === id) as SavedItem;
    const quedaOtro = docOrigen.items.some((x) => x.id !== id && !sobran.has(x.id) && ((it.refId ? x.refId === it.refId : false) || (it.url ? x.url === it.url : false)));
    if (!quedaOtro && esUltimaCopia(inst, co, it)) { sinPropuesta++; continue; }
    plan.vistaPrevia.modifica.push(id);
  }
  if (sinPropuesta) plan.validacion.avisos.push("No se propone deduplicar un ítem que sería la última copia.");
  plan.validacion.avisos.push("La deduplicación solo propone: no se quita nada sin confirmación humana.");
}
/** Resumen en español para personas («Copiarías 3, omitiría 1…»). */
export function resumenPlan(plan: PlanBiblioteca): string {
  const vp = plan.vistaPrevia, t = plan.operacion.tipo;
  const accion = { copiar: `Copiarías ${vp.crea.length}`, mover: `Moverías ${vp.crea.length}`, fusionar: `Fusionarías ${vp.crea.length}`, quitar: `Quitarías ${vp.quitaReversible.length}`, deduplicar: `Deduplicarías ${vp.modifica.length} (solo propuesta)` }[t];
  const partes = [accion];
  if (vp.omite.length) partes.push(`${vp.omite.length === 1 ? "omitiría" : "omitirías"} ${vp.omite.length}`);
  if (vp.ultimaCopia.length) partes.push("ojo: una es la última copia");
  if (!plan.validacion.ok) partes.push("la operación no puede ejecutarse");
  return `${partes.join(", ")}.`;
}
