/**
 * Carga de StarSeed · la FLOR DE LA VIDA del respaldo (lógica PURA: sin React, sin three.js, sin `node:*`).
 *
 * La pantalla «Abriendo StarSeed…» pinta primero y siempre este respaldo en SVG —halo y flor de la vida de 19
 * círculos— y deja el 3D (esfera de puntos y cubo de Metatrón) para encima cuando llega. Aquí se decide su
 * geometría y sus colores con los datos de la marca, para que se puedan medir sin navegador:
 *   · el mismo reparto de círculos que dibuja el motor de la orbe (`centrosFlorDeLaVida`);
 *   · la envolvente mide 0,95·φ de los 1,69 que ve la cámara: ≈ 91 % del radio de la escena;
 *   · cada círculo toma el color de la Trinidad del lado en que cae, con las posiciones de la identidad:
 *     arriba Zenith (azur), derecha Logic (ámbar), abajo Anchor (carmesí), izquierda Horizon (esmeralda).
 */
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";
import { centrosFlorDeLaVida, PHI } from "@/lib/protomolecula/orbe4d/geometria";

/** Radio de la escena en las unidades del SVG (`viewBox="-50 -50 100 100"`). */
export const RADIO_ESCENA = 50;
/** Lo que ve la cámara del motor desde el centro hasta el borde del lienzo (unidades de la escena 3D). */
const MEDIO_LIENZO_3D = 1.69;
/** Lado de la identidad de cada color: la paleta Trinity va [Zenith, Horizon, Logic, Anchor]. */
const [ZENITH, HORIZON, LOGIC, ANCHOR] = PALETAS.trinity.colores;

export interface CirculoFlor {
  x: number;
  y: number;
  r: number;
  color: string;
}

/** Radio de cada uno de los 19 círculos: la envolvente (3r) llega al 91 % del radio de la escena. */
export function radioCirculo(): number {
  return (RADIO_ESCENA * ((PHI * 0.95) / MEDIO_LIENZO_3D)) / 3;
}

/**
 * Color del círculo cuyo centro está en (`x`, `y`) con el eje y del SVG (crece hacia abajo): el del cuadrante
 * en que cae. El central, en el brillo de la marca (nieve).
 */
export function colorDeLado(x: number, y: number): string {
  if (Math.hypot(x, y) < 1e-6) return PALETAS.trinity.brillo;
  // Ángulo desde ARRIBA en el sentido de las agujas del reloj, 0..1: arriba 0, derecha 0,25, abajo 0,5, izquierda 0,75.
  const u = (Math.atan2(x, -y) / (Math.PI * 2) + 1) % 1;
  const cuadrante = Math.floor(((u + 0.125) % 1) * 4);
  return [ZENITH, LOGIC, ANCHOR, HORIZON][cuadrante];
}

/** Los 19 círculos de la flor de la vida, con su centro, su radio y su color. */
export function circulosDeLaFlor(): CirculoFlor[] {
  const r = radioCirculo();
  return centrosFlorDeLaVida(2, r).map(([x, y]) => ({ x, y, r, color: colorDeLado(x, y) }));
}
