/**
 * Modulo puro: almacenamiento local de contadores de bytes.
 * No importa red, ni sincronizacion, ni procesos lanzados.
 * El almacen (localStorage, almacen persistente) se inyecta como dependencia.
 */

import type { Contadores, Audiencia } from './contadores';
import { sumarBytes, contadoresVacios, diaLocal, mesLocal } from './contadores';

export const CLAVE_CONTADORES = 'starseed.malla.internet.contadores.v1';

export const AUDIENCIAS: Audiencia[] = ['mi-cuenta', 'entidad', 'publico'];

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
  const bytesDiaObj = obj.bytesDia as Record<string, unknown>;
  const bytesMesObj = obj.bytesMes as Record<string, unknown>;
  for (const a of AUDIENCIAS) {
    if (typeof bytesDiaObj[a] !== 'number') return false;
    if (typeof bytesMesObj[a] !== 'number') return false;
  }
  return true;
}

function crearBytesVacios(): Record<Audiencia, number> {
  const result: Record<Audiencia, number> = { 'mi-cuenta': 0, entidad: 0, publico: 0 };
  return result;
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
          bytesDia: crearBytesVacios(),
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

export function contadoresConValor(
  c: Contadores,
  audiencia: Audiencia,
  bytes: number
): Contadores {
  const ahora = Date.now();
  const desfaseMin = -new Date().getTimezoneOffset();
  return {
    ...c,
    bytesDia: { ...c.bytesDia, [audiencia]: bytes },
    bytesMes: { ...c.bytesMes, [audiencia]: bytes },
  };
}

const MB = 1_000_000;

const audienciaOtros = ['entidad', 'publico'] as const;

export function puedePasarConBanco(
  contadores: Contadores,
  ahora: number,
  desfaseMin: number,
  racionMb: number,
  bytesARegistrar: number
): { permitido: true; hastaMb: number } | { permitido: false; usadoMb: number; racionMb: number } {
  const usadoHoyParaOtros = (c: Contadores): number => {
    const hoy = diaLocal(ahora, desfaseMin);
    if (c.dia !== hoy) return 0;
    const totalBytes = audienciaOtros.reduce((sum, a) => sum + c.bytesDia[a], 0);
    return totalBytes / MB;
  };

  const usadoActual = usadoHoyParaOtros(contadores);
  const despuesDeRegistrar = (usadoActual + bytesARegistrar / MB);

  if (despuesDeRegistrar > racionMb) {
    return { permitido: false, usadoMb: usadoActual, racionMb };
  }

  const hastaMb = racionMb - usadoActual;
  return { permitido: true, hastaMb };
}
