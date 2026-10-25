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
/** Pedir el cierre/apagado de la orbe (botón del lienzo de creación o zona Horizon). */
export const PROTO_ORB_CERRAR_EVENT = "starseed:protomolecula-cerrar";

/**
 * Dependencias inyectables de la puerta de activación: almacén, emisor de
 * eventos y empuje a la cuenta. Todos opcionales; con `window` existen por
 * defecto y sin `window` la puerta no toca nada (no lanza).
 */
export interface DepsActivacion {
  almacen?: AlmacenLocal;
  emitir?: (e: Event) => boolean;
  empujar?: () => void;
}

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

// ── Puerta única de activación (PMO1020A) ────────────────────────────────────
// La usan el botón del lienzo de creación (Trinidad izquierda) y Astraura
// desde cualquier medio: guardar + evento en vivo en esta pestaña + empuje a
// la cuenta para que las demás neuronas lo reciban al instante.

/** `window.localStorage` si hay ventana; si no, nada (la puerta no toca DISCO). */
function almacenPorDefecto(): AlmacenLocal | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

/** Empuje por defecto: sube la preferencia a la cuenta SIN esperar y SIN lanzar. */
function empujarPorDefecto(): void {
  try {
    void import("@/lib/settings-sync")
      .then((m) => m.pushPreferences())
      .catch(() => undefined);
  } catch {
    /* defensivo */
  }
}

/**
 * Guarda el estado de la orbe, emite `PROTO_ORB_FAB_EVENT` con
 * `detail: { activada }` y empuja la preferencia a la cuenta (las demás
 * neuronas la reciben por realtime-sync). Devuelve el valor guardado.
 */
export function fijarOrbeActivada(activada: boolean, deps?: DepsActivacion): boolean {
  const almacen = deps?.almacen ?? almacenPorDefecto();
  if (almacen) guardarActivada(almacen, activada);
  const detalle = { activada };
  if (typeof CustomEvent !== "undefined") {
    const evento = new CustomEvent(PROTO_ORB_FAB_EVENT, { detail: detalle });
    try {
      if (deps?.emitir) deps.emitir(evento);
      else window.dispatchEvent(evento);
    } catch { /* un emisor roto no debe tirar la puerta */ }
  }
  try {
    if (deps?.empujar) deps.empujar();
    else empujarPorDefecto();
  } catch { /* el empuje va a best-effort: nunca lanza */ }
  return activada;
}

/** Invierte el estado guardado y lo fija por la misma puerta. */
export function alternarOrbe(deps?: DepsActivacion): boolean {
  const almacen = deps?.almacen ?? almacenPorDefecto();
  const ahora = almacen ? leerActivada(almacen) : true;
  return fijarOrbeActivada(!ahora, deps);
}
