/**
 * mundo-constantes.ts — Números compartidos entre la física del mundo y su
 * dibujado (2D y 3D). Un solo sitio para que ambos caminos de render nunca
 * diverjan sobre qué significa "cerca" o "grande".
 *
 * PORQUÉ ESTOS PESOS
 * El motor de fuerzas (`hermes-integration/05-force-graph-engine.ts`) no
 * distingue tipos de arista: todo es un muelle de Hooke con un peso. Para que
 * "pertenecer a una comunidad" y "vivir en un espacio" tiren con menos fuerza
 * que un vínculo personal directo (que puede llegar a `fuerza=1`), sus pesos
 * están deliberadamente por debajo del máximo de un vínculo:
 *   vínculo   → vinculo.fuerza tal cual (0..1, lo que decidió quien lo creó)
 *   comunidad → 0.40  (tira más que un espacio: es pertenencia social real)
 *   espacio   → 0.22  (la agrupación más ancha y menos íntima)
 * Así la cercanía en el mundo cuenta una historia con capas: el vínculo
 * decide la posición exacta, la comunidad decide el barrio, el espacio
 * decide la región.
 */

/** Peso de la arista sintética ser→comunidad (pertenencia). */
export const PESO_ARISTA_COMUNIDAD = 0.4;

/** Peso de la arista sintética ser→espacio (habitar un lugar). */
export const PESO_ARISTA_ESPACIO = 0.22;

/**
 * Pasos de física por defecto antes de leer el resultado. El motor marca
 * `stabilised` a partir de la iteración 100 cuando la velocidad media cae por
 * debajo de 0.1; 400 deja margen de sobra incluso con las decenas de nodos
 * (seres + hubs de comunidad/espacio) que maneja este mundo, y sigue siendo
 * submilisegundos en JS (ver mundo-layout.test.ts).
 */
export const ITERACIONES_DISPOSICION_DEFECTO = 400;

/**
 * Radio base de la espiral áurea usada para las posiciones iniciales
 * (`posicionInicialDeterminista` en mundo-layout.ts). Con 60 seres el radio
 * máximo de la espiral queda ~140 unidades — cómodamente por debajo de
 * `connectionDistance` (300, valor por defecto del motor) para que ninguna
 * arista nazca ya "fuera de rango" y quede sin tirar nunca.
 */
export const RADIO_ESPIRAL_INICIAL = 18;

/** Variación inicial en altura (eje Y) — pequeña a propósito: un mundo con
 * capas, no una nube caótica. La física es libre de moverlos en Y de todos
 * modos; esto solo evita que arranquen todos a la misma altura exacta. */
export const ALTURA_INICIAL = 6;

/**
 * Física ↔ presentación. El motor está calibrado (en sus valores por
 * defecto) para radios del orden de cientos de unidades — así que la física
 * corre en esa escala "nativa" sin retocar sus constantes (reutilizar el
 * motor tal cual, no reinventar su ajuste), y solo AQUÍ se reduce el
 * resultado a un tamaño de escena cómodo para una cámara three.js. Cambiar
 * esta escala nunca cambia quién queda cerca de quién — solo el zoom.
 */
export const ESCALA_MUNDO_XZ = 1 / 18;

/** Y se comprime algo más que X/Z: un lugar por el que caminar, no una nube
 * 3D caótica — pero sigue siendo la física real, solo aplanada al dibujar. */
export const ESCALA_MUNDO_Y = ESCALA_MUNDO_XZ * 0.5;

/** Relleno visual entre el límite de una región (comunidad/espacio) y el
 * miembro más externo, para que el borde no atraviese el avatar. */
export const RELLENO_REGION = 1.4;

/** Radio mínimo de una región sin miembros — visible igualmente, no un punto. */
export const RADIO_REGION_VACIA = 1.6;

/** Convierte una posición física (unidades nativas del motor) a unidades de
 * escena (three.js / SVG). Pura: mismos números de entrada, mismos de salida. */
export function aPosicionEscena(pos: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}): readonly [number, number, number] {
  return [pos.x * ESCALA_MUNDO_XZ, pos.y * ESCALA_MUNDO_Y, pos.z * ESCALA_MUNDO_XZ];
}

/** Igual que `aPosicionEscena` pero solo para una magnitud (radio, distancia)
 * — no tiene componente Y que aplanar, así que usa la escala XZ. */
export function aEscalaEscena(magnitud: number): number {
  return magnitud * ESCALA_MUNDO_XZ;
}
