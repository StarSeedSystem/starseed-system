/**
 * StarSeed OS · Salas compartidas · Propiedad de actor por épocas (Ola 1025R).
 * ============================================================================
 * Evita que dos jugadores muevan a la vez lo mismo: cada objeto tiene un dueño
 * y una época. Solo el dueño escribe; ceder sube la época; una escritura con
 * época vieja se rechaza.
 *
 * Módulo PURO: sin red, sin disco, sin reloj. Inmutable.
 */

import { puedeEditar, type Sala } from "@/lib/salas/sala";

export interface Propiedad {
  dueno: string;
  epoca: number;
}

export type Propiedades = Record<string, Propiedad>;

/**
 * Reclama un elemento sin dueño. Pasa a `quien` con época 1.
 * Devuelve un mapa nuevo (inmutable).
 */
export function reclamar(p: Propiedades, id: string, quien: string): Propiedades {
  const actual = p[id];
  if (actual) {
    return { ...p };
  }
  return { ...p, [id]: { dueno: quien, epoca: 1 } };
}

/**
 * Traslada un elemento: solo si `de` es el dueño. Sube la época en 1.
 * Devuelve un mapa nuevo (inmutable).
 */
export function traspasar(p: Propiedades, id: string, de: string, a: string): Propiedades {
  const actual = p[id];
  if (!actual) return { ...p };
  if (actual.dueno !== de) return { ...p };
  return { ...p, [id]: { dueno: a, epoca: actual.epoca + 1 } };
}

export type MotivoRechazoEscritura = "sin-dueno" | "no-es-dueno" | "epoca-vieja";

export interface ResultadoAceptarEscritura {
  ok: boolean;
  motivo?: MotivoRechazoEscritura;
}

/**
 * Comprueba si `quien` puede escribir con `epocaVista`.
 */
export function aceptarEscritura(
  p: Propiedades,
  id: string,
  quien: string,
  epocaVista: number,
): ResultadoAceptarEscritura {
  const actual = p[id];
  if (!actual) {
    return { ok: false, motivo: "sin-dueno" };
  }
  if (actual.dueno !== quien) {
    return { ok: false, motivo: "no-es-dueno" };
  }
  if (epocaVista < actual.epoca) {
    return { ok: false, motivo: "epoca-vieja" };
  }
  return { ok: true };
}

/**
 * Explica el motivo en español, sin tecnicismos.
 */
export function explicar(motivo: MotivoRechazoEscritura, nombreDueno?: string): string {
  if (motivo === "sin-dueno") {
    return "Nadie tiene esa pieza aún: reclámala para poder escribir.";
  }
  if (motivo === "no-es-dueno") {
    if (nombreDueno) {
      return `Esa pieza la tiene ${nombreDueno}; pídesela.`;
    }
    return "Esa pieza no es tuya; pídesela a quien la tiene.";
  }
  if (motivo === "epoca-vieja") {
    return "Esa pieza ha cambiado desde que la viste; vuelve a cargarla.";
  }
  return "No se puede escribir esa pieza ahora.";
}

export interface ResultadoFusionarPropiedades {
  propiedades: Propiedades;
  conflictos: string[];
}

/**
 * Fusiona propiedades de dos mapas. Determinista y conmutativa.
 * Gana la época mayor; a igual época y distinto dueño, el dueño menor alfabéticamente.
 * Devuelve además la lista de conflictos.
 */
export function fusionarPropiedades(a: Propiedades, b: Propiedades): ResultadoFusionarPropiedades {
  const claves = new Set<string>([...(a ? Object.keys(a) : []), ...(b ? Object.keys(b) : [])]);
  const resultado: Propiedades = {};
  const conflictos: string[] = [];

  for (const id of Array.from(claves).sort()) {
    const pa = a?.[id];
    const pb = b?.[id];
    if (pa && !pb) {
      resultado[id] = { ...pa };
      continue;
    }
    if (pb && !pa) {
      resultado[id] = { ...pb };
      continue;
    }
    if (!pa || !pb) continue;

    if (pa.dueno === pb.dueno) {
      const epoca = Math.max(pa.epoca, pb.epoca);
      resultado[id] = { dueno: pa.dueno, epoca };
      continue;
    }

    if (pa.epoca !== pb.epoca) {
      if (pa.epoca > pb.epoca) {
        resultado[id] = { ...pa };
      } else {
        resultado[id] = { ...pb };
      }
      conflictos.push(id);
      continue;
    }

    // Igual época y distinto dueño: dueño menor alfabéticamente
    if (pa.dueno < pb.dueno) {
      resultado[id] = { ...pa };
    } else {
      resultado[id] = { ...pb };
    }
    conflictos.push(id);
  }

  return { propiedades: resultado, conflictos: conflictos.sort() };
}

/**
 * Comprueba si `usuarioId` puede escribir el elemento `id` según rol y propiedad.
 * Un editor escribe lo suyo o lo que nadie reclamó.
 */
export function puedeEscribir(
  sala: Sala,
  usuarioId: string,
  p: Propiedades,
  id: string,
): boolean {
  if (!puedeEditar(sala, usuarioId)) return false;
  const prop = p[id];
  if (!prop) return true;
  return prop.dueno === usuarioId;
}

export interface ResultadoForzarTraspaso {
  propiedades: Propiedades;
  registro: { forzadoPor: string; dadoA: string; id: string };
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
  const rol = sala.miembros?.[usuarioId];
  if (rol !== "dueno") return null;
  const actual = p[id];
  const epoca = actual ? actual.epoca + 1 : 1;
  return {
    propiedades: { ...p, [id]: { dueno: a, epoca } },
    registro: { forzadoPor: usuarioId, dadoA: a, id },
  };
}
