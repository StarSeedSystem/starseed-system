export interface NodoReparto {
  id: string;
  capacidadKbps: number;
  conectado: boolean;
  maxMb?: number;
}

export interface ResultadoReparto {
  reparto: { id: string; mb: number }[];
  sobranteMb: number;
}

function calcularPartesProporcionales(
  capacidadTotal: number,
  racionMb: number,
  nodosValidos: NodoReparto[]
): { parteEntera: number; resto: number; indice: number }[] {
  return nodosValidos.map((nodo, indice) => {
    const parteExacta = (nodo.capacidadKbps / capacidadTotal) * racionMb;
    const parteEntera = Math.floor(parteExacta);
    const resto = parteExacta - parteEntera;
    return { parteEntera, resto, indice };
  });
}

function repartirRestos(
  partes: { parteEntera: number; resto: number; indice: number }[],
  restantes: number,
  nodosValidos: NodoReparto[]
): number[] {
  const indicesOrdenados = [...partes]
    .sort((a, b) => {
      if (b.resto !== a.resto) return b.resto - a.resto;
      return nodosValidos[a.indice].id.localeCompare(nodosValidos[b.indice].id);
    })
    .map(p => p.indice);

  const resultado = partes.map(p => p.parteEntera);
  for (let i = 0; i < restantes; i++) {
    resultado[indicesOrdenados[i]]++;
  }
  return resultado;
}

export function repartirRacion(
  racionMb: number,
  nodos: NodoReparto[]
): ResultadoReparto {
  if (racionMb <= 0) {
    return { reparto: [], sobranteMb: racionMb };
  }

  const nodosValidos = nodos
    .filter(n => n.conectado && n.capacidadKbps > 0)
    .map(n => ({ ...n }))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (nodosValidos.length === 0) {
    return { reparto: [], sobranteMb: racionMb };
  }

  let capacidadTotal = nodosValidos.reduce((s, n) => s + n.capacidadKbps, 0);
  let racionRestante = racionMb;
  const asignaciones = new Map<string, number>();
  const nodosActivos = new Set(nodosValidos.map(n => n.id));

  while (true) {
    const activos = nodosValidos.filter(n => nodosActivos.has(n.id));
    if (activos.length === 0) break;

    capacidadTotal = activos.reduce((s, n) => s + n.capacidadKbps, 0);
    const partes = calcularPartesProporcionales(capacidadTotal, racionRestante, activos);
    const sumaEnteras = partes.reduce((s, p) => s + p.parteEntera, 0);
    const restantes = racionRestante - sumaEnteras;
    const mbAsignados = repartirRestos(partes, restantes, activos);

    let hayCambios = false;
    for (let i = 0; i < activos.length; i++) {
      const nodo = activos[i];
      const mb = mbAsignados[i];
      const maxMb = nodo.maxMb ?? Infinity;

      if (mb > maxMb) {
        const exceso = mb - maxMb;
        asignaciones.set(nodo.id, maxMb);
        racionRestante -= maxMb;
        nodosActivos.delete(nodo.id);
        hayCambios = true;
      } else {
        asignaciones.set(nodo.id, mb);
      }
    }

    if (!hayCambios) {
      racionRestante = 0;
      break;
    }
  }

  const reparto = nodosValidos
    .map(n => ({ id: n.id, mb: asignaciones.get(n.id) ?? 0 }))
    .filter(r => r.mb > 0);

  const sumaReparto = reparto.reduce((s, r) => s + r.mb, 0);
  const sobranteMb = racionMb - sumaReparto;

  return { reparto, sobranteMb };
}