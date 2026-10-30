export type TipoRecurso = "capacidad" | "app";

export interface PrestamoInfo {
  id: string;
  contraparte: string;
  recurso: string;
  tipo: TipoRecurso;
  desde: number;
  consumo?: number | null;
}

export interface FilaPrestamo {
  id: string;
  quien: string;
  que: string;
  desdeCuando: string;
  consumo: string;
}

export interface ResumenPrestamos {
  dados: {
    filas: FilaPrestamo[];
    totales: { sesiones: number; consumoTotal: number };
  };
  tomados: {
    filas: FilaPrestamo[];
    totales: { sesiones: number; consumoTotal: number };
  };
}

function formatoDuracion(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeg = Math.floor(ms / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  const partes: string[] = [];
  if (h > 0) partes.push(`${h}h`);
  if (m > 0) partes.push(`${m}m`);
  if (s > 0 || partes.length === 0) partes.push(`${s}s`);
  return partes.join(" ");
}

function filaDe(p: PrestamoInfo, ahora: number): FilaPrestamo {
  const dur = ahora - p.desde;
  const durStr = dur > 0 ? `${formatoDuracion(dur)}` : "recién";
  const que = `${p.tipo === "capacidad" ? "Capacidad" : "App"}: ${p.recurso}`;
  const consumo = p.consumo == null ? "sin medida" : `${p.consumo}`;
  return {
    id: p.id,
    quien: p.contraparte,
    que,
    desdeCuando: durStr,
    consumo,
  };
}

export function resumenPrestamos(
  prestamosDados: PrestamoInfo[],
  prestamosTomados: PrestamoInfo[],
  ahora: number
): ResumenPrestamos {
  const dadosFilas = (prestamosDados ?? []).map((p) => filaDe(p, ahora));
  const tomadosFilas = (prestamosTomados ?? []).map((p) => filaDe(p, ahora));

  const sumaConsumo = (arr: PrestamoInfo[]) =>
    arr.reduce((acc, p) => acc + (typeof p.consumo === "number" ? p.consumo : 0), 0);

  return {
    dados: {
      filas: dadosFilas,
      totales: { sesiones: dadosFilas.length, consumoTotal: sumaConsumo(prestamosDados ?? []) },
    },
    tomados: {
      filas: tomadosFilas,
      totales: { sesiones: tomadosFilas.length, consumoTotal: sumaConsumo(prestamosTomados ?? []) },
    },
  };
}
