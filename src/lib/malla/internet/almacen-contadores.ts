// Módulo puro: no importa red, ni sincronización, ni procesos lanzados
// Solo almacén inyectado (localStorage-like) y manipulación de contadores de bytes
import { contadoresVacios, sumarBytes, diaLocal, mesLocal, type Contadores } from './contadores';
import type { Audiencia } from './tipos';

const CLAVE = 'starseed.malla.internet.contadores.v1';

export type { Contadores };

export interface AlmacenContadores {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

export { contadoresVacios, diaLocal, mesLocal };

export function leerContadores(
  almacen: AlmacenContadores,
  ahora: number,
  desfaseMin: number
): Contadores {
  try {
    const crudo = almacen.getItem(CLAVE);
    if (crudo === null) return contadoresVacios(ahora, desfaseMin);
    const parseado = JSON.parse(crudo);
    const hoy = diaLocal(ahora, desfaseMin);
    const mes = mesLocal(ahora, desfaseMin);
    if (!parseado.dia || !parseado.mes || !parseado.bytesDia || !parseado.bytesMes) {
      return contadoresVacios(ahora, desfaseMin);
    }
    if (parseado.dia !== hoy || parseado.mes !== mes) {
      const base = contadoresVacios(ahora, desfaseMin);
      if (parseado.mes === mes) {
        base.bytesMes = { ...parseado.bytesMes };
      }
      return base;
    }
    return {
      dia: parseado.dia,
      mes: parseado.mes,
      bytesDia: parseado.bytesDia,
      bytesMes: parseado.bytesMes,
    };
  } catch {
    return contadoresVacios(ahora, desfaseMin);
  }
}

export function registrarBytes(
  almacen: AlmacenContadores,
  auditoria: Audiencia | 'otros',
  bytes: number,
  ahora: number,
  desfaseMin: number
): Contadores {
  let actual: Contadores;
  try {
    const crudo = almacen.getItem(CLAVE);
    if (crudo !== null) {
      const parseado = JSON.parse(crudo);
      actual = {
        dia: parseado.dia,
        mes: parseado.mes,
        bytesDia: parseado.bytesDia || { 'mi-cuenta': 0, entidad: 0, publico: 0 },
        bytesMes: parseado.bytesMes || { 'mi-cuenta': 0, entidad: 0, publico: 0 },
      };
    } else {
      actual = contadoresVacios(ahora, desfaseMin);
    }
  } catch {
    actual = contadoresVacios(ahora, desfaseMin);
  }

  const resultado = sumarBytes(actual, auditoria, bytes, ahora, desfaseMin);

  try {
    almacen.setItem(CLAVE, JSON.stringify(resultado));
  } catch {
  }

  return resultado;
}