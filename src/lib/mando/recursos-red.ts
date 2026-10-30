export type Oferta = { id: string; medio: string; medida?: boolean };
export type Prestamo = { id: string; recurso: string; medio: string; activo: boolean };
export type Volumen = { id: string; replicasActual: number; replicasDeseadas: number };

export type ResumenRecursos = {
  ofertasPorMedio: { medio: string; total: number; medidos: number; sinMedir: number }[];
  prestamosVivos: { id: string; recurso: string; medio: string }[];
  volumenesBajos: { id: string; actual: number; deseadas: number }[];
};

export function resumirRecursosRed(entrada: {
  ofertas: Oferta[];
  prestamos: Prestamo[];
  volumenes: Volumen[];
}): ResumenRecursos {
  const porMedio = new Map<string, { total: number; medidos: number }>();
  for (const o of entrada.ofertas) {
    const actual = porMedio.get(o.medio) ?? { total: 0, medidos: 0 };
    actual.total += 1;
    if (o.medida) actual.medidos += 1;
    porMedio.set(o.medio, actual);
  }
  const ofertasPorMedio = Array.from(porMedio.entries()).map(([medio, v]) => ({
    medio,
    total: v.total,
    medidos: v.medidos,
    sinMedir: v.total - v.medidos,
  }));

  const prestamosVivos = entrada.prestamos.filter(p => p.activo).map(p => ({
    id: p.id,
    recurso: p.recurso,
    medio: p.medio,
  }));

  const volumenesBajos = entrada.volumenes
    .filter(v => v.replicasActual < v.replicasDeseadas)
    .map(v => ({ id: v.id, actual: v.replicasActual, deseadas: v.replicasDeseadas }));

  return { ofertasPorMedio, prestamosVivos, volumenesBajos };
}
