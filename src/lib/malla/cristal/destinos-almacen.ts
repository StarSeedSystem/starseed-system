export interface DestinoAlmacen {
  id: string;
  tipo: 'aparato' | 'cerebro' | 'biblioteca' | 'servidor';
  motor: string;
  publico: boolean;
  cerebroId?: string;
}

export interface Dato {
  clase: 'interno' | 'privado' | 'publico';
}

export function destinosDe(dato: Dato, e: {
  politicaContexto: string[];
  disponibles: DestinoAlmacen[];
  elegidosPorDato?: string[];
  motoresReales: string[];
}): {
  guardar: DestinoAlmacen[];
  descartados: { id: string; motivo: string }[];
} {
  const destinationIdsToConsider: string[] = e.elegidosPorDato?.length > 0 
    ? e.elegidosPorDato 
    : e.politicaContexto;

  const guardar: DestinoAlmacen[] = [];
  const descartados: { id: string; motivo: string }[] = [];

  for (const id of destinationIdsToConsider) {
    const destino = e.disponibles.find(d => d.id === id);
    if (!destino) {
      descartados.push({ id, motivo: 'no existe' });
      continue;
    }

    // Check if motor is not implemented (except for aparato)
    if (!e.motoresReales.includes(destino.motor) && destino.tipo !== 'aparato') {
      descartados.push({ id, motivo: 'aún sin motor de guardado' });
      continue;
    }

    // Check if dato is privado or interno and destination is public
    if ((dato.clase === 'privado' || dato.clase === 'interno') && destino.publico) {
      descartados.push({ id, motivo: 'destino público no permitido para dato privado/interno' });
      continue;
    }

    // If all checks pass, add to guardar
    guardar.push(destino);
  }

  return { guardar, descartados };
}