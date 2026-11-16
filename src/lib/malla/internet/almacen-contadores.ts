/**
 * Modulo puro: almacenamiento local de contadores de bytes.
 * No importa red, ni sincronizacion, ni procesos lanzados.
 * El almacen (localStorage, almacen persistente) se inyecta como dependencia.
 */

import type { Contadores, Audiencia } from './contadores';
import { sumarBytes, contadoresVacios, diaLocal, mesLocal } from './contadores';

export const CLAVE_CONTADORES = 'starseed.malla.internet.contadores.v1';

export interface AlmacenContadores {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

function esContadoresValido(c: unknown): c is Contadores {
  if (typeof c !== 'object' || c === null) return false;
  const obj = c as Record<string, unknown>;
  if (typeof obj.dia !== 'string' || typeof obj.mes !== 'string') return false;
  if (typeof obj.bytesDia !== 'object' || obj.bytesDia === null) return false;
  if (typeof obj.bytesMes !== 'object' || obj.bytesMes === null) return false;
  return true;
}

export function leerContadores(
  almacen: AlmacenContadores,
  ahora: number,
  desfaseMin: number
): Contadores {
  try {
    const crudo = almacen.getItem(CLAVE_CONTADORES);
    if (crudo === null) return contadoresVacios(ahora, desfaseMin);
    const parseado = JSON.parse(crudo);
    if (!esContadoresValido(parseado)) return contadoresVacios(ahora, desfaseMin);

    const diaHoy = diaLocal(ahora, desfaseMin);
    const mesHoy = mesLocal(ahora, desfaseMin);

    if (parseado.dia !== diaHoy) {
      if (parseado.mes === mesHoy) {
        return {
          dia: diaHoy,
          mes: mesHoy,
          bytesDia: { 'mi-cuenta': 0, entidad: 0, publico: 0 },
          bytesMes: { ...parseado.bytesMes },
        };
      }
      return contadoresVacios(ahora, desfaseMin);
    }

    return parseado;
  } catch {
    return contadoresVacios(ahora, desfaseMin);
  }
}

export function registrarBytes(
  almacen: AlmacenContadores,
  audiencia: Audiencia | 'otros',
  bytes: number,
  ahora: number,
  desfaseMin: number
): Contadores {
  const contadores = leerContadores(almacen, ahora, desfaseMin);
  const actualizados = sumarBytes(contadores, audiencia, bytes, ahora, desfaseMin);

  try {
    almacen.setItem(CLAVE_CONTADORES, JSON.stringify(actualizados));
  } catch {
    // Si falla el almacen, devolvemos igualmente los contadores calculados
  }

  return actualizados;
}
