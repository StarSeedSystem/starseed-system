/**
 * Almacén del gobierno de la Protomolécula por entidad (Ola 1026P · P2). Cliente (usa `localStorage`, siempre con
 * `try/catch`), sin red y sin `node:*`: la lectura/escritura contra la cuenta vive en `entorno.ts`.
 *
 * Sirve para dos cosas:
 *   · que `decidirCambio(contexto, actor, tipo)` —que es SÍNCRONA— conozca las reglas de la entidad que la pantalla
 *     ya cargó (memoria) o que la última vez quedaron en este aparato (espejo local);
 *   · guardar las reglas SOLO en este aparato cuando la cuenta no responde, diciéndolo así (`origen: "aparato"`):
 *     nunca se finge que viajan a la entidad.
 */
import type { GovernanceMode } from "@/lib/governance/types";
import type { EntidadProto } from "../peticion/contrato";
import type { EntornoGobierno } from "./decision";
import { normalizarReglas, reglasPorDefecto, esEntidadGobernada, type ReglasProtomolecula } from "./reglas";

export const EVENTO_GOBIERNO_PROTO = "starseed:protomolecula-gobierno";
const CLAVE_LOCAL = "starseed.protomolecula.gobierno.v1";
const MAX_ENTIDADES = 40;

export type OrigenReglas = "cuenta" | "aparato" | "ninguno";

export interface EstadoEntidad {
  /** `null` = la entidad no ha guardado reglas propias: rigen las de por defecto. */
  reglas: ReglasProtomolecula | null;
  modoGobierno: GovernanceMode;
  votacion?: { umbral?: number; minParticipantes?: number; minPorcentaje?: number };
  origen: OrigenReglas;
  leidoEn: number;
}

const memoria = new Map<string, EstadoEntidad>();

export const claveEntidad = (e: Pick<EntidadProto, "tipo" | "id">): string => `${e.tipo}:${e.id}`;

function leerLocal(): Record<string, EstadoEntidad> {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(CLAVE_LOCAL) : null;
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, EstadoEntidad>) : {};
  } catch {
    return {};
  }
}

function escribirLocal(todo: Record<string, EstadoEntidad>): void {
  try {
    if (typeof window === "undefined") return;
    const claves = Object.keys(todo);
    if (claves.length > MAX_ENTIDADES) {
      const sobran = claves.sort((a, b) => (todo[a].leidoEn ?? 0) - (todo[b].leidoEn ?? 0)).slice(0, claves.length - MAX_ENTIDADES);
      for (const k of sobran) delete todo[k];
    }
    window.localStorage.setItem(CLAVE_LOCAL, JSON.stringify(todo));
  } catch {
    /* almacenamiento lleno o bloqueado: la memoria sigue valiendo en esta sesión */
  }
}

/** Sanea lo que haya quedado guardado (nunca se confía en el espejo local). */
function sanear(x: unknown, e: Pick<EntidadProto, "tipo">): EstadoEntidad | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Partial<EstadoEntidad>;
  const modo: GovernanceMode = o.modoGobierno === "hierarchical" ? "hierarchical" : "democratic";
  const tipo = esEntidadGobernada({ tipo: e.tipo, id: "x" } as EntidadProto) ? (e.tipo as "grupo" | "comunidad" | "pagina") : "grupo";
  const reglas = o.reglas ? normalizarReglas(o.reglas, reglasPorDefecto(tipo, modo)) : null;
  const origen: OrigenReglas = o.origen === "cuenta" || o.origen === "aparato" ? o.origen : reglas ? "aparato" : "ninguno";
  const v = o.votacion && typeof o.votacion === "object" ? o.votacion : undefined;
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);
  return {
    reglas, modoGobierno: modo, origen: reglas ? origen : "ninguno", leidoEn: num(o.leidoEn) ?? 0,
    ...(v ? { votacion: { umbral: num(v.umbral), minParticipantes: num(v.minParticipantes), minPorcentaje: num(v.minPorcentaje) } } : {}),
  };
}

/** Lo último que se sabe de esta entidad: la memoria de la sesión o el espejo de este aparato. */
export function leerEstado(e: Pick<EntidadProto, "tipo" | "id">): EstadoEntidad | null {
  const k = claveEntidad(e);
  const m = memoria.get(k);
  if (m) return m;
  const l = sanear(leerLocal()[k], e);
  if (l) memoria.set(k, l);
  return l;
}

export function guardarEstado(e: Pick<EntidadProto, "tipo" | "id">, estado: EstadoEntidad): void {
  const k = claveEntidad(e);
  memoria.set(k, estado);
  const todo = leerLocal();
  todo[k] = estado;
  escribirLocal(todo);
}

/** El entorno de gobierno que `decidirCambio` usa cuando nadie se lo pasa. */
export function entornoDeCache(e: Pick<EntidadProto, "tipo" | "id">): EntornoGobierno {
  const s = leerEstado(e);
  if (!s) return {};
  return { reglas: s.reglas, modoGobierno: s.modoGobierno, ...(s.votacion ? { votacion: s.votacion } : {}) };
}

export function avisarCambio(e: Pick<EntidadProto, "tipo" | "id">): void {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_GOBIERNO_PROTO, { detail: { entidad: { tipo: e.tipo, id: e.id } } }));
  } catch {
    /* sin DOM */
  }
}

/** Solo para pruebas. */
export function olvidarTodo(): void {
  memoria.clear();
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(CLAVE_LOCAL);
  } catch {
    /* noop */
  }
}
