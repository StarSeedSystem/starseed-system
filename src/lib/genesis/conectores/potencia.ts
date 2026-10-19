export type Medida = {
  tokensPorSeg: number | null;
  aciertos: number | null;
  intentos: number;
  latenciaMs: number | null;
  capa: string | null;
};

export type ResultadoPotencia = {
  puntuacion: number;
  motivo: string;
  confianza: number;
};

export function puntuarPotencia(
  medidas: Medida[],
  papel: string
): ResultadoPotencia {
  // TODO: implement
  return {
    puntuacion: 0,
    motivo: 'Sin medidas',
    confianza: 0,
  };
}

export function ordenarPorPotencia(
  medidas: Medida[],
  papel: string
): Medida[] {
  // TODO: implement
  return [...medidas].sort(() => 0);
}