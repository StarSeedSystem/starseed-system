/**
 * BIBLIOTECA DE MOVIMIENTO STARSEED — keyframes y opciones WAAPI (Ola 1019D · DSN1019G)
 * ─────────────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: el vocabulario de movimiento de StarSeed como tokens listos para
 * `element.animate()`, sin dependencias — encarna los ejemplos vivos del estudio
 * (`examples/transiciones.html`, `examples/siembra.html`). Fuentes: `identidades.md`
 * § «Decisiones de Alex 2026-10-19» y `adn-y-tokens.md` §5. Reglas: solo se animan
 * transform, opacity, filter y clip-path; curvas y duraciones reales del ADN;
 * colores por tokens, nunca hex sueltos; versión de movimiento reducido siempre.
 */
export const CURVAS_ADN = { organico: "cubic-bezier(0.22, 1, 0.36, 1)", glide: "cubic-bezier(0.16, 1, 0.3, 1)", genesis: "cubic-bezier(0.22, 0.9, 0.3, 1)" } as const;
export const DURACION_ADN = { interfazRapida: 140, interfaz: 220, interfazNormal: 240, escenaMinima: 600, escena: 720, escenaMaxima: 900 } as const;

/** Los cuatro puntos cardinales de la Trinity que reciben las entradas. */
export type PuntoTrinity = "zenith" | "horizonte" | "logica" | "anchor";
/** Un fotograma WAAPI: solo las cuatro propiedades permitidas, más el offset relativo. */
export interface Fotograma { transform?: string; opacity?: number; filter?: string; clipPath?: string; offset?: number; }
/** Un movimiento completo de la biblioteca: fotogramas y opciones ya resueltos. */
export interface Animacion { fotogramas: Fotograma[]; duracionMs: number; curva: string; retardoMs: number; iteraciones: number; alternar: boolean; }

/* Helper común: rellena las opciones por defecto de cada movimiento. */
function anim(fotogramas: Fotograma[], duracionMs: number, curva: string, extra: Partial<Animacion> = {}): Animacion {
  return { fotogramas, duracionMs, curva, retardoMs: 0, iteraciones: 1, alternar: false, ...extra };
}

/** Movimiento reducido: el estado final se pinta quieto — 1 ms, sin retardo ni bucle. */
export function opcionesReducidas(a: Animacion): Animacion {
  return { ...a, duracionMs: 1, retardoMs: 0, iteraciones: 1, alternar: false };
}

export interface OpcionesWAAPI { duration: number; easing: string; delay: number; fill: "both"; iterations: number; direction: "normal" | "alternate"; }

/** Mapeo directo a las opciones de `element.animate(keyframes, options)`. */
export function opcionesWAAPI(a: Animacion): OpcionesWAAPI {
  return { duration: a.duracionMs, easing: a.curva, delay: a.retardoMs, fill: "both", iterations: a.iteraciones, direction: a.alternar ? "alternate" : "normal" };
}

/* — Entrada cardinal: desde el perímetro hacia el punto de la Trinity (720 ms · glide) — */
const ORIGEN_CARDINAL: Record<PuntoTrinity, string> = { zenith: "translateY(-24px) scale(0.98)", horizonte: "translateX(-24px) scale(0.98)", logica: "translateX(24px) scale(0.98)", anchor: "translateY(24px) scale(0.98)" };

/** Entrada cardinal: el panel entra desde su borde de la Trinity al centro. */
export function entradaCardinal(punto: PuntoTrinity): Animacion {
  return anim([{ transform: ORIGEN_CARDINAL[punto], opacity: 0 }, { transform: "none", opacity: 1 }], DURACION_ADN.escena, CURVAS_ADN.glide);
}

/** Fundido con desenfoque (600 ms · orgánico): el panel nace de la niebla y se hace nítido. */
export function fundidoDesenfoque(): Animacion {
  return anim([{ filter: "blur(8px)", opacity: 0 }, { filter: "blur(0)", opacity: 1 }], DURACION_ADN.escenaMinima, CURVAS_ADN.organico);
}

/** Elemento compartido: la tarjeta crece hacia su destino (ida y vuelta, glide · 640 ms). */
export function elementoCompartido(): Animacion {
  return anim([{ transform: "scale(1)" }, { transform: "scale(2.6, 3.2)" }], 640, CURVAS_ADN.glide, { iteraciones: 2, alternar: true });
}

/** Barrido de horizonte, la jugada rara: la línea cruza (1:2) y la escena se desenrolla tras ella. */
export function barridoHorizonte(): { linea: Animacion; escena: Animacion } {
  return {
    linea: anim([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], 700, CURVAS_ADN.glide),
    escena: anim([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], 700, CURVAS_ADN.glide, { retardoMs: 300 }),
  };
}

/** Respiración del símbolo: escala 1 → 1.03, orgánica, un ciclo cada 4–6 s. */
export function respiracion(): Animacion {
  return anim([{ transform: "scale(1)" }, { transform: "scale(1.03)" }], 5000, CURVAS_ADN.organico, { iteraciones: Number.POSITIVE_INFINITY, alternar: true });
}

/** Cristalización: los nodos del enjambre se ordenan en retícula, como la sílice que se vuelve cristal. */
export function cristalizacion(nodos: number): Animacion[] {
  return Array.from({ length: Math.max(0, nodos) }, (_, i) =>
    anim(
      [
        { transform: `translate(${((i * 5) % 10) - 5}px, ${((i * 11) % 8) - 4}px) rotate(${(i % 2 ? 1 : -1) * (3 + (i % 5))}deg) scale(0.72)`, opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      800, CURVAS_ADN.organico, { retardoMs: Math.min(i * 60, 300) },
    ),
  );
}

/** Alquimia: el elemento lleva su oro de lógica (`var(--ss-logica)`) y el filtro lo revela: gris → ichor. */
export function alquimia(): Animacion {
  return anim(
    [
      { filter: "grayscale(1) brightness(0.92)", opacity: 1 },
      { filter: "grayscale(0.35) brightness(1.1)", opacity: 1, offset: 0.7 },
      { opacity: 1 },
    ],
    DURACION_ADN.interfazNormal, CURVAS_ADN.genesis,
  );
}

/** Siembra del símbolo (núcleo de `siembra.html`, 2,4 s, todo centrado): punto → vesica → ojo → diamante → título → respiración. */
export function siembra() {
  return {
    punto: anim([{ transform: "scale(0)", opacity: 1 }, { transform: "scale(1.4)", offset: 0.6, opacity: 1 }, { transform: "scale(1)", opacity: 0 }], 400, CURVAS_ADN.organico),
    circuloIzq: anim([{ transform: "translateX(40px) scale(0.2)", opacity: 0 }, { transform: "none", opacity: 1 }], 700, CURVAS_ADN.glide, { retardoMs: 350 }),
    circuloDer: anim([{ transform: "translateX(-40px) scale(0.2)", opacity: 0 }, { transform: "none", opacity: 1 }], 700, CURVAS_ADN.glide, { retardoMs: 350 }),
    ojo: anim([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], 500, CURVAS_ADN.organico, { retardoMs: 1050 }),
    pupila: anim([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], 400, CURVAS_ADN.organico, { retardoMs: 1250 }),
    diamante: anim([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], 800, CURVAS_ADN.glide, { retardoMs: 1500 }),
    titulo: anim([{ transform: "translateY(12px)", opacity: 0 }, { transform: "none", opacity: 1 }], 600, CURVAS_ADN.organico, { retardoMs: 2000 }),
    respira: respiracion(),
  };
}
