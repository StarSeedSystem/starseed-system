export interface FilaCapaRed {
  id: string;
  capa: string;
  version: string;
  estado: string;
  dispositivos: number;
  servidores: number;
  espejos: number;
  resultadoBanco: string | null;
}

export interface CatalogoCapa {
  capas: Array<{ id: string; version: string; estado: string }>;
  espejos: Record<string, boolean>;
}

export interface EstadoCapa {
  actualizado: string;
  capas: Record<string, { dispositivos: number; servidores: number; ultima: string }>;
}

export interface ChipCapacidad {
  nodoId: string;
  capas?: string[];
}

export interface CapaChips {
  capa: string;
  chips: Record<string, ChipCapacidad>;
}

export interface ResultadoBanco {
  capa: string;
  version: string;
  resultado: string;
}

export function extraerFilasCapaRed(
  catalogo: CatalogoCapa,
  estado: EstadoCapa,
  chips: CapaChips[],
  resultadosBanco: ResultadoBanco[],
): FilaCapaRed[] {
  const filas: FilaCapaRed[] = [];

  for (const capa of catalogo.capas || []) {
    const idCapa = capa.id;
    const version = capa.version || "";
    const estadoStr = capa.estado || "desconocido";
    const chipsPorCapa = chips.find((c) => c.capa === idCapa);

    const dispositivos = chipsPorCapa
      ? Object.values(chipsPorCapa.chips).filter((chip) =>
          (chip.capas || []).some((c) => c.toLowerCase().split('@')[0] === idCapa.toLowerCase())
        ).length
      : 0;

    const servidores = estado.capas[idCapa]?.servidores || 0;
    const espejos = catalogo.espejos[idCapa] ? 1 : 0;

    const resultado = resultadosBanco.find((r) => r.capa === idCapa);

    filas.push({
      id: idCapa,
      capa: idCapa,
      version,
      estado: estadoStr,
      dispositivos,
      servidores,
      espejos,
      resultadoBanco: resultado?.resultado || null,
    });
  }

  return filas;
}
