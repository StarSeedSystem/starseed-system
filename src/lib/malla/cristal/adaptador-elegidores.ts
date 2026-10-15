// Malla cristalina SiO₂: adaptador de elegidores por política de transporte.
// Módulo puro: sin node:*, sin Supabase, sin `window` — corre en navegador y en pruebas.

import { politicaDeTransporte, PoliticaTransporte } from './cifrado/politica';
import type { Medio, ClaseDato } from '../tipos';

/** Veta un enlace según la política de transporte para una clase y medio dados. */
export function vetoPorPolitica(clase: ClaseDato, medio: Medio): boolean {
  return !politicaDeTransporte(clase, medio).permitido;
}

/** Ordena un array de elementos por viabilidad (puntuación) de forma estable. */
export function ordenarPorViabilidad<E extends { id: string; medio?: string }>(
  enlaces: E[],
  puntuar: (e: E) => number
): E[] {
  // Create a copy to avoid mutating the original array
  const copia = [...enlaces];
  // Perform stable sort: if puntuaciones are equal, maintain original order
  copia.sort((a, b) => {
    const puntuacionA = puntuar(a);
    const puntuacionB = puntuar(b);
    if (puntuacionA !== puntuacionB) {
      return puntuacionA - puntuacionB; // ascending order
    }
    // If equal, maintain original position (stable sort)
    return enlaces.indexOf(a) - enlaces.indexOf(b);
  });
  return copia;
}