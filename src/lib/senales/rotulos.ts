/**
 * rotulos — dónde caben los rótulos de texto del plano SIN taparse (2026-10-10).
 * ═════════════════════════════════════════════════════════════════════════════
 * El plano pinta varios textos sobre un mismo disco (sectores, anillos, nombres de aparatos,
 * antenas propias, «Tú»). Cuando dos caen en el mismo sitio, ninguno se lee. Aquí se decide, de
 * forma determinista, dónde va cada uno: se prueba su sitio natural y luego sus alternativas, y
 * se descarta el que no cabe en ninguno. Lo forzado (lo elegido o apuntado) nunca se esconde.
 * Nada se inventa ni se mueve lejos: un rótulo está donde dice su dato o no se ve.
 *
 * Puro: sin React, sin red, sin `node:*`.
 */

export type Anclaje = "start" | "middle" | "end";

export interface Posicion {
  /** Punto de anclaje (unidades del viewBox) y línea base del texto. */
  x: number;
  y: number;
  anclaje: Anclaje;
}

export interface Rotulo {
  id: string;
  x: number;
  y: number;
  texto: string;
  anclaje?: Anclaje;
  /** Tamaño de letra en unidades del viewBox. */
  tam: number;
  /** Mayor = antes. Desde 100, el rótulo se dibuja siempre (lo elegido o apuntado). */
  prioridad: number;
  /** Otros sitios donde puede ir si el natural está ocupado, por orden de preferencia. */
  alternativas?: readonly Posicion[];
}

export interface Caja { x0: number; y0: number; x1: number; y1: number }

/** Ancho medio de un carácter respecto a su tamaño de letra (sans-serif, algo por encima para no quedarse corto). */
const ANCHO_CARACTER = 0.6;
const MARGEN = 0.5;

export function cajaDeRotulo(r: Pick<Rotulo, "texto" | "tam">, p: Posicion): Caja {
  const w = r.texto.length * r.tam * ANCHO_CARACTER;
  const x0 = p.anclaje === "start" ? p.x : p.anclaje === "end" ? p.x - w : p.x - w / 2;
  return { x0: x0 - MARGEN, x1: x0 + w + MARGEN, y0: p.y - r.tam - MARGEN, y1: p.y + r.tam * 0.25 + MARGEN };
}

const choca = (a: Caja, b: Caja) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Sitio de cada rótulo que se dibuja (los que no caben no salen en el resultado). `reservadas` son
 * zonas ya ocupadas por otra cosa (el punto de «Tú», los cuerpos de las marcas). A igual
 * prioridad manda el orden recibido.
 */
export function colocarRotulos(rotulos: readonly Rotulo[], reservadas: readonly Caja[] = []): Map<string, Posicion> {
  const colocados = new Map<string, Posicion>();
  const ocupadas: Caja[] = [...reservadas];
  const orden = rotulos
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.prioridad - a.r.prioridad || a.i - b.i);
  for (const { r } of orden) {
    const natural: Posicion = { x: r.x, y: r.y, anclaje: r.anclaje ?? "middle" };
    const candidatos = [natural, ...(r.alternativas ?? [])];
    const libre = candidatos.find((p) => !ocupadas.some((o) => choca(o, cajaDeRotulo(r, p))));
    const elegido = libre ?? (r.prioridad >= 100 ? natural : null);
    if (!elegido) continue;
    ocupadas.push(cajaDeRotulo(r, elegido));
    colocados.set(r.id, elegido);
  }
  return colocados;
}
