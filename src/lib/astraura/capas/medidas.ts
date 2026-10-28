export interface Medida {
  neurona: string;
  modelo: string;
  capa: string;
  latenciaMs: number;
  tokPorS?: number;
  acierto?: number;
}

export interface AlmacenMedidas {
  registrarMedida(medida: Medida): void;
  obtenerMedia(modelo: string, neurona: string): Omit<Medida, "neurona" | "modelo" | "capa"> | null;
}

const cache = new Map<string, Medida[]>();

export function registrarMedida(almacen: AlmacenMedidas, medida: Medida) {
  const key = `${medida.neurona}:${medida.modelo}:${medida.capa}`;
  const medidas = cache.get(key) || [];
  medidas.push(medida);
  if (medidas.length > 20) medidas.shift();
  cache.set(key, medidas);
  almacen.registrarMedida(medida);
}

export function ordenarPorMedidas<T extends { modelo: string }>(
  candidatos: T[],
  medidas: AlmacenMedidas,
  neurona: string
): T[] {
  return [...candidatos].sort((a, b) => {
    const ma = medidas.obtenerMedia(a.modelo, neurona);
    const mb = medidas.obtenerMedia(b.modelo, neurona);
    if (!ma && !mb) return 0;
    if (!ma) return 1;
    if (!mb) return -1;
    const scoreA = (ma.tokPorS || 0) * (ma.acierto || 1) / (ma.latenciaMs || 1);
    const scoreB = (mb.tokPorS || 0) * (mb.acierto || 1) / (mb.latenciaMs || 1);
    return scoreB - scoreA;
  });
}
