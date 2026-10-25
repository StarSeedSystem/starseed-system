/**
 * StarSeed OS — Salas · PROPIEDAD DE ELEMENTOS POR ÉPOCAS (Ola 1025R · INF1025J).
 * Para avatares, fichas de juego y widgets con estado propio, donde «gana el
 * último» no sirve: cada pieza tiene UN dueño y una época; sólo el dueño
 * escribe; cederla sube la época; una escritura con época vieja se rechaza.
 * Método portado de Co-op Anything. Módulo PURO: sin red, sin disco, sin
 * reloj; devuelve mapas NUEVOS (inmutables) y explica en español sin
 * tecnicismos.
 */

import { puedeEditar, rolDe, type Sala } from "./sala";

/** Dueño y época de una pieza de la sala (clave = id de `ElementoSala`). */
export interface Propiedad {
  dueno: string;
  epoca: number;
}

export type Propiedades = Record<string, Propiedad>;
export type MotivoRechazo = "sin-dueno" | "no-es-dueno" | "epoca-vieja";
export type VeredictoEscritura = { ok: true } | { ok: false; motivo: MotivoRechazo };

/** Fusión de dos copias: mapa determinista + ids en disputa. */
export interface FusionPropiedades {
  propiedades: Propiedades;
  conflictos: string[];
}

/** Traspaso forzado, con su registro de quién lo hizo y a quién se la dio. */
export interface TraspasoForzado {
  ok: boolean;
  propiedades: Propiedades;
  registro?: string;
}

/** Frase en claro para cada rechazo; con nombre del dueño, se lo dice a su nombre. */
export function explicar(motivo: MotivoRechazo, nombreDueno?: string): string {
  switch (motivo) {
    case "sin-dueno":
      return "Nadie lleva todavía esa pieza: primero reclámala y después escribe en ella.";
    case "no-es-dueno":
      return nombreDueno
        ? `Esa pieza la tiene ${nombreDueno}: pídesela.`
        : "Esa pieza la tiene otra persona: pídesela.";
    case "epoca-vieja":
      return "Esa pieza cambió desde que la viste: revísala con sus cambios al día y vuelve a intentarla.";
  }
}

/** Reclama una pieza SIN dueño (época 1); si ya la tiene alguien, no se cambia. */
export function reclamar(p: Propiedades, id: string, quien: string): Propiedades {
  if (p[id]) return p;
  return { ...p, [id]: { dueno: quien, epoca: 1 } };
}

/** El dueño cede su pieza: la cuenta de avances sube en 1 (mapa nuevo). */
export function traspasar(p: Propiedades, id: string, de: string, a: string): Propiedades {
  const actual = p[id];
  if (!actual || actual.dueno !== de) return p;
  return { ...p, [id]: { dueno: a, epoca: actual.epoca + 1 } };
}

/** La escritura entra por aquí: dueño vigente escribe; lo demás, motivo. */
export function aceptarEscritura(
  p: Propiedades,
  id: string,
  quien: string,
  epocaVista: number,
): VeredictoEscritura {
  const actual = p[id];
  if (!actual) return { ok: false, motivo: "sin-dueno" };
  if (actual.dueno !== quien) return { ok: false, motivo: "no-es-dueno" };
  if (epocaVista < actual.epoca) return { ok: false, motivo: "epoca-vieja" };
  return { ok: true };
}

/**
 * Fusiona los mapas de propiedad de dos copias de la misma sala, DETERMINISTA
 * y CONMUTATIVA (todas las neuronas llegan al mismo mapa): gana la época
 * mayor; con la misma época y distinto dueño, gana el dueño menor
 * alfabéticamente y el otro turno queda anotado como conflicto.
 */
export function fusionarPropiedades(a: Propiedades | null, b: Propiedades | null): FusionPropiedades {
  const propiedades: Propiedades = {};
  const conflictos: string[] = [];
  for (const id of new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])) {
    const enA = a?.[id];
    const enB = b?.[id];
    if (enA && enB && (enA.epoca !== enB.epoca || enA.dueno !== enB.dueno)) {
      if (enA.epoca === enB.epoca) conflictos.push(id);
      propiedades[id] = ganaEntrada(enA, enB);
      continue;
    }
    propiedades[id] = enA ?? enB ?? { dueno: "", epoca: 0 };
  }
  return { propiedades, conflictos: conflictos.sort() };
}

/** Desempate: gana la época mayor y, a igual época, el dueño menor. */
function ganaEntrada(enA: Propiedad, enB: Propiedad): Propiedad {
  if (enA.epoca !== enB.epoca) return enA.epoca > enB.epoca ? enA : enB;
  if (enA.dueno !== enB.dueno) return enA.dueno < enB.dueno ? enA : enB;
  return enA;
}

/** Rol × propiedad: un editor escribe lo suyo o lo que nadie reclamó; lo ajeno, se pide. */
export function puedeEscribir(sala: Sala, usuarioId: string, p: Propiedades, id: string): boolean {
  if (!puedeEditar(sala, usuarioId)) return false;
  const propiedad = p[id];
  return !propiedad || propiedad.dueno === usuarioId;
}

/**
 * Desatasca una pieza cuando su dueño se fue o no responde: sólo el dueño de
 * la sala lo puede hacer, y el resultado lleva el registro en claro.
 */
export function forzarTraspaso(
  sala: Sala,
  usuarioId: string,
  p: Propiedades,
  id: string,
  a: string,
): TraspasoForzado {
  const actual = p[id];
  if (rolDe(sala, usuarioId) !== "dueno" || !actual) return { ok: false, propiedades: p };
  return {
    ok: true,
    propiedades: traspasar(p, id, actual.dueno, a),
    registro: `El dueño de la sala (${usuarioId}) retiró la pieza a ${actual.dueno} y se la dio a ${a}; continúa en la época ${actual.epoca + 1}.`,
  };
}
