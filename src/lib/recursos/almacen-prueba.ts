type EstadoMedio = 'ausente' | 'otro-disco' | 'sin-imagen' | 'listo';

export type PlanPrueba = boolean;

export type ResultadoMedicion = {
  ofertaMB: number;
  motivo: string | null;
};

export function planPruebaEspacio(entrada: {
  estado: EstadoMedio;
  espacioDeclaradoMB: number;
  cuotaMB: number;
}): PlanPrueba {
  if (entrada.estado !== 'listo') return false;
  if (entrada.cuotaMB <= 0) return false;
  return entrada.espacioDeclaradoMB > 0;
}

export function evaluarPruebaEspacio(entrada: {
  espacioDeclaradoMB: number;
  espacioMedidoMB: number;
  cuotaMB: number;
  reservaMB: number;
}): ResultadoMedicion {
  if (entrada.espacioMedidoMB < entrada.reservaMB) {
    return { ofertaMB: 0, motivo: 'pendiente' };
  }

  const espacioDisponible = entrada.espacioMedidoMB - entrada.reservaMB;
  const ofertaCalculada = Math.min(espacioDisponible, entrada.cuotaMB);

  if (entrada.espacioMedidoMB < entrada.espacioDeclaradoMB) {
    return { ofertaMB: ofertaCalculada, motivo: 'espacio-menor-esperado' };
  }

  return { ofertaMB: ofertaCalculada, motivo: null };
}

export function ofertaTrasMedicion(entrada: {
  ofertaDeclaradaMB: number;
  espacioMedidoMB: number;
  cuotaMB: number;
  reservaMB: number;
}): number {
  if (entrada.espacioMedidoMB < entrada.reservaMB + 1) {
    return 0;
  }

  const espacioDisponible = entrada.espacioMedidoMB - entrada.reservaMB;
  const ofertaMaxima = Math.min(espacioDisponible, entrada.cuotaMB);

  return Math.min(entrada.ofertaDeclaradaMB, ofertaMaxima);
}