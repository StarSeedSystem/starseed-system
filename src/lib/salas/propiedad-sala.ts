/**
 * StarSeed OS · Salas — propiedad de elementos por épocas (Ola 1025R · INF1025J).
 * ---------------------------------------------------------------------------
 * En una pizarra vale «gana el último» (`sincronia-sala.ts`), pero un avatar,
 * una ficha de juego o un widget con estado propio no: dos personas moviendo
 * lo mismo a la vez se lo deshacen. Aquí vive la regla que Co-op Anything
 * llama «propiedad de actores por épocas»: cada elemento tiene un dueño y una
 * época; sólo el dueño escribe; ceder el elemento sube la época; una escritura
 * con época vieja se rechaza. Es ADITIVO: no toca la fusión que ya existe, se
 * pone al lado de ella.
 *
 * Módulo PURO: sin red, sin disco, sin reloj. Los mapas que entran nunca se
 * mutan: toda operación devuelve un mapa nuevo.
 */

import { puedeEditar, type Sala } from "./sala";

/** Dueño y época de un elemento (clave: id de `ElementoSala`; dueño: id de persona). */
export interface Propiedad {
  dueno: string;
  epoca: number;
}

/** Mapa de propiedad de una sala, por id de elemento. */
export type Propiedades = Record<string, Propiedad>;

/** Por qué se rechaza una escritura: sin dueño, no es tuyo o traes época vieja. */
export type MotivoRechazo = "sin-dueno" | "no-es-dueno" | "epoca-vieja";

/** Veredicto de validar una escritura contra el mapa de propiedad. */
export type VeredictoEscritura = { ok: true } | { ok: false; motivo: MotivoRechazo };

/** Reclama: un elemento sin dueño pasa a quien lo pide, con época 1. */
export function reclamar(p: Propiedades, id: string, quien: string): Propiedades {
  if (p[id]) return { ...p };
  return { ...p, [id]: { dueno: quien, epoca: 1 } };
}

/** Cede el elemento: sólo si `de` es el dueño; ceder sube la época en 1. */
export function traspasar(p: Propiedades, id: string, de: string, a: string): Propiedades {
  const actual = p[id];
  if (!actual || actual.dueno !== de) return { ...p };
  return { ...p, [id]: { dueno: a, epoca: actual.epoca + 1 } };
}

/** ¿Se acepta esta escritura? Sin dueño no se escribe: primero se reclama. */
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

/** Frase para una persona, en claro y sin tecnicismos: qué pasó y qué hacer. */
export function explicar(motivo: MotivoRechazo, nombreDueno?: string): string {
  if (motivo === "sin-dueno") return "Nadie se ha hecho cargo todavía de esa pieza: tómala tú primero.";
  if (motivo === "no-es-dueno") {
    return nombreDueno
      ? `Esa pieza la tiene ${nombreDueno}; pídesela.`
      : "Esa pieza la tiene otra persona; pídesela.";
  }
  return "Tu copia va por detrás: recibe los últimos cambios antes de volver a escribir.";
}

/** Desacuerdo entre dos mapas sobre el mismo elemento. */
export interface ConflictoPropiedad {
  id: string;
  /** Los dos dueños en disputa, en orden alfabético: no depende del orden de fusión. */
  duenos: string[];
  /** El dueño que gana tras el desempate de época. */
  ganador: string;
}

/**
 * Fusiona dos mapas de propiedad. DETERMINISTA y CONMUTATIVA: gana la época
 * mayor y, a igual época y distinto dueño, el dueño menor alfabéticamente, así
 * que fusionar a con b o b con a da el mismo resultado en cualquier neurona.
 * Devuelve además los elementos en disputa, para avisar con honestidad.
 */
export function fusionarPropiedades(
  a: Propiedades,
  b: Propiedades,
): { resultado: Propiedades; conflictos: ConflictoPropiedad[] } {
  const resultado: Propiedades = { ...a };
  const conflictos: ConflictoPropiedad[] = [];
  for (const [id, deB] of Object.entries(b)) {
    const deA = a[id];
    if (!deA) {
      resultado[id] = deB;
      continue;
    }
    if (deA.dueno === deB.dueno && deA.epoca === deB.epoca) continue;
    const ganaB = deB.epoca > deA.epoca || (deB.epoca === deA.epoca && deB.dueno < deA.dueno);
    const elegida = ganaB ? deB : deA;
    resultado[id] = elegida;
    conflictos.push({ id, duenos: [deA.dueno, deB.dueno].sort(), ganador: elegida.dueno });
  }
  return { resultado, conflictos: conflictos.sort((c1, c2) => c1.id.localeCompare(c2.id)) };
}

/**
 * ¿Puede escribir este elemento? Combina el rol de `sala.ts` con la propiedad:
 * un editor (o mejor) escribe lo suyo o lo que nadie reclamó; lo de otro no.
 */
export function puedeEscribir(sala: Sala, usuarioId: string, p: Propiedades, id: string): boolean {
  if (!puedeEditar(sala, usuarioId)) return false;
  const prop = p[id];
  return !prop || prop.dueno === usuarioId;
}

/** Resultado de un traspaso forzado, con su registro de quién lo hizo. */
export interface TraspasoForzado {
  hecho: boolean;
  /** Mapa nuevo con el cambio (sin tocar nada si no se hizo). */
  propiedades: Propiedades;
  /** Quién lo forzó (vacío si no se hizo: no era dueño de la sala). */
  forzadoPor: string;
  /** A quién se le dio el elemento (vacío si no se hizo). */
  dadoA: string;
}

/**
 * El dueño de la SALA puede dar un elemento a otra persona aunque su dueño
 * actual no quiera; el cambio queda registrado. Un elemento libre se asigna
 * con época 1; uno con dueño sube su época en 1, igual que al cederlo.
 */
export function forzarTraspaso(
  sala: Sala,
  usuarioId: string,
  p: Propiedades,
  id: string,
  a: string,
): TraspasoForzado {
  if (sala.miembros[usuarioId] !== "dueno") {
    return { hecho: false, propiedades: { ...p }, forzadoPor: "", dadoA: "" };
  }
  const actual = p[id];
  const propiedades = { ...p, [id]: { dueno: a, epoca: (actual?.epoca ?? 0) + 1 } };
  return { hecho: true, propiedades, forzadoPor: usuarioId, dadoA: a };
}
