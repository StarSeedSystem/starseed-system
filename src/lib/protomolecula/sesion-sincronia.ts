import type { ElementoSala, EstadoSala } from "@/lib/salas/sincronia-sala";
import { fusionarEstados } from "@/lib/salas/sincronia-sala";
import type {
  Operacion,
  Cambio,
  Molecula,
  ValorParametro,
  EstadoValores,
  AtomoEnUso,
  Capa,
  Computo,
} from "./tipos";

export const elementoDeOperacion = (op: Operacion, cambio: Cambio): ElementoSala => ({
  id: `${op.objetivo.atomoId}::${op.objetivo.parametroId}`,
  tipo: "parametro",
  datos: { valor: cambio.despues },
  actualizadoEn: op.t,
  porDispositivo: op.autor.id,
  borrado: false,
});

export const elementoDeEstructura = (tipo: 'capa' | 'atomo', id: string, datos: Record<string, unknown>, actualizadoEn: number, porDispositivo: string, borrado?: boolean): ElementoSala => ({
  id: `${tipo}::${id}`,
  tipo,
  datos,
  actualizadoEn,
  porDispositivo,
  borrado: borrado ?? false,
});

export const moleculaDesdeElementos = (base: Molecula, elementos: ElementoSala[]): Molecula => {
  const baseState: EstadoSala = { salaId: base.id, elementos: {}, reloj: base.actualizadaEn };
  const addBase = (arr: any[], tipo: 'capa' | 'atomo' | 'valor') => {
    arr.forEach(item => {
      let id: string;
      let datos: Record<string, unknown>;
      if (tipo === 'capa') {
        id = `capa::${item.id}`;
        datos = { ...item };
      } else if (tipo === 'atomo') {
        id = `atomo::${item.id}`;
        datos = { ...item };
      } else {
        const [atomoId, parametroId] = item[0].split("::");
        id = `${atomoId}::${parametroId}`;
        datos = { valor: item[1] };
      }
      baseState.elementos[id] = {
        id,
        tipo: tipo === 'valor' ? 'parametro' : tipo,
        datos,
        actualizadoEn: base.actualizadaEn,
        porDispositivo: "system",
        borrado: false,
      };
    });
  };
  addBase(base.capas, 'capa');
  addBase(base.atomos, 'atomo');
  addBase(Object.entries(base.valores), 'valor');

  const elementsState: EstadoSala = {
    salaId: base.id,
    elementos: {},
    reloj: 0,
  };
  elementos.forEach(el => {
    elementsState.elementos[el.id] = el;
    if (el.actualizadoEn > elementsState.reloj) elementsState.reloj = el.actualizadoEn;
  });

  const { resultado } = fusionarEstados(baseState, elementsState, "");

  const molecula: Molecula = {
    id: base.id,
    titulo: base.titulo,
    ambito: base.ambito,
    capas: [],
    atomos: [],
    valores: {},
    version: base.version + 1,
    creadaEn: base.creadaEn,
    actualizadaEn: base.actualizadaEn,
  };

  Object.values(resultado.elementos).forEach(el => {
    if (el.borrado) return;
    if (el.tipo === 'parametro') {
      const [atomoId, parametroId] = el.id.split("::");
      if (atomoId && parametroId) molecula.valores[`${atomoId}::${parametroId}`] = el.datos.valor as ValorParametro;
    } else if (el.tipo === 'capa') {
      const [, capaId] = el.id.split("::");
      if (capaId) {
        const capa = el.datos as Capa;
        molecula.capas.push({ ...capa, id: capaId });
      }
    } else if (el.tipo === 'atomo') {
      const [, atomoId] = el.id.split("::");
      if (atomoId) {
        const atomo = el.datos as AtomoEnUso;
        molecula.atomos.push({ ...atomo, id: atomoId });
      }
    }
    if (el.actualizadoEn > molecula.actualizadaEn) molecula.actualizadaEn = el.actualizadoEn;
  });

  return molecula;
};

export const crearAcumuladorDeGestos = (opts: { cadaMs?: number } = {}) => {
  const { cadaMs = 16 } = opts;
  return {
    procesar: () => {},
    liberar: () => ({
      tipo: "confirmacion",
      objetivo: { atomoId: "", parametroId: "" },
      accion: { tipo: "exacta", valor: true },
      autor: { tipo: "sistema", id: "system" },
      origen: "sistema",
      t: Date.now(),
    }),
  };
};

export const formaCorta = (op: Operacion): string => JSON.stringify(op);
export const desdeFormaCorta = (s: string): Operacion | null => {
  try {
    return JSON.parse(s) as Operacion;
  } catch {
    return null;
  }
};
