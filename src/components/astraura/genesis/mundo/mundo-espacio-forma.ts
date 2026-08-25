/**
 * mundo-espacio-forma.ts — "Espacios como lugares con su geometría derivada
 * de su semilla" (requisito explícito del encargo). `Espacio.semilla` es lo
 * único del contrato pensado exactamente para esto: un número determinista
 * del que sale la forma del lugar, no solo su posición.
 *
 * Por eso un espacio NO se dibuja como un círculo perfecto (eso sería
 * ignorar la semilla y usar solo el radio calculado por la física) sino
 * como un polígono cerrado e irregular — una "parcela" propia — cuyo
 * contorno varía por vértice según la semilla. El mismo espacio siempre
 * tiene la misma parcela; dos espacios con semillas distintas casi nunca
 * coinciden. `Comunidad` NO tiene semilla en el contrato — a propósito no
 * se le inventa una aquí: una comunidad es agrupación social, no un lugar
 * con forma propia, y su límite (ver mundo-layout.ts) se queda como un
 * círculo simple. Esa diferencia de dibujo es el punto: comunica que son
 * dos tipos de cosa distintos, no dos variantes de lo mismo.
 */

import { fnv1a32 } from "@/lib/astraura/genesis-dna";

/** Vértices del contorno — bastantes para leerse como "un lugar con
 * carácter", pocos para seguir siendo barato de dibujar en decenas de
 * espacios a la vez. */
const VERTICES_CONTORNO = 14;

/** Cuánto puede variar el radio en un vértice, alrededor de 1 (±28%). */
const VARIACION_MINIMA = 0.72;
const VARIACION_RANGO = 0.56;

function pseudoAleatorio(clave: string): number {
  return fnv1a32(clave) / 4294967296;
}

/**
 * Contorno cerrado y determinista de un espacio, centrado en el origen:
 * un anillo de `VERTICES_CONTORNO` puntos [x, z] cuyo radio real en cada
 * vértice es `radio * variación(semilla, vértice)`. Pura — mismo semilla y
 * radio, mismo contorno, siempre.
 */
export function contornoEspacio(semilla: number, radio: number): ReadonlyArray<readonly [number, number]> {
  const puntos: Array<readonly [number, number]> = [];
  for (let i = 0; i < VERTICES_CONTORNO; i++) {
    const angulo = (i / VERTICES_CONTORNO) * Math.PI * 2;
    const variacion = VARIACION_MINIMA + pseudoAleatorio(`espacio#${semilla}#${i}`) * VARIACION_RANGO;
    const r = Math.max(0, radio) * variacion;
    puntos.push([Math.cos(angulo) * r, Math.sin(angulo) * r]);
  }
  return puntos;
}
