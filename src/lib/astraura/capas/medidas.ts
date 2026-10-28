export interface MedidaModelo {
  neurona: string;
  modelo: string;
  capa: string;
  latenciaMs: number;
  tokPorS?: number;
  acierto?: number;
}

interface MedidaAgregada {
  historial: MedidaModelo[];
}

export interface AlmacenMedidas {
  [neurona: string]: {
    [modelo: string]: MedidaAgregada;
  };
}

const MAX = 20;

function media(lista: number[]): number {
  if (lista.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < lista.length; i++) s += lista[i];
  return s / lista.length;
}

export function registrarMedida(
  almacen: AlmacenMedidas,
  m: MedidaModelo,
): AlmacenMedidas {
  const copia: AlmacenMedidas = JSON.parse(JSON.stringify(almacen));
  const neurona = copia[m.neurona] || {};
  copia[m.neurona] = neurona;
  const actual = neurona[m.modelo] || { historial: [] };
  const historial = [...actual.historial, { ...m }];
  if (historial.length > MAX) historial.splice(0, historial.length - MAX);
  neurona[m.modelo] = { historial };
  return copia;
}

export interface CandidatoMedida {
  modelo: string;
}

export function ordenarPorMedidas<T extends CandidatoMedida>(
  candidatos: T[],
  medidas: AlmacenMedidas,
  neurona: string,
): T[] {
  const nm = medidas[neurona];
  if (!nm) return [...candidatos];
  const conMedida: Array<{ c: T; i: number; lat: number; acc: number }> = [];
  const sinMedida: Array<{ c: T; i: number }> = [];
  for (let i = 0; i < candidatos.length; i++) {
    const c = candidatos[i];
    const ag = nm[c.modelo];
    if (!ag || ag.historial.length === 0) {
      sinMedida.push({ c, i });
      continue;
    }
    const hist = ag.historial;
    const lat = media(hist.map((h) => h.latenciaMs));
    const accs: number[] = [];
    for (let j = 0; j < hist.length; j++) {
      const a = hist[j].acierto;
      if (typeof a === "number") accs.push(a);
    }
    const acc = accs.length > 0 ? media(accs) : 0;
    conMedida.push({ c, i, lat, acc });
  }
  conMedida.sort((x, y) => {
    if (y.acc !== x.acc) return y.acc - x.acc;
    if (x.lat !== y.lat) return x.lat - y.lat;
    return x.i - y.i;
  });
  const res: T[] = [];
  for (let i = 0; i < conMedida.length; i++) res.push(conMedida[i].c);
  for (let i = 0; i < sinMedida.length; i++) res.push(sinMedida[i].c);
  return res;
}
