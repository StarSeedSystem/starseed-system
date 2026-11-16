import { Audiencia } from './tipos';

export type { Audiencia } from './tipos';

export const MB = 1_000_000;

export interface Contadores {
  dia: string;
  mes: string;
  bytesDia: Record<Audiencia, number>;
  bytesMes: Record<Audiencia, number>;
}

export function diaLocal(ahora: number, desfaseMin: number): string {
  const fecha = new Date(ahora + desfaseMin * 60000);
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const día = String(fecha.getDate()).padStart(2, '0');
  return `${año}-${mes}-${día}`;
}

export function mesLocal(ahora: number, desfaseMin: number): string {
  const fecha = new Date(ahora + desfaseMin * 60000);
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${año}-${mes}`;
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
  audiencia: Audiencia | 'otros',
  bytes: number,
  ahora: number,
  desfaseMin: number
): Contadores {
  const esInvalido = isNaN(bytes) || !isFinite(bytes) || bytes < 0;
  if (esInvalido) return { ...c };

  const nuevoDia = diaLocal(ahora, desfaseMin);
  const nuevoMes = mesLocal(ahora, desfaseMin);

  const audiencias: Audiencia[] = ['mi-cuenta', 'entidad', 'publico'];

  if (c.dia !== nuevoDia || c.mes !== nuevoMes) {
    const nuevoBytesMes: Record<Audiencia, number> = { 'mi-cuenta': 0, entidad: 0, publico: 0 };
    const nuevoBytesDia: Record<Audiencia, number> = { 'mi-cuenta': 0, entidad: 0, publico: 0 };

    if (c.mes === nuevoMes) {
      for (const a of audiencias) {
        nuevoBytesMes[a] = c.bytesMes[a];
      }
    }

    if (audiencia === 'otros') {
      for (const a of audiencias) {
        nuevoBytesMes[a] += bytes;
        nuevoBytesDia[a] += bytes;
      }
    } else {
      nuevoBytesMes[audiencia] += bytes;
      nuevoBytesDia[audiencia] += bytes;
    }

    return {
      dia: nuevoDia,
      mes: nuevoMes,
      bytesDia: nuevoBytesDia,
      bytesMes: nuevoBytesMes,
    };
  }

  const nuevoBytesMes = { ...c.bytesMes };
  const nuevoBytesDia = { ...c.bytesDia };

  if (audiencia === 'otros') {
    for (const a of audiencias) {
      nuevoBytesMes[a] += bytes;
      nuevoBytesDia[a] += bytes;
    }
  } else {
    nuevoBytesMes[audiencia] += bytes;
    nuevoBytesDia[audiencia] += bytes;
  }

  return {
    ...c,
    bytesDia: nuevoBytesDia,
    bytesMes: nuevoBytesMes,
  };
}

export function usadoHoyMb(
  c: Contadores,
  audiencia: Audiencia | 'otros',
  ahora: number,
  desfaseMin: number
): number {
  const hoy = diaLocal(ahora, desfaseMin);
  if (c.dia !== hoy) return 0;

  if (audiencia === 'otros') {
    const totalBytes = c.bytesDia['mi-cuenta'] + c.bytesDia.entidad + c.bytesDia.publico;
    return totalBytes / MB;
  }

  return c.bytesDia[audiencia] / MB;
}