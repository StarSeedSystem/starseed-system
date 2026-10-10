/**
 * Bus de la orbe de la Protomolécula (lógica PURA, sin directivas de cliente).
 * Posición junto a la orbe de Aurora, preferencia sincronizada y eventos.
 * No importa el bus de Aurora: solo conoce su clave de almacenamiento y la
 * parsea con defensa, de modo que si su formato cambia se cae al default.
 */

export const PROTO_ORB_POS_KEY = "starseed.protomolecula.orbe.pos.v1";
export const PROTO_ORB_FAB_KEY = "starseed.protomolecula.orbe.enabled.v1";
export const PROTO_ORB_FAB_EVENT = "starseed:protomolecula-orb-fab";
/** Lo emite la acción del agente (F0M) y lo escucha la orbe (F0L). */
export const PROTO_ORB_ABRIR_EVENT = "starseed:protomolecula-abrir";

export const TAMANO_ORBE = 56;
/** Separación horizontal respecto a la orbe de Aurora. */
const SEPARACION_AURORA = 64;
/** La clave se replica como constante local (no se importa el módulo de Aurora). */
const CLAVE_POS_AURORA = "starseed.aurora.orb.pos.v1";

export interface Punto {
  x: number;
  y: number;
}

export interface Viewport {
  ancho: number;
  alto: number;
}

export interface AlmacenLocal {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const esNumero = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

/** Mantiene la orbe entera dentro del viewport. */
export function limitarPosicion(
  pos: Punto,
  viewport: Viewport,
  tamano: number = TAMANO_ORBE,
): Punto {
  const maxX = Math.max(0, viewport.ancho - tamano);
  const maxY = Math.max(0, viewport.alto - tamano);
  return {
    x: Math.min(Math.max(0, pos.x), maxX),
    y: Math.min(Math.max(0, pos.y), maxY),
  };
}

/**
 * Posición por defecto: a la izquierda de la de Aurora (64 px de separación)
 * cuando se conoce; si no, abajo a la derecha. Siempre dentro del viewport.
 */
export function posicionPorDefecto(
  posAurora: Punto | null,
  viewport: Viewport,
): Punto {
  if (posAurora) {
    return limitarPosicion(
      { x: posAurora.x - TAMANO_ORBE - SEPARACION_AURORA, y: posAurora.y },
      viewport,
    );
  }
  return limitarPosicion(
    { x: viewport.ancho - TAMANO_ORBE - 16, y: viewport.alto - TAMANO_ORBE - 16 },
    viewport,
  );
}

/**
 * Lee la posición de Aurora sin acoplarse a su módulo: acepta ratios (0..1,
 * formato actual `xRatio`/`yRatio`) o píxeles. Formato irreconocible → null.
 */
export function leerPosAurora(almacen: AlmacenLocal, viewport: Viewport): Punto | null {
  try {
    const raw = almacen.getItem(CLAVE_POS_AURORA);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (esNumero(p.xRatio) && esNumero(p.yRatio)) {
      return limitarPosicion({ x: p.xRatio * viewport.ancho, y: p.yRatio * viewport.alto }, viewport);
    }
    if (esNumero(p.x) && esNumero(p.y)) return limitarPosicion({ x: p.x, y: p.y }, viewport);
  } catch {
    /* defensivo */
  }
  return null;
}

/** Lee la posición guardada; si falta o es inválida, calcula el default. */
export function leerPosicion(almacen: AlmacenLocal, viewport: Viewport): Punto {
  try {
    const raw = almacen.getItem(PROTO_ORB_POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Punto>;
      if (esNumero(p.x) && esNumero(p.y)) return limitarPosicion({ x: p.x, y: p.y }, viewport);
    }
  } catch {
    /* defensivo */
  }
  return posicionPorDefecto(leerPosAurora(almacen, viewport), viewport);
}

export function guardarPosicion(almacen: AlmacenLocal, pos: Punto): void {
  try {
    almacen.setItem(PROTO_ORB_POS_KEY, JSON.stringify({ x: pos.x, y: pos.y }));
  } catch {
    /* defensivo */
  }
}

/** Preferencia del FAB: TRUE por defecto (Alex la quiere junto a Astraura). */
export function leerActivada(almacen: AlmacenLocal): boolean {
  try {
    return almacen.getItem(PROTO_ORB_FAB_KEY) !== "false";
  } catch {
    return true;
  }
}

export function guardarActivada(almacen: AlmacenLocal, activada: boolean): void {
  try {
    almacen.setItem(PROTO_ORB_FAB_KEY, activada ? "true" : "false");
  } catch {
    /* defensivo */
  }
}
