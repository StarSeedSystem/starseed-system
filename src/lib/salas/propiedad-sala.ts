/**
 * StarSeed OS · Salas — PROPIEDAD DE ELEMENTOS POR ÉPOCAS (Ola 1025R · INF1025J).
 * ============================================================================
 * Método de propiedad de actores por épocas de Co-op Anything, portado a las
 * salas de StarSeed. Para pizarras y notas basta «gana el último»
 * (`sincronia-sala.ts`), pero un avatar, una ficha de juego o un widget con
 * estado propio no se puede mover a la vez entre dos personas: cada elemento
 * tiene UN dueño y UNA época; sólo el dueño escribe; ceder el objeto sube la
 * época, y una escritura hecha con una época vieja se rechaza (quien la mandó
 * miraba una copia desactualizada y perdería el trabajo de otro sin saberlo).
 *
 * Módulo PURO y ADITIVO: sin red, sin disco, sin reloj, sin `node:*`; no toca
 * `sincronia-sala.ts` ni `sala.ts` (de esa sólo importa la regla de rol).
 * Dos escrituras a la vez sobre lo que nadie reclamó se resuelven de forma
 * determinista al fusionar (`fusionarPropiedades`): todas las neuronas llegan
 * al mismo dueño, fusionen en el orden que las fusionen.
 */

import { puedeEditar, type Sala } from "./sala";

/** Un elemento reclamado: quién lo tiene y en qué época quedó. */
export interface Propiedad {
  dueno: string;
  epoca: number;
}

/** Propiedades de toda la sala, por id de `ElementoSala` → dueño = persona. */
export type Propiedades = Record<string, Propiedad>;

/** Por qué una escritura no se acepta, sin tecnicismos. */
export type MotivoEscritura = "sin-dueno" | "no-es-dueno" | "epoca-vieja";

/** Respuesta de `aceptarEscritura`: siempre se dice por qué si no pasa. */
export interface DecisionEscritura {
  ok: boolean;
  motivo?: MotivoEscritura;
}

/**
 * Toma un elemento que nadie reclama. Si ya tiene dueño, no cambia nada:
 * reclamar lo que es de otra persona no roba, pasa por `traspasar`.
 * Devuelve un mapa NUEVO; el que recibió queda intacto.
 */
export function reclamar(p: Propiedades, id: string, quien: string): Propiedades {
  const actual = p[id];
  if (actual) return { ...p };
  return { ...p, [id]: { dueno: quien, epoca: 1 } };
}

/**
 * Cede un elemento de `de` a `a`. Sólo el dueño actual puede cederlo, y la
 * cesión SUBE la época en 1: así quien tenía permiso con la época vieja queda
 * fuera, y su escritura se rechaza por llegada en vez de pisar el nuevo turno.
 */
export function traspasar(p: Propiedades, id: string, de: string, a: string): Propiedades {
  const actual = p[id];
  if (!actual || actual.dueno !== de) return { ...p };
  return { ...p, [id]: { dueno: a, epoca: actual.epoca + 1 } };
}

/**
 * Frase en español con acentos, sin tecnicismos, para avisar por qué una
 * escritura no se aceptó («esa pieza la tiene Ana; pídesela»).
 */
export function explicar(motivo: MotivoEscritura, nombreDueno?: string): string {
  if (motivo === "no-es-dueno") {
    return nombreDueno
      ? `Esa pieza la tiene ${nombreDueno}; pídesela.`
      : "Esa pieza la tiene otra persona; pídesela.";
  }
  if (motivo === "epoca-vieja") {
    return "Esa pieza acaba de cambiar de manos: tómala con lo último que se ve y vuelve a intentarlo.";
  }
  return "Nadie tiene esa pieza todavía: tómala para ti primero.";
}

/**
 * Decide si una escritura sobre `id` entra: `quien` escribe con la época que
 * él vio (`epocaVista`). Sin dueño no hay escritura de verdad: primero se
 * reclama y la pelea de dos reclamos a la vez la resuelve la fusión.
 */
export function aceptarEscritura(
  p: Propiedades,
  id: string,
  quien: string,
  epocaVista: number,
): DecisionEscritura {
  const actual = p[id];
  if (!actual) return { ok: false, motivo: "sin-dueno" };
  if (actual.dueno !== quien) return { ok: false, motivo: "no-es-dueno" };
  if (epocaVista < actual.epoca) return { ok: false, motivo: "epoca-vieja" };
  return { ok: true };
}

/** Lo que devuelve fusionar dos mapas de propiedades. */
export interface FusionPropiedades {
  resultado: Propiedades;
  /** Ids que dos personas reclamaron a la vez, ordenados. */
  conflictos: string[];
}

/**
 * Fusiona dos mapas de propiedades de la misma sala, DETERMINISTA y
 * CONMUTATIVA: gana la época mayor y, a igual época y distinto dueño, el dueño
 * menor alfabéticamente. Así dos neuronas que reclaman lo mismo a la vez
 * llegan al mismo resultado fusionen en el orden que fusionen.
 */
export function fusionarPropiedades(a: Propiedades, b: Propiedades): FusionPropiedades {
  const resultado: Propiedades = { ...a };
  const conflictos = new Set<string>();

  for (const [id, entrante] of Object.entries(b)) {
    const actual = resultado[id];
    if (!actual) {
      resultado[id] = entrante;
      continue;
    }
    if (actual.dueno === entrante.dueno && actual.epoca === entrante.epoca) continue;
    conflictos.add(id);
    resultado[id] = ganaPropiedad(actual, entrante);
  }

  return { resultado, conflictos: [...conflictos].sort() };
}

/** Desempate determinista entre dos reclamaciones concurrentes del mismo id. */
function ganaPropiedad(x: Propiedad, y: Propiedad): Propiedad {
  if (x.epoca !== y.epoca) return x.epoca > y.epoca ? x : y;
  return x.dueno <= y.dueno ? x : y;
}

/**
 * ¿Puede `usuarioId` escribir el elemento `id` de la sala? COMBINA el rol
 * (sólo dueños y editores tocan contenido) con la propiedad: un
 * editor escribe lo suyo o lo que nadie reclamó; lo reclamado por otra
 * persona pasa por `traspasar`, no por escribir encima.
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

/** Recuerdo de una cesión forzada: quién la forzó y a quién se le dio. */
export interface RegistroTraspaso {
  porQuien: string;
  a: string;
  epocaNueva: number;
}

/** Resultado de `forzarTraspaso`; el registro viene sólo cuando entró. */
export interface ResultadoTraspasoForzado {
  ok: boolean;
  propiedades: Propiedades;
  registro?: RegistroTraspaso;
}

/**
 * Cesión FORZADA de un elemento: sólo la llave de la sala la usa, con el
 * registro de quién la forzó. A un elemento reclamado le sube la época (como
 * cualquier cesión); a uno libre simplemente se lo asigna. Si quien la pide
 * no es dueño de la sala, no pasa nada y el mapa queda como estaba.
 */
export function forzarTraspaso(
  sala: Sala,
  usuarioId: string,
  p: Propiedades,
  id: string,
  a: string,
): ResultadoTraspasoForzado {
  if (sala.miembros[usuarioId] !== "dueno") {
    return { ok: false, propiedades: { ...p } };
  }
  const actual = p[id];
  if (!actual) {
    const propiedades = { ...p, [id]: { dueno: a, epoca: 1 } };
    return { ok: true, propiedades, registro: { porQuien: usuarioId, a, epocaNueva: 1 } };
  }
  if (actual.dueno === a) {
    return {
      ok: true,
      propiedades: { ...p },
      registro: { porQuien: usuarioId, a, epocaNueva: actual.epoca },
    };
  }
  const epocaNueva = actual.epoca + 1;
  const propiedades = { ...p, [id]: { dueno: a, epoca: epocaNueva } };
  return { ok: true, propiedades, registro: { porQuien: usuarioId, a, epocaNueva } };
}
