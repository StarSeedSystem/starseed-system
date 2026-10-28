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

/** Diámetro del dibujo de la orbe en pantallas anchas (≥ 640 px). En pantallas chicas se reduce: `medidasOrbe`. */
export const TAMANO_ORBE = 56;
/** Diana táctil mínima (objetivos táctiles ≥ 44 px de las reglas de diseño del proyecto). */
export const DIANA_MINIMA = 44;
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

/**
 * Cuánto se reduce la orbe según el ancho de la pantalla (PRO1025M, petición de Alex 2026-10-25: «en pantallas
 * chicas haz más chica la Protomolécula»): < 400 px → 0,7× · < 640 px → 0,8× · el resto 1×. Un ancho que no
 * es un número (SSR, medida rota) cuenta como pantalla ancha.
 */
export function factorTamanoOrbe(ancho: number): number {
  if (!esNumero(ancho) || ancho <= 0) return 1;
  if (ancho < 400) return 0.7;
  if (ancho < 640) return 0.8;
  return 1;
}

export interface MedidasOrbe {
  /** Factor aplicado al tamaño base. */
  factor: number;
  /** Diámetro del círculo que se VE. */
  dibujo: number;
  /** Lado de la caja que se toca y se arrastra: nunca baja de 44 px, así que puede ser mayor que el dibujo. */
  diana: number;
  /** Lado del lienzo three.js: el doble del dibujo (el halo y la flor de la vida respiran fuera del círculo). */
  lienzo: number;
}

/** Todas las medidas de la orbe para un ancho de pantalla. Pura: se recalcula al rotar o cambiar de tamaño. */
export function medidasOrbe(ancho: number): MedidasOrbe {
  const factor = factorTamanoOrbe(ancho);
  const dibujo = Math.round(TAMANO_ORBE * factor);
  return { factor, dibujo, diana: Math.max(DIANA_MINIMA, dibujo), lienzo: dibujo * 2 };
}

/** Mantiene la orbe entera dentro del viewport; `tamano` es el lado de su diana (`medidasOrbe(ancho).diana`). */
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

/** Ancho bajo el cual Aurora pega su orbe al borde lateral más cercano (`snapXToNearestEdge`, aurora-orb-bus). */
const ANCHO_MOVIL_AURORA = 640;

/**
 * Dónde se VE la orbe de Aurora, no solo dónde quedó guardada: en pantallas < 640 px Aurora la pega al borde
 * lateral más cercano (0,04 / 0,96 del ancho) aunque lo guardado diga otra cosa. La regla se copia aquí —como
 * su clave de posición— para no acoplar este módulo puro al suyo; si la regla de Aurora cambiara, el único
 * efecto es una separación algo distinta, nunca un fallo.
 */
function xVisibleDeAurora(x: number, viewport: Viewport): number {
  if (viewport.ancho >= ANCHO_MOVIL_AURORA) return x;
  return x / viewport.ancho < 0.5 ? viewport.ancho * 0.04 : viewport.ancho * 0.96;
}

/**
 * Posición por defecto: a la izquierda de la de Aurora (64 px de separación entre su centro y el borde de la
 * Protomolécula) cuando se conoce; si ahí no cabe (Aurora pegada al borde izquierdo, como la deja el móvil),
 * a su derecha, para no taparla; si no se conoce, abajo a la derecha. Siempre dentro del viewport.
 */
export function posicionPorDefecto(
  posAurora: Punto | null,
  viewport: Viewport,
  tamano: number = TAMANO_ORBE,
): Punto {
  if (posAurora) {
    const xAurora = xVisibleDeAurora(posAurora.x, viewport);
    const izquierda = xAurora - tamano - SEPARACION_AURORA;
    const x = izquierda >= 0 ? izquierda : xAurora + SEPARACION_AURORA;
    return limitarPosicion({ x, y: posAurora.y }, viewport, tamano);
  }
  return limitarPosicion(
    { x: viewport.ancho - tamano - 16, y: viewport.alto - tamano - 16 },
    viewport,
    tamano,
  );
}

/**
 * Lee la posición de Aurora sin acoplarse a su módulo: acepta ratios (0..1,
 * formato actual `xRatio`/`yRatio`) o píxeles. Formato irreconocible → null.
 */
export function leerPosAurora(almacen: AlmacenLocal, viewport: Viewport, tamano: number = TAMANO_ORBE): Punto | null {
  try {
    const raw = almacen.getItem(CLAVE_POS_AURORA);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (esNumero(p.xRatio) && esNumero(p.yRatio)) {
      return limitarPosicion({ x: p.xRatio * viewport.ancho, y: p.yRatio * viewport.alto }, viewport, tamano);
    }
    if (esNumero(p.x) && esNumero(p.y)) return limitarPosicion({ x: p.x, y: p.y }, viewport, tamano);
  } catch {
    /* defensivo */
  }
  return null;
}

/** Lee la posición guardada; si falta o es inválida, calcula el default. */
export function leerPosicion(almacen: AlmacenLocal, viewport: Viewport, tamano: number = TAMANO_ORBE): Punto {
  try {
    const raw = almacen.getItem(PROTO_ORB_POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Punto>;
      if (esNumero(p.x) && esNumero(p.y)) return limitarPosicion({ x: p.x, y: p.y }, viewport, tamano);
    }
  } catch {
    /* defensivo */
  }
  return posicionPorDefecto(leerPosAurora(almacen, viewport, tamano), viewport, tamano);
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

/** Lo emite quien pide cerrar el panel de la orbe sin desactivarla. */
export const PROTO_ORB_CERRAR_EVENT = "starseed:protomolecula-cerrar";

/** Lo que la puerta necesita del entorno; en pruebas se pasan falsos y no se toca `window`. */
export interface DepsOrbe {
  almacen?: AlmacenLocal;
  emitir?: (e: Event) => boolean;
  empujar?: () => void;
}

/** Por defecto: sube las preferencias a la cuenta para que las demás neuronas lo reciban. Nunca lanza. */
function empujarPorDefecto(): void {
  try {
    void import("@/lib/settings-sync")
      .then((m) => m.pushPreferences())
      .catch(() => {
        /* sin sesión o sin red: la próxima sincronización lo lleva */
      });
  } catch {
    /* defensivo */
  }
}

function almacenPorDefecto(): AlmacenLocal | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * UNA sola puerta para activar o desactivar la orbe de la Protomolécula (botón del lienzo de creación y
 * peticiones a Astraura): guarda la preferencia, avisa a la pestaña con `PROTO_ORB_FAB_EVENT` y la empuja a
 * las demás neuronas. Devuelve el valor que quedó guardado.
 */
export function fijarOrbeActivada(activada: boolean, deps: DepsOrbe = {}): boolean {
  const almacen = deps.almacen ?? almacenPorDefecto();
  if (almacen) guardarActivada(almacen, activada);
  const guardado = almacen ? leerActivada(almacen) : activada;
  const emitir =
    deps.emitir ?? (typeof window !== "undefined" ? (e: Event) => window.dispatchEvent(e) : undefined);
  try {
    if (emitir && typeof CustomEvent !== "undefined") {
      emitir(new CustomEvent(PROTO_ORB_FAB_EVENT, { detail: { activada: guardado } }));
    }
  } catch {
    /* defensivo */
  }
  try {
    (deps.empujar ?? empujarPorDefecto)();
  } catch {
    /* defensivo: la sincronización nunca rompe el interruptor */
  }
  return guardado;
}

/** Invierte el estado actual de la orbe con la misma puerta. */
export function alternarOrbe(deps: DepsOrbe = {}): boolean {
  const almacen = deps.almacen ?? almacenPorDefecto();
  const actual = almacen ? leerActivada(almacen) : true;
  return fijarOrbeActivada(!actual, deps);
}
