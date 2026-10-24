/**
 * BIBLIOTECA DE MOVIMIENTO STARSEED (WAAPI, puro)
 * Keyframes y opciones de siembra, entrada cardinal, fundido con desenfoque,
 * elemento compartido, barrido de horizonte, respiración, cristalización y
 * alquimia. No toca el DOM: devuelve objetos para `element.animate(...)`.
 * Solo se animan transform, opacity, filter y clipPath.
 */

export const PROPIEDADES_PERMITIDAS = ["transform", "opacity", "filter", "clipPath"] as const;

export type PropiedadAnimable = (typeof PROPIEDADES_PERMITIDAS)[number];

/** Curvas reales del OS: orgánica, desliz y Genesis. */
export const CURVAS = {
  organica: "cubic-bezier(0.22, 1, 0.36, 1)",
  desliz: "cubic-bezier(0.16, 1, 0.3, 1)",
  genesis: "cubic-bezier(0.22, 0.9, 0.3, 1)",
} as const;

/** Duraciones de interfaz (ms): 140 / 220 / 240. */
export const DURACION_UI = { rapida: 140, organica: 220, normal: 240 } as const;

/** Duraciones de escena (ms): entrada 600–900 y respiración 4–6 s. */
export const DURACION_ESCENA = { entrada: 600, cambio: 700, siembra: 900, respiracion: 5000 } as const;

/** Puntos cardinales de la Trinity, cada uno entra desde su borde. */
export type PuntoTrinity = "zenith" | "horizon" | "logic" | "anchor";

export interface MovimientoStarseed {
  nombre: string;
  keyframes: Keyframe[];
  opciones: KeyframeAnimationOptions;
  /** Propiedades CSS que anima, para validar el presupuesto de movimiento. */
  propiedades: string[];
}

const CLAVES_DE_CONTROL = new Set(["offset", "easing", "composite"]);

/** Propiedades animadas por unos keyframes (sin las claves de control). */
export function propiedadesDe(keyframes: Keyframe[]): string[] {
  const vistas = new Set<string>();
  for (const fotograma of keyframes) {
    for (const clave of Object.keys(fotograma)) {
      if (!CLAVES_DE_CONTROL.has(clave)) vistas.add(clave);
    }
  }
  return [...vistas];
}

/** Crea un movimiento y anota qué propiedades anima. */
function movimiento(nombre: string, keyframes: Keyframe[], opciones: KeyframeAnimationOptions): MovimientoStarseed {
  return { nombre, keyframes, opciones, propiedades: propiedadesDe(keyframes) };
}

/** Versión de movimiento reducido: 1 ms, sin retardo ni repeticiones. */
export function opcionesReducidas(o: KeyframeAnimationOptions): KeyframeAnimationOptions {
  return { ...o, duration: 1, delay: 0, iterations: 1, easing: "linear", direction: "normal" };
}

const DESDE: Record<PuntoTrinity, string> = { zenith: "translateY(-24px) scale(0.98)", horizon: "translateX(-24px) scale(0.98)", logic: "translateX(24px) scale(0.98)", anchor: "translateY(24px) scale(0.98)" };

/** Siembra: punto → brote → símbolo. */
export function siembra(): MovimientoStarseed {
  return movimiento("siembra", [{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1.4)", opacity: 1, offset: 0.6 }, { transform: "scale(1)", opacity: 1 }], { duration: DURACION_ESCENA.siembra, easing: CURVAS.organica, fill: "both" });
}

/** Entrada cardinal desde el perímetro hacia su punto de la Trinity. */
export function entradaCardinal(punto: PuntoTrinity = "zenith"): MovimientoStarseed {
  return movimiento(`entrada-cardinal:${punto}`, [{ transform: DESDE[punto], opacity: 0 }, { transform: "translate(0, -2px) scale(1)", opacity: 1, offset: 0.8 }, { transform: "none", opacity: 1 }], { duration: DURACION_ESCENA.cambio, easing: CURVAS.desliz, fill: "both" });
}

/** Fundido con desenfoque para cambiar de escena sin corte. */
export function fundidoDesenfoque(): MovimientoStarseed {
  return movimiento("fundido-desenfoque", [{ filter: "blur(8px)", opacity: 0 }, { filter: "blur(0)", opacity: 1 }], { duration: DURACION_ESCENA.entrada, easing: CURVAS.organica, fill: "both" });
}

/** Elemento compartido: la tarjeta crece hasta ser la ventana. */
export function elementoCompartido(): MovimientoStarseed {
  return movimiento("elemento-compartido", [{ transform: "scale(1)" }, { transform: "scale(2.6, 3.2)" }], { duration: DURACION_ESCENA.cambio, easing: CURVAS.desliz, fill: "both" });
}

/** Barrido de horizonte: la línea cruza y revela la escena siguiente. */
export function barridoHorizonte(): MovimientoStarseed[] {
  return [
    movimiento("barrido-horizonte:linea", [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: DURACION_ESCENA.cambio, easing: CURVAS.desliz, fill: "both" }),
    movimiento("barrido-horizonte:escena", [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: DURACION_ESCENA.cambio, delay: 300, easing: CURVAS.desliz, fill: "both" }),
  ];
}

/** Respiración: escala 1 → 1.03, ida y vuelta sin fin. */
export function respiracion(): MovimientoStarseed {
  return movimiento("respiracion", [{ transform: "scale(1)" }, { transform: "scale(1.03)" }], { duration: DURACION_ESCENA.respiracion, easing: CURVAS.organica, fill: "both", iterations: Infinity, direction: "alternate" });
}

/** Cristalización: la malla se ordena en retícula, con escalonado. */
export function cristalizacion(indice = 0): MovimientoStarseed {
  return movimiento("cristalizacion", [{ transform: "rotate(-8deg) scale(0.92)", opacity: 0.4, filter: "blur(2px)" }, { transform: "rotate(0deg) scale(1)", opacity: 1, filter: "blur(0)" }], { duration: DURACION_ESCENA.cambio, delay: Math.min(indice * 60, 480), easing: CURVAS.genesis, fill: "both" });
}

/** Alquimia: lo gris se vuelve oro de lógica al cumplir su propósito. */
export function alquimia(): MovimientoStarseed {
  return movimiento("alquimia", [{ filter: "saturate(0) brightness(0.9)", transform: "scale(0.98)" }, { filter: "saturate(1.4) brightness(1.08)", transform: "scale(1)" }], { duration: DURACION_ESCENA.siembra, easing: CURVAS.genesis, fill: "both" });
}
