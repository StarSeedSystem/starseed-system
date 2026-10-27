/*
 * StarSeed OS · Salas compartidas — propiedad de elementos por épocas.
 * Módulo PURO: sin red, sin disco, sin reloj. Todo inmutable.
 */

import { puedeEditar, type Sala } from "./sala";

export interface Propiedad {
  dueno: string;
  epoca: number;
}

export type Propiedades = Record<string, Propiedad>;

export type ResultadoEscritura =
  | {
      ok: true;
    }
  | {
      ok: false;
      motivo: "sin-dueno" | "no-es-dueno" | "epoca-vieja";
    };

export interface ResultadoFusion {
  propiedades: Propiedades;
  conflictos: string[];
}

export interface ResultadoForzarTraspaso {
  propiedades: Propiedades;
  registro: {
    forzadoPor: string;
    dadoA: string;
    elementoId: string;
  };
}

/**
 * Un elemento sin dueño pasa a `quien` con época 1.
 * Devuelve un mapa nuevo (inmutable).
 */
export function reclamar(p: Propiedades, id: string, quien: string): Propiedades {
  const actual = p[id];
  if (actual) return { ...p };
  return { ...p, [id]: { dueno: quien, epoca: 1 } };
}

/**
 * Solo si `de` es el dueño; sube la época en 1.
 * Devuelve un mapa nuevo (inmutable).
 */
export function traspasar(p: Propiedades, id: string, de: string, a: string): Propiedades {
  const actual = p[id];
  if (!actual || actual.dueno !== de) return { ...p };
  return { ...p, [id]: { dueno: a, epoca: actual.epoca + 1 } };
}

/**
 * Mensajes en español sin tecnicismos.
 */
export function explicar(motivo: ResultadoEscritura extends { ok: false } ? ResultadoEscritura["motivo"] : never, nombreDueno?: string): string {
  if (motivo === "sin-dueno") {
    return "Esta pieza no tiene dueño aún: reclama antes de escribir.";
  }
  if (motivo === "no-es-dueno") {
    if (nombreDueno) return `Esa pieza la tiene ${nombreDueno}; pídesela.`;
    return "Esa pieza tiene dueño; pídesela.";
  }
  if (motivo === "epoca-vieja") {
    if (nombreDueno) return `Esa pieza la tiene ${nombreDueno}; pídesela.`;
    return "Esa pieza tiene dueño; pídesela.";
  }
  return "No puedes escribir ahora.";
}

/**
 * Comprueba si puede escribir con la época vista.
 */
export function aceptarEscritura(
  p: Propiedades,
  id: string,
  quien: string,
  epocaVista: number,
): ResultadoEscritura {
  const actual = p[id];
  if (!actual) return { ok: false, motivo: "sin-dueno" };
  if (actual.dueno !== quien) return { ok: false, motivo: "no-es-dueno" };
  if (epocaVista < actual.epoca) return { ok: false, motivo: "epoca-vieja" };
  return { ok: true };
}

/**
 * Fusiona dos mapas de propiedades de forma determinista y conmutativa.
 * Gana la época mayor; a igual época y distinto dueño, el dueño menor alfabéticamente.
 * Devuelve además la lista de conflictos.
 */
export function fusionarPropiedades(a: Propiedades, b: Propiedades): ResultadoFusion {
  const resultado: Propiedades = { ...a };
  const conflictos: string[] = [];

  for (const id of Object.keys(b)) {
    const propB = b[id];
    const propA = resultado[id];
    if (!propA) {
      resultado[id] = propB;
      continue;
    }
    if (propB.epoca > propA.epoca) {
      resultado[id] = propB;
      continue;
    }
    if (propA.epoca > propB.epoca) {
      continue;
    }
    if (propA.dueno === propB.dueno) {
      continue;
    }
    if (propA.dueno < propB.dueno) {
      conflictos.push(id);
      continue;
    }
    // propB.dueno < propA.dueno
    resultado[id] = propB;
    conflictos.push(id);
  }

  return { propiedades: resultado, conflictos };
}

/**
 * Un editor escribe lo suyo o lo que nadie reclamó.
 */
export function puedeEscribir(sala: Sala, usuarioId: string, p: Propiedades, id: string): boolean {
  if (!puedeEditar(sala, usuarioId)) return false;
  const prop = p[id];
  if (!prop) return true;
  return prop.dueno === usuarioId;
}

/**
 * Solo lo puede el dueño de la sala. El resultado lleva un registro de quién lo forzó y a quién se lo dio.
 */
export function forzarTraspaso(
  sala: Sala,
  usuarioId: string,
  p: Propiedades,
  id: string,
  a: string,
): ResultadoForzarTraspaso | null {
  if (sala.miembros[usuarioId] !== "dueno") return null;
  const actual = p[id];
  const epocaActual = actual?.epoca ?? 0;
  return {
    propiedades: { ...p, [id]: { dueno: a, epoca: epocaActual + 1 } },
    registro: {
      forzadoPor: usuarioId,
      dadoA: a,
      elementoId: id,
    },
  };
}
