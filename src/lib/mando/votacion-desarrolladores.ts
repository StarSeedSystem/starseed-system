export type Propuesta = {
  candidato: string;
  propuestaPor: string;
  votos: Record<string, boolean>;
  abiertaDesdeMs: number;
};

export type ResultadoPropuesta = {
  estado: "abierta" | "aprobada" | "rechazada" | "caducada";
  motivo: string;
};

const CADUCIDAD_MS = 14 * 24 * 60 * 60 * 1000;

export function resultado(
  p: Propuesta,
  desarrolladores: string[],
  ahoraMs: number,
): ResultadoPropuesta {
  if (p.candidato === p.propuestaPor || p.votos[p.candidato] !== undefined) {
    return {
      estado: "rechazada",
      motivo: "Nadie puede proponerse ni votarse a sí mismo.",
    };
  }

  const votosValidos = new Map<string, boolean>();
  let descartados = 0;
  for (const [votante, voto] of Object.entries(p.votos)) {
    if (desarrolladores.includes(votante)) {
      votosValidos.set(votante, voto);
    } else {
      descartados += 1;
    }
  }

  const total = desarrolladores.length;
  const aFavor = [...votosValidos.values()].filter(Boolean).length;
  const necesarios = Math.floor(total / 2) + 1;
  const notaDescartados =
    descartados > 0
      ? ` Se descartaron ${descartados} voto(s) de quien ya no es desarrollador.`
      : "";

  if (aFavor >= necesarios) {
    const motivo =
      total === 1
        ? "Aprobada: con un solo desarrollador, su voto a favor basta (mayoría de 1)."
        : `Aprobada: ${aFavor} de ${total} desarrolladores a favor (mayoría: ${necesarios}).`;
    return { estado: "aprobada", motivo: motivo + notaDescartados };
  }

  if (ahoraMs - p.abiertaDesdeMs >= CADUCIDAD_MS) {
    return {
      estado: "caducada",
      motivo:
        `Caducada: 14 días sin mayoría (${aFavor}/${total} a favor, ` +
        `hacían falta ${necesarios}).` + notaDescartados,
    };
  }

  const enContra = votosValidos.size - aFavor;
  const posibles = aFavor + (total - votosValidos.size);
  if (enContra >= necesarios || posibles < necesarios) {
    return {
      estado: "rechazada",
      motivo:
        `Rechazada: mayoría imposible (${aFavor} a favor, ${enContra} en contra, ` +
        `${total} desarrolladores).` + notaDescartados,
    };
  }

  return {
    estado: "abierta",
    motivo:
      `Abierta: ${aFavor} de ${total} a favor; ` +
      `se necesitan ${necesarios}.` + notaDescartados,
  };
}
