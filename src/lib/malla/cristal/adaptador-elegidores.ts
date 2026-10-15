// Malla cristalina SiO₂: adaptador para elegidores de vía.
// Módulo PURO: sin node:*, sin Supabase, sin window — corre en navegador y en pruebas.

import { politicaDeTransporte } from './cifrado/politica';
import type { Medio, ClaseDato } from './tipos';

/**
 * Determina si un enlace debe ser vetado por la política de transporte
 * para una clase de dato y medio específicos.
 * @param clase - Clase del dato ('interno', 'privado', 'publico')
 * @param medio - Medio de transmisión ('lora', 'ble', 'wifi-lan', etc.)
 * @returns true si el enlace debe ser vetado (no está permitido), false en caso contrario
 */
export function vetoPorPolitica(clase: ClaseDato, medio: Medio): boolean {
  // Usamos politicaDeTransporte con 0 bytes para determinar si está permitido
  // La política solo tiene una restricción de tamaño para NFC y dato público
  const politica = politicaDeTransporte(clase, medio, 0);
  return !politica.permitido;
}

/**
 * Ordena un array de elementos por viabilidad de forma estable.
 * @param enlaces - Array de elementos que tienen al menos una propiedad 'id'
 * @param puntuar - Función que devuelve un número para puntuar cada elemento
 * @returns Nuevo array ordenado de forma estable (mantiene el orden relativo de elementos con igual puntuación)
 */
export function ordenarPorViabilidad<E extends { id: string; medio?: string }>(
  enlaces: E[],
  puntuar: (e: E) => number
): E[] {
  // Creamos una copia para no modificar el original
  const copia = [...enlaces];
  // Ordenamos de forma estable usando el puntaje y luego el id como desempate
  copia.sort((a, b) => {
    const puntajeA = puntuar(a);
    const puntajeB = puntuar(b);
    if (puntajeA !== puntajeB) {
      return puntajeA - puntajeB; // Orden ascendente por puntaje
    }
    // Desempate estable por id (orden lexicográfico)
    return a.id.localeCompare(b.id);
  });
  return copia;
}