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

export function repartirRacion(racionMb: number, nodos: NodoReparto[]): ResultadoReparto {
  const nodosValidos = nodos.filter(n => n.conectado && n.capacidadKbps > 0);

  if (racionMb <= 0 || nodosValidos.length === 0) {
    return {
      reparto: [],
      sobranteMb: racionMb <= 0 ? 0 : racionMb,
    };
  }

  const totalCapacidad = nodosValidos.reduce((s, n) => s + n.capacidadKbps, 0);

  type Candidato = { id: string; mb: number; maxMb?: number; mbExacto: number };

  const candidatos: Candidato[] = nodosValidos.map(n => {
    const proporcion = n.capacidadKbps / totalCapacidad;
    const MbAsignado = proporcion * racionMb;
    return {
      id: n.id,
      mb: 0,
      maxMb: n.maxMb,
      mbExacto: MbAsignado,
    };
  });

  for (const c of candidatos) {
    c.mb = Math.floor(c.mbExacto);
  }

  let racionRestante = racionMb - candidatos.reduce((s, c) => s + c.mb, 0);

  candidatos.sort((a, b) => {
    const restoA = a.mbExacto - Math.floor(a.mbExacto);
    const restoB = b.mbExacto - Math.floor(b.mbExacto);
    if (restoA !== restoB) return restoB - restoA;
    return a.id.localeCompare(b.id);
  });

  while (racionRestante >= 1) {
    let asignado = false;

    for (const c of candidatos) {
      if (c.maxMb === undefined || c.mb < c.maxMb) {
        c.mb += 1;
        racionRestante -= 1;
        asignado = true;
        break;
      }
    }

    if (!asignado) break;
  }

  for (const c of candidatos) {
    if (c.maxMb !== undefined && c.mb > c.maxMb) {
      racionRestante += c.mb - c.maxMb;
      c.mb = c.maxMb;
    }
  }

  while (racionRestante >= 1) {
    let asignado = false;

    for (const c of candidatos) {
      if (c.maxMb === undefined) {
        if (c.mb < Math.floor(c.mbExacto)) {
          c.mb += 1;
          racionRestante -= 1;
          asignado = true;
          break;
        }
      } else {
        if (c.mb < c.maxMb) {
          c.mb += 1;
          racionRestante -= 1;
          asignado = true;
          break;
        }
      }
    }

    if (!asignado) break;
  }

  const reparto = candidatos.map(({ id, mb }) => ({ id, mb }));

  return {
    reparto,
    sobranteMb: Math.round(racionRestante),
  };
}