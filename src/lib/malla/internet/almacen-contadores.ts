/**
 * Modulo puro: almacenamiento local de contadores de bytes.
 * No importa red, ni sincronizacion, ni procesos lanzados.
 * El almacen (localStorage, almacen persistente) se inyecta como dependencia.
 */

import type { Contadores, Audiencia } from './contadores';
import { sumarBytes, contadoresVacios, diaLocal, mesLocal, usadoHoyMb as usadoHoyMbDeContadores } from './contadores';
import { cupoBanco, type ResultadoCupoBanco } from './cupo-banco';
import type { AjustesBanco } from './tipos';

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

/* ───────── Modo banco: cuenta por audiencia y raciona ───────── */

/** Los ámbitos de la puerta (`Ambito`) traducidos a las audiencias del contrato §8.2. */
export type AmbitoContador = 'mias' | 'grupo' | 'otras' | 'publica';

export function audienciaDeAmbito(ambito: AmbitoContador): Audiencia {
  if (ambito === 'mias') return 'mi-cuenta';
  if (ambito === 'grupo') return 'entidad';
  return 'publico';
}

export interface ContadorBanco {
  /** Suma bytes al contador de ese ámbito (con `registrarBytes`) y devuelve lo acumulado. */
  contar(ambito: AmbitoContador, bytes: number): Contadores;
  /** MB usados hoy por ese ámbito. */
  usadoHoyMb(ambito: AmbitoContador): number;
  /** ¿La ración del día permite seguir sirviendo a ese ámbito? «mias» nunca se raciona. */
  revisar(ambito: AmbitoContador): ResultadoCupoBanco;
}

const SIN_RACION: ResultadoCupoBanco = {
  aplica: false,
  permitido: true,
  restanteMb: Infinity,
  motivo: 'las neuronas de mi cuenta no se racionan',
};

/**
 * Cuenta y raciona el modo banco. El almacén, el reloj y los ajustes del banco se inyectan para
 * que el módulo siga siendo puro y se pueda probar sin disco.
 */
export function crearContadorBanco(
  almacen: AlmacenContadores,
  ajustesBanco: () => AjustesBanco,
  ahora: () => number,
  desfaseMin: () => number
): ContadorBanco {
  let cache: Contadores | null = null;

  const vigentes = (): Contadores => {
    const t = ahora();
    const d = desfaseMin();
    if (cache && cache.dia === diaLocal(t, d) && cache.mes === mesLocal(t, d)) return cache;
    cache = leerContadores(almacen, t, d);
    return cache;
  };

  return {
    contar(ambito, bytes) {
      cache = registrarBytes(almacen, audienciaDeAmbito(ambito), bytes, ahora(), desfaseMin());
      return cache;
    },
    usadoHoyMb(ambito) {
      const t = ahora();
      const d = desfaseMin();
      return usadoHoyMbDeContadores(vigentes(), audienciaDeAmbito(ambito), t, d);
    },
    revisar(ambito) {
      if (ambito === 'mias') return { ...SIN_RACION };
      const t = ahora();
      const d = desfaseMin();
      const usados = usadoHoyMbDeContadores(vigentes(), 'otros', t, d);
      return cupoBanco(ajustesBanco(), usados, new Date(t), d);
    },
  };
}
