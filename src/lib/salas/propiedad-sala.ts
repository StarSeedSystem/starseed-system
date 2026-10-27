/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Salas — propiedad de elementos por épocas
 * (Ola 1025R · INF1025J · método «propiedad de actores por épocas» de
 * Co-op Anything, portado a TypeScript puro).
 * ---------------------------------------------------------------------------
 * «Gana el último en escribir» (`sincronia-sala.ts`) vale para pizarras y
 * notas, pero no para un avatar, una ficha de juego o un widget con estado
 * propio: ahí cada elemento tiene UN dueño y una época; sólo el dueño escribe;
 * ceder el elemento sube la época; una escritura con época vieja se rechaza.
 *
 * Módulo PURO y ADITIVO: sin red, sin disco, sin reloj, sin tocar
 * `sincronia-sala.ts` ni `sala.ts` (de la que importa sólo `puedeEditar`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { puedeEditar, type Sala } from "./sala";

/** Un elemento reclamado: su dueño (id de persona) y su época. */
export interface Propiedad {
  dueno: string;
  epoca: number;
}

/** Propiedades de una sala: clave = id de `ElementoSala`. */
export type Propiedades = Record<string, Propiedad>;

/** Por qué se rechaza una escritura sobre un elemento reclamado. */
export type MotivoRechazo = "sin-dueno" | "no-es-dueno" | "epoca-vieja";

export type VeredictoEscritura = { ok: true } | { ok: false; motivo: MotivoRechazo };

/** Quién forzó un traspaso, a quién se le quitó y quién lo recibió. */
export interface RegistroTraspaso {
  forzadoPor: string;
  de: string;
  a: string;
  epocaNueva: number;
}

/**
 * Reclama un elemento que aún no tiene dueño: pasa a `quien` con época 1.
 * Si ya tiene dueño —incluso él mismo— no cambia nada: reclamar no quita,
 * se cede (`traspasar`) o lo fuerza el dueño de la sala. Mapa NUEVO.
 */
export function reclamar(p: Propiedades, id: string, quien: string): Propiedades {
  if (p[id]) return p;
  return { ...p, [id]: { dueno: quien, epoca: 1 } };
}

/**
 * Cede el elemento de `de` a `a`: sólo si `de` es su dueño, y ceder sube la
 * época en 1 (eso es lo que vuelve «vieja» la escritura del que no lo sabía).
 * Ante un dueño equivocado o un elemento sin dueño, no cambia nada.
 */
export function traspasar(p: Propiedades, id: string, de: string, a: string): Propiedades {
  const actual = p[id];
  if (!actual || actual.dueno !== de || de === a) return p;
  return { ...p, [id]: { dueno: a, epoca: actual.epoca + 1 } };
}

/**
 * Veredicto de una escritura. Con época vigente y dueño correcto: sí. Sin
 * dueño aún: se reclama antes (`reclamar`). No es el dueño, o lleva una
 * época que ya no es la vigente (cambió de manos): pura y simplemente no.
 */
export function aceptarEscritura(
  p: Propiedades,
  id: string,
  quien: string,
  epocaVista: number,
): VeredictoEscritura {
  const actual = p[id];
  if (!actual) return { ok: false, motivo: "sin-dueno" };
  if (actual.dueno !== quien) return { ok: false, motivo: "no-es-dueno" };
  if (epocaVista !== actual.epoca) return { ok: false, motivo: "epoca-vieja" };
  return { ok: true };
}

/**
 * El rechazo, dicho para una persona, sin tecnicismos. Con el nombre del dueño
 * se lo dice por su nombre («esa pieza la tiene Ana; pídesela»).
 */
export function explicar(motivo: MotivoRechazo, nombreDueno?: string): string {
  switch (motivo) {
    case "sin-dueno":
      return "Esa pieza no la tiene nadie todavía: tómala como tuya y escribe después.";
    case "no-es-dueno":
      return nombreDueno
        ? `Esa pieza la tiene ${nombreDueno}; pídesela.`
        : "Esa pieza la tiene otra persona; pídesela.";
    case "epoca-vieja":
      return "Esa pieza cambió de manos desde la última vez que la viste: mírala de nuevo antes de escribir.";
  }
}

/** Resultado de la fusión: mapa ganador más la lista de ids en conflicto. */
export interface FusionPropiedades {
  resultado: Propiedades;
  conflictos: string[];
}

/**
 * Fusiona dos mapas de propiedades de la misma sala: DETERMINISTA y
 * CONMUTATIVA, como `fusionarEstado`. Gana la época mayor; a igual época y
 * distinto dueño, el dueño menor alfabéticamente (todos los aparatos llegan a
 * la misma conclusión, en el orden en que la lleguen). Devuelve también los
 * ids en conflicto, para avisar que dos personas reclamaron lo mismo.
 */
export function fusionarPropiedades(a: Propiedades, b: Propiedades): FusionPropiedades {
  const resultado: Propiedades = { ...a };
  const conflictos: string[] = [];
  for (const [id, entrante] of Object.entries(b)) {
    const actual = resultado[id];
    if (!actual) {
      resultado[id] = entrante;
      continue;
    }
    if (actual.dueno === entrante.dueno && actual.epoca === entrante.epoca) continue;
    conflictos.push(id);
    resultado[id] =
      actual.epoca !== entrante.epoca
        ? actual.epoca > entrante.epoca
          ? actual
          : entrante
        : actual.dueno <= entrante.dueno
          ? actual
          : entrante;
  }
  return { resultado, conflictos: conflictos.sort() };
}

/**
 * Combina el rol (`puedeEditar` de `sala.ts`) con la propiedad. Un editor
 * escribe lo suyo o lo que nadie reclamó; lo reclamado por otra persona, no.
 * (Acepta también al dueño de la sala: `puedeEditar` ya lo cumple.)
 */
export function puedeEscribir(
  sala: Sala,
  usuarioId: string,
  p: Propiedades,
  id: string,
): boolean {
  if (!puedeEditar(sala, usuarioId)) return false;
  const actual = p[id];
  if (!actual) return true;
  return actual.dueno === usuarioId;
}

/**
 * Traspaso forzado: sólo el DUEÑO DE LA SALA puede absolverse un bloqueo de
 * propiedad. El resultado lleva registro de quién lo forzó, a quién se le
 * quitó (o una pieza sin dueño), quién lo recibió y la época que quedó. Si no
 * es el dueño de la sala, o no había nada que cambiar, nada.
 */
export function forzarTraspaso(
  sala: Sala,
  usuarioId: string,
  p: Propiedades,
  id: string,
  a: string,
): { resultado: Propiedades; registro: RegistroTraspaso } | null {
  if (sala.miembros[usuarioId] !== "dueno") return null;
  const actual = p[id];
  if (!actual) {
    return {
      resultado: { ...p, [id]: { dueno: a, epoca: 1 } },
      registro: { forzadoPor: usuarioId, de: "", a, epocaNueva: 1 },
    };
  }
  if (actual.dueno === a) return null;
  const epocaNueva = actual.epoca + 1;
  return {
    resultado: { ...p, [id]: { dueno: a, epoca: epocaNueva } },
    registro: { forzadoPor: usuarioId, de: actual.dueno, a, epocaNueva },
  };
}
