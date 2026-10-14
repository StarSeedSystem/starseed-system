// Malla cristalina SiO₂ amorfa: teselas y fusión (CRDT)
// Funciones puras, sin node:* ni Supabase

import type { NeuronaReticula, SenalMedida, Tesela, Reticula } from "./tipos";

/**
 * Crea una tesela a partir de una neurona, sus señales y un reloj de Lamport.
 * @param neurona - La neurona que genera la tesela
 * @param senales - Las señales medidas por la neurona
 * @param reloj - El reloj de Lamport (debe ser mayor que el anterior)
 * @returns Una nueva tesela
 */
export function crearTesela(
  neurona: NeuronaReticula,
  senales: SenalMedida[],
  reloj: number
): Tesela {
  // TODO: Implementar
  return {
    origen: neurona.id,
    reloj,
    neurona,
    senales,
  };
}

/**
 * Fusiona una tesela en una retícula, siguiendo las reglas de CRDT:
 * - Por origen manda la tesela con mayor reloj.
 * - En caso de empate en reloj, gana la que tenga JSON.stringify canónico menor.
 * - Nunca muta la entrada; devuelve una nueva retícula.
 * @param r - La retícula actual
 * @param t - La tesela a fusionar
 * @returns Una nueva retícula con la tesela fusionada
 */
export function fusionarTesela(r: Reticula, t: Tesela): Reticula {
  // TODO: Implementar
  return r;
}

/**
 * Fusiona un array de teselas en una retícula vacía.
 * El orden de fusión no afecta al resultado (CRDT).
 * @param teselas - Array de teselas a fusionar
 * @returns La retícula resultante
 */
export function fusionarTodas(teselas: Tesela[]): Reticula {
  // TODO: Implementar
  return { teselas: {} };
}

/**
 * Elimina de la retícula las teselas cuyas señales más antiguas (vistaEn mínima)
 * sean más viejas que el tiempo actual menos ttlMs.
 * Nota: El contrato dice: "cadenar(r, ahora, ttlMs) quita teselas cuyas señales más nuevas (`vistaEn`) sean más viejas que ttl"
 * Pero parece un error: debería ser las señales más antiguas? Vamos a interpretar como:
 *   Se elimina una tesela si para TODAS sus señales, vistaEn < (ahora - ttlMs)
 *   Es decir, si la señal más reciente (máxima vistaEn) es todavía más vieja que el umbral, entonces la tesela está completamente caducada.
 *   Sin embargo, el contrato dice: "señales más nuevas (vistaEn)" y "más viejas que ttl". 
 *   Vamos a seguir exactamente lo que dice: eliminar teselas donde la señal más nueva (máxima vistaEn) es más vieja que (ahora - ttlMs).
 *   Eso significa que si incluso la señal más reciente es antigua, entonces toda la tesela es antigua.
 *   Pero eso parece demasiado estricto. Vamos a revisar el contrato original en la tarea:
 *   "caducar(r, ahora, ttlMs) quita teselas cuyas señales más nuevas (`vistaEn`) sean más viejas que ttl"
 *   Así que usaremos: max(vistaEn de las señales) < (ahora - ttlMs)
 * @param r - La retícula
 * @param ahora - Tiempo actual en milisegundos
 * @param ttlMs - Tiempo de vida en milisegundos
 * @returns Una nueva retícula sin las teselas caducadas
 */
export function caducar(r: Reticula, ahora: number, ttlMs: number): Reticula {
  // TODO: Implementar
  return r;
}

/**
 * Obtiene las señales de la retícula, combinando por claveSenal (de MC1012A).
 * Para cada claveSenal, se queda con la medida PEOR de las dos puntas:
 *   - rssiDbm: menor (peor)
 *   - snrDb: menor (peor)
 *   - rttMs: mayor (peor)
 *   - perdidaPct: mayor (peor)
 *   - anchoBandaKbps: menor (peor)
 *   - vistaEn: el mayor entre las dos puntas (la más reciente)
 * Si solo existe una punta, se usa esa medida.
 * @param r - La retícula
 * @returns Array de señales medidas combinadas
 */
export function senalesDeReticula(r: Reticula): SenalMedida[] {
  // TODO: Implementar
  return [];
}

/**
 * Calcula la huella de la retícula como FNV-1a de 64 bits en hex (BigInt)
 * sobre JSON canónico:
 *   - Claves ordenadas a cualquier profundidad
 *   - Teselas ordenadas por origen
 *   - SIN el campo `firma` de cada tesela
 * @param r - La retícula
 * @returns Huella como string hexadecimal (16 caracteres para 64 bits)
 */
export function huellaReticula(r: Reticula): string {
  // TODO: Implementar
  return "";
}