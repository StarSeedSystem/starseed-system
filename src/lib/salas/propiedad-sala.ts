/*
 * StarSeed OS · Salas — PROPIEDAD DE ELEMENTOS POR ÉPOCAS (Ola 1025R · INF1025J).
 * En la pizarra basta «gana el último» (`sincronia-sala.ts`); no para un avatar,
 * una ficha de juego o un widget con estado propio. Regla de Co-op Anything:
 * cada elemento tiene UN dueño y UNA época; sólo el dueño escribe; ceder sube
 * la época y una escritura con época vieja se rechaza. Módulo PURO y ADITIVO:
 * no toca `sincronia-sala.ts` ni `sala.ts`; sin red, disco ni reloj; los mapas
 * devueltos son SIEMPRE nuevos. De `sala.ts` sólo importa `puedeEditar`.
 */

import type { Sala } from "./sala";
import { puedeEditar } from "./sala";

/** Dueño actual de un elemento y su época (crece con cada cesión). */
export interface Propiedad { dueno: string; epoca: number }

/** Clave = id de `ElementoSala`; valor = quién lo tiene y en qué época. */
export type Propiedades = Record<string, Propiedad>;

/** Por qué se rechaza una escritura. */
export type MotivoRechazo = "sin-dueno" | "no-es-dueno" | "epoca-vieja";

/** Veredicto de una escritura sobre un elemento con dueño. */
export interface VeredictoEscritura { ok: boolean; motivo?: MotivoRechazo }

/** A quién se traspasó a la fuerza un elemento, y quién lo decidió. */
export interface RegistroTraspasoForzado {
  elementoId: string;
  forzadoPor: string;
  dadoA: string;
  epoca: number;
}

/** Reclama un elemento sin dueño (época 1); si ya tiene dueño, no cambia. */
export function reclamar(p: Propiedades, id: string, quien: string): Propiedades {
  if (p[id]) return { ...p };
  return { ...p, [id]: { dueno: quien, epoca: 1 } };
}

/** Cede el elemento de `de` a `a`: sólo el dueño puede; sube la época en 1. */
export function traspasar(p: Propiedades, id: string, de: string, a: string): Propiedades {
  const actual = p[id];
  if (!actual || actual.dueno !== de) return { ...p };
  return { ...p, [id]: { dueno: a, epoca: actual.epoca + 1 } };
}

/** ¿Acepta esta escritura? Sin dueño, dueño ajeno o época vieja: no. */
export function aceptarEscritura(p: Propiedades, id: string, quien: string, epocaVista: number): VeredictoEscritura {
  const prop = p[id];
  if (!prop) return { ok: false, motivo: "sin-dueno" };
  if (prop.dueno !== quien) return { ok: false, motivo: "no-es-dueno" };
  if (epocaVista < prop.epoca) return { ok: false, motivo: "epoca-vieja" };
  return { ok: true };
}

/** Por qué no se aceptó, en español y sin tecnicismos. */
export function explicar(motivo: MotivoRechazo, nombreDueno?: string): string {
  switch (motivo) {
    case "sin-dueno":
      return "Nadie tiene reservada esa pieza: reclámala y luego escribe.";
    case "no-es-dueno":
      return nombreDueno
        ? `Esa pieza la tiene ${nombreDueno}; pídesela para poder cambiarla.`
        : "Esa pieza la tiene otra persona; pídesela para poder cambiarla.";
    case "epoca-vieja":
      return "Lo que trae tu cambio no incluye lo último que se hizo en esa pieza: añádelo y vuelve a intentarlo.";
  }
}

/** Entre dos versiones: época mayor; a empate, dueño menor alfabéticamente. */
function ganador(x: Propiedad, y: Propiedad): Propiedad {
  if (x.epoca !== y.epoca) return x.epoca > y.epoca ? x : y;
  if (x.dueno !== y.dueno) return x.dueno < y.dueno ? x : y;
  return x;
}

/**
 * Sincroniza dos vistas: DETERMINISTA y CONMUTATIVA (a con b da lo mismo que
 * b con a, y algo consigo mismo no cambia). Los elementos que ambas vistas
 * conocen con dueños DISTINTOS se anotan como conflictos, para averiguarlo
 * con la gente y no enmendarlo a escondidas.
 */
export function fusionarPropiedades(a: Propiedades, b: Propiedades): { propiedades: Propiedades; conflictos: string[] } {
  const propiedades: Propiedades = { ...a };
  const conflictos: string[] = [];
  for (const [id, deB] of Object.entries(b)) {
    const deA = propiedades[id];
    if (!deA) { propiedades[id] = deB; continue; }
    if (deA.dueno !== deB.dueno) conflictos.push(id);
    propiedades[id] = ganador(deA, deB);
  }
  return { propiedades, conflictos: conflictos.sort() };
}

/** Rol primero (sólo dueño y editores) y luego propiedad: lo suyo o lo libre. */
export function puedeEscribir(sala: Sala, usuarioId: string, p: Propiedades, id: string): boolean {
  if (!puedeEditar(sala, usuarioId)) return false;
  const prop = p[id];
  return !prop || prop.dueno === usuarioId;
}

/**
 * Si una pieza se quedó en manos de quien ya no está, el dueño de la SALA la
 * traspasa a `a` a la fuerza, subiendo la época y dejando registro de quién
 * lo forzó; quien no es dueño de la sala no cambia nada.
 */
export function forzarTraspaso(
  sala: Sala, usuarioId: string, p: Propiedades, id: string, a: string,
): { propiedades: Propiedades; registro: RegistroTraspasoForzado | null } {
  if (sala.miembros[usuarioId] !== "dueno") return { propiedades: { ...p }, registro: null };
  const epoca = (p[id]?.epoca ?? 0) + 1;
  return {
    propiedades: { ...p, [id]: { dueno: a, epoca } },
    registro: { elementoId: id, forzadoPor: usuarioId, dadoA: a, epoca },
  };
}
