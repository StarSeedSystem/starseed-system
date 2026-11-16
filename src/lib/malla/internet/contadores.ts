import { Audiencia } from './tipos';

export type Auditoria = Audiencia | 'otros';

export const MB = 1_000_000;

export interface Contadores {
  dia: string;
  mes: string;
  bytesDia: Record<Audiencia, number>;
  bytesMes: Record<Audiencia, number>;
}

export function contadoresVacios(ahora: number, desfaseMin: number): Contadores {
  const d = new Date(ahora + desfaseMin * 60 * 1000);
  const dia = d.toISOString().slice(0, 10);
  const mes = d.toISOString().slice(0, 7);
  return {
    dia,
    mes,
    bytesDia: { 'mi-cuenta': 0, entidad: 0, publico: 0 },
    bytesMes: { 'mi-cuenta': 0, entidad: 0, publico: 0 },
  };
}

export function diaLocal(ahora: number, desfaseMin: number): string {
  const d = new Date(ahora + desfaseMin * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function sumarBytes(
  c: Contadores,
  audiencia: Audiencia,
  bytes: number,
  ahora: number,
  desfaseMin: number
): Contadores {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return c;
  }

  const nuevoDia = diaLocal(ahora, desfaseMin);
  const d = new Date(ahora + desfaseMin * 60 * 1000);
  const nuevoMes = d.toISOString().slice(0, 7);

  const reiniciarDia = nuevoDia !== c.dia;
  const reiniciarMes = nuevoMes !== c.mes;

  const nuevosBytesMes: Record<Audiencia, number> = { 'mi-cuenta': 0, entidad: 0, publico: 0 };
  const nuevosBytesDia: Record<Audiencia, number> = { 'mi-cuenta': 0, entidad: 0, publico: 0 };

  for (const aud of ['mi-cuenta', 'entidad', 'publico'] as Audiencia[]) {
    if (aud === audiencia) {
      const prevMes = reiniciarMes ? 0 : c.bytesMes[aud];
      nuevosBytesMes[aud] = prevMes + bytes;
      nuevosBytesDia[aud] = reiniciarDia || reiniciarMes ? bytes : c.bytesDia[aud] + bytes;
    } else if (reiniciarMes) {
      nuevosBytesMes[aud] = 0;
      nuevosBytesDia[aud] = 0;
    } else if (reiniciarDia) {
      nuevosBytesMes[aud] = c.bytesMes[aud];
      nuevosBytesDia[aud] = 0;
    } else {
      nuevosBytesMes[aud] = c.bytesMes[aud];
      nuevosBytesDia[aud] = c.bytesDia[aud];
    }
  }

  return {
    dia: nuevoDia,
    mes: nuevoMes,
    bytesDia: nuevosBytesDia,
    bytesMes: nuevosBytesMes,
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
    return (c.bytesDia.entidad + c.bytesDia.publico) / MB;
  }

  return c.bytesDia[audiencia] / MB;
}