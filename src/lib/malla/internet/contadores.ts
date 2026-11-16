// Contadores de bytes por día y por mes, por audiencia
import { Audiencia } from './tipos';

export interface Contadores {
  dia: string; // AAAA-MM-DD
  mes: string; // AAAA-MM
  bytesDia: Record<Audiencia, number>;
  bytesMes: Record<Audiencia, number>;
}

export const MB = 1_000_000;

export function contadoresVacios(ahora: number, desfaseMin: number): Contadores {
  const d = new Date(ahora + desfaseMin * 60000);
  return {
    dia: d.toISOString().split('T')[0],
    mes: d.toISOString().substring(0, 7),
    bytesDia: { 'mi-cuenta': 0, entidad: 0, publico: 0 },
    bytesMes: { 'mi-cuenta': 0, entidad: 0, publico: 0 },
  };
}

export function diaLocal(ahora: number, desfaseMin: number): string {
  return new Date(ahora + desfaseMin * 60000).toISOString().split('T')[0];
}

export function sumarBytes(c: Contadores, audiencia: Audiencia, bytes: number, ahora: number, desfaseMin: number): Contadores {
  if (isNaN(bytes) || bytes < 0 || !isFinite(bytes)) return c;
  
  const d = new Date(ahora + desfaseMin * 60000);
  const diaActual = d.toISOString().split('T')[0];
  const mesActual = d.toISOString().substring(0, 7);
  
  const nuevoC = { ...c, bytesDia: { ...c.bytesDia }, bytesMes: { ...c.bytesMes } };
  
  if (nuevoC.dia !== diaActual) {
    nuevoC.dia = diaActual;
    nuevoC.bytesDia = { 'mi-cuenta': 0, entidad: 0, publico: 0 };
  }
  if (nuevoC.mes !== mesActual) {
    nuevoC.mes = mesActual;
    nuevoC.bytesMes = { 'mi-cuenta': 0, entidad: 0, publico: 0 };
  }
  
  nuevoC.bytesDia[audiencia] += bytes;
  nuevoC.bytesMes[audiencia] += bytes;
  
  return nuevoC;
}

export function usadoHoyMb(c: Contadores, audiencia: Audiencia | 'otros', ahora: number, desfaseMin: number): number {
  const diaActual = diaLocal(ahora, desfaseMin);
  if (c.dia !== diaActual) return 0;
  
  if (audiencia === 'otros') {
    return (c.bytesDia['entidad'] + c.bytesDia['publico']) / MB;
  }
  return c.bytesDia[audiencia] / MB;
}
