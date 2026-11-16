export interface Nodo {
  id: string;
  capacidadKbps: number;
  conectado: boolean;
  maxMb?: number;
}

export interface ResultadoReparto {
  reparto: { id: string; mb: number }[];
  sobranteMb: number;
}

export function repartirRacion(
  racionMb: number,
  nodos: Nodo[]
): ResultadoReparto {
  const nodosValidos = nodos.filter((n) => n.conectado && n.capacidadKbps > 0);
  if (nodosValidos.length === 0 || racionMb <= 0) {
    return { reparto: nodos.map(n => ({ id: n.id, mb: 0 })), sobranteMb: racionMb };
  }

  // Implementación simplificada para satisfacer pruebas iniciales
  let totalCapacidad = nodosValidos.reduce((sum, n) => sum + n.capacidadKbps, 0);
  let reparto: { id: string; mb: number }[] = [];
  let totalRepartido = 0;

  for (const nodo of nodosValidos) {
    let proporcion = nodo.capacidadKbps / totalCapacidad;
    let mb = Math.floor(racionMb * proporcion);
    if (nodo.maxMb !== undefined && mb > nodo.maxMb) {
      mb = nodo.maxMb;
    }
    reparto.push({ id: nodo.id, mb });
    totalRepartido += mb;
  }

  return {
    reparto,
    sobranteMb: racionMb - totalRepartido,
  };
}
