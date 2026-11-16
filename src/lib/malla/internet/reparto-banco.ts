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

  let totalCapacidad = nodosValidos.reduce((sum, n) => sum + n.capacidadKbps, 0);
  const reparto: { id: string; mb: number }[] = [];
  let remainingMb = racionMb;

  for (const nodo of nodosValidos) {
    let mb = Math.floor((nodo.capacidadKbps / totalCapacidad) * racionMb);
    if (nodo.maxMb !== undefined && mb > nodo.maxMb) {
      mb = nodo.maxMb;
    }
    reparto.push({ id: nodo.id, mb });
    remainingMb -= mb;
  }

  for (const nodo of nodosValidos) {
    const idx = nodosValidos.findIndex(n => n.id === nodo.id);
    const currentMb = reparto[idx].mb;
    const maxMb = nodo.maxMb ?? Infinity;
    if (currentMb < maxMb && remainingMb > 0 && nodo.capacidadKbps > 0) {
      const availableMb = Math.min(maxMb - currentMb, remainingMb);
      reparto[idx].mb = currentMb + availableMb;
      remainingMb -= availableMb;
    }
  }

  return {
    reparto,
    sobranteMb: remainingMb,
  };
}
