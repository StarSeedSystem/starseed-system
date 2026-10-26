/**
 * Registro de quién usó un permiso directo (Ola 1026P · P2). Es la transparencia del poder ejercido sin pasar por
 * propuesta ni votación: cada vez que alguien aplica un cambio gracias a un permiso directo, queda una línea con
 * QUIÉN, QUÉ tipo de cambio, CUÁNDO y por qué origen (persona, IA o agente).
 *
 * Límite honesto: hoy el registro se guarda en ESTE aparato (`localStorage`). Que viaje a la cuenta de la entidad
 * pide una tabla compartida que aún no existe (ver `architecture/protomolecula-gobierno.md`, «Límites»); la interfaz
 * lo dice donde lo enseña. Ningún ajuste puede apagarlo.
 */
import type { ActorProto, EntidadProto, TipoCambioProto } from "../peticion/contrato";
import type { VeredictoDetallado } from "./decision";
import { EVENTO_GOBIERNO_PROTO } from "./almacen";

const CLAVE = "starseed.protomolecula.gobierno.usos.v1";
const MAX_USOS = 200;
export const DONDE_SE_GUARDA_EL_REGISTRO = "aparato" as const;

export interface UsoPermiso {
  id: string;
  entidad: { tipo: string; id: string };
  permisoId: string;
  usuarioId: string | null;
  nombre?: string;
  tipoCambio: TipoCambioProto;
  origen: ActorProto["origen"];
  resumen: string;
  en: number;
}

function leer(): UsoPermiso[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(CLAVE) : null;
    const l = raw ? JSON.parse(raw) : [];
    return Array.isArray(l) ? (l as UsoPermiso[]).filter((u) => u && typeof u === "object" && typeof u.permisoId === "string") : [];
  } catch {
    return [];
  }
}

function escribir(lista: UsoPermiso[]): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, MAX_USOS)));
  } catch {
    /* lleno o bloqueado */
  }
}

/**
 * Anota el uso de un permiso directo. Solo anota si el veredicto vino de un permiso (`via: "permiso-directo"`);
 * devuelve `null` en cualquier otro caso. Quien APLICA un cambio de verdad debe llamarla (mirar el veredicto no cuenta).
 */
export function registrarUsoPermiso(
  entidad: Pick<EntidadProto, "tipo" | "id">, actor: ActorProto, tipo: TipoCambioProto, veredicto: Pick<VeredictoDetallado, "via" | "permisoId" | "decision">,
  resumen: string, nombre?: string, ahora: number = Date.now(),
): UsoPermiso | null {
  if (veredicto.via !== "permiso-directo" || veredicto.decision !== "aplicar" || !veredicto.permisoId) return null;
  const uso: UsoPermiso = {
    id: `uso-${ahora.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    entidad: { tipo: entidad.tipo, id: entidad.id },
    permisoId: veredicto.permisoId,
    usuarioId: actor.usuarioId,
    ...(nombre ? { nombre: nombre.slice(0, 80) } : {}),
    tipoCambio: tipo,
    origen: actor.origen,
    resumen: resumen.replace(/\s+/g, " ").trim().slice(0, 200),
    en: ahora,
  };
  escribir([uso, ...leer()]);
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_GOBIERNO_PROTO, { detail: { entidad: { tipo: entidad.tipo, id: entidad.id } } }));
  } catch {
    /* sin DOM */
  }
  return uso;
}

/** Usos de permisos directos de esta entidad, los más recientes primero. */
export function leerUsosPermiso(entidad: Pick<EntidadProto, "tipo" | "id">): UsoPermiso[] {
  return leer()
    .filter((u) => u.entidad?.tipo === entidad.tipo && u.entidad?.id === entidad.id)
    .sort((a, b) => b.en - a.en);
}

/** Solo para pruebas. */
export function olvidarUsos(): void {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(CLAVE);
  } catch {
    /* noop */
  }
}
