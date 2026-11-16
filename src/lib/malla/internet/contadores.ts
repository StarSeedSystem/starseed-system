import type { Audiencia } from './tipos';

export const MB = 1_000_000;
export type { Audiencia } from './tipos';

export interface Contadores {
  dia: string;
  mes: string;
  bytesDia: Record<Audiencia, number>;
  bytesMes: Record<Audiencia, number>;
}

function dosDigitos(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function diaLocal(ahora: number, desfaseMin: number): string {
  const d = new Date(ahora + desfaseMin * 60_000);
  return `${d.getUTCFullYear()}-${dosDigitos(d.getUTCMonth() + 1)}-${dosDigitos(d.getUTCDate())}`;
}

function mesLocal(ahora: number, desfaseMin: number): string {
  const d = new Date(ahora + desfaseMin * 60_000);
  return `${d.getUTCFullYear()}-${dosDigitos(d.getUTCMonth() + 1)}`;
}

function bytesValidos(bytes: number): boolean {
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0;
}

export function contadoresVacios(ahora: number, desfaseMin: number): Contadores {
  return {
    dia: diaLocal(ahora, desfaseMin),
    mes: mesLocal(ahora, desfaseMin),
    bytesDia: { 'mi-cuenta': 0, entidad: 0, publico: 0 },
    bytesMes: { 'mi-cuenta': 0, entidad: 0, publico: 0 },
  };
}

export function sumarBytes(
  c: Contadores,
  audiencia: Audiencia,
  bytes: number,
  ahora: number,
  desfaseMin: number
): Contadores {
  if (!bytesValidos(bytes)) {
    return c;
  }

  const diaNuevo = diaLocal(ahora, desfaseMin);
  const mesNuevo = mesLocal(ahora, desfaseMin);

  const diaCambio = diaNuevo !== c.dia;
  const mesCambio = mesNuevo !== c.mes;

  const bytesDiaBase = diaCambio
    ? { 'mi-cuenta': 0, entidad: 0, publico: 0 }
    : { ...c.bytesDia };

  const bytesMesBase = mesCambio
    ? { 'mi-cuenta': 0, entidad: 0, publico: 0 }
    : { ...c.bytesMes };

  const bytesDia = { ...bytesDiaBase, [audiencia]: bytesDiaBase[audiencia] + bytes };
  const bytesMes = { ...bytesMesBase, [audiencia]: bytesMesBase[audiencia] + bytes };

  return {
    dia: diaNuevo,
    mes: mesNuevo,
    bytesDia,
    bytesMes,
  };
}

export function usadoHoyMb(
  c: Contadores,
  audiencia: Audiencia | 'otros',
  ahora: number,
  desfaseMin: number
): number {
  const hoy = diaLocal(ahora, desfaseMin);
  if (c.dia !== hoy) {
    return 0;
  }

  if (audiencia === 'otros') {
    const entidadMb = Math.floor(c.bytesDia.entidad / MB);
    const publicoMb = Math.floor(c.bytesDia.publico / MB);
    return entidadMb + publicoMb;
  }

  return Math.floor(c.bytesDia[audiencia] / MB);
}