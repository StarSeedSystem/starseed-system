import type {
  Ambito, Molecula, Capa, AtomoEnUso, Atomo,
  Parametro, Operacion, Cambio, ParametroRef,
} from "./tipos";
import { aplicarOperacion } from "./parametros";

export function crearMolecula(
  o: { id: string; titulo: string; ambito?: Ambito },
  ahora: number,
): Molecula {
  return {
    id: o.id,
    titulo: o.titulo,
    ambito: o.ambito ?? "personal",
    capas: [],
    atomos: [],
    valores: {},
    version: 0,
    creadaEn: ahora,
    actualizadaEn: ahora,
  };
}

export function anadirCapa(m: Molecula, capa: Capa, ahora: number): Molecula {
  if (m.capas.find((c) => c.id === capa.id)) return m;
  const orden = (typeof capa.orden === "number" && Number.isFinite(capa.orden))
    ? capa.orden
    : Math.max(0, ...m.capas.map((c) => (typeof c.orden === "number" ? c.orden : 0))) + 1;
  return {
    ...m,
    capas: [...m.capas, { ...capa, orden }],
    actualizadaEn: ahora,
  };
}

export function anadirAtomo(m: Molecula, atomo: AtomoEnUso, ahora: number): Molecula {
  if (m.atomos.find((a) => a.id === atomo.id)) return m;
  return {
    ...m,
    atomos: [...m.atomos, { ...atomo }],
    actualizadaEn: ahora,
  };
}

export function cambiarEstadoAtomo(
  m: Molecula, atomoId: string, estado: string, ahora: number
): Molecula {
  const existe = m.atomos.find((a) => a.id === atomoId);
  if (!existe) return m;
  return {
    ...m,
    atomos: m.atomos.map((a) => (a.id === atomoId ? { ...a, estado } : a)),
    actualizadaEn: ahora,
  };
}

export function fijarValores(
  m: Molecula, valores: Record<string, number | string>, ahora: number
): Molecula {
  return {
    ...m,
    valores: { ...valores },
    actualizadaEn: ahora,
  };
}

export function aplicarEnMolecula(
  m: Molecula,
  parametroDe: (ref: ParametroRef) => Parametro | undefined,
  op: Operacion,
  ahora: number,
): { ok: true; molecula: Molecula; cambio: Cambio } | { ok: false; motivo: string } {
  if (op.tipo === "disparo") {
    const ref = op.referencia ?? { atomoId: "", parametroId: op.tipo };
    const p = parametroDe ? parametroDe(ref) : undefined;
    if (!p) return { ok: false, motivo: "Parámetro desconocido para el disparo." };
    const resultado = aplicarOperacion(m.valores, p, op);
    const cambio: Cambio = resultado.cambio ?? {
      atomoId: ref.atomoId,
      parametroId: p.id,
      tipo: op.tipo,
    };
    return { ok: true, molecula: { ...m }, cambio };
  }

  const ref = op.referencia;
  if (!ref) return { ok: false, motivo: "Falta referencia al parámetro." };

  const atomo = m.atomos.find((a) => a.id === ref.atomoId);
  if (!atomo) return { ok: false, motivo: `Átomo no existe en la molécula: ${ref.atomoId}` };

  const p = parametroDe ? parametroDe(ref) : undefined;
  if (!p) return { ok: false, motivo: `Parámetro desconocido: ${ref.parametroId}` };

  const resultado = aplicarOperacion(m.valores, p, op);
  const cambio: Cambio = resultado.cambio ?? {
    atomoId: ref.atomoId,
    parametroId: p.id,
    tipo: op.tipo,
    antes: m.valores[p.id],
    despues: resultado.valores[p.id],
  };

  return {
    ok: true,
    molecula: {
      ...m,
      version: m.version + 1,
      valores: resultado.valores,
      actualizadaEn: ahora,
    },
    cambio,
  };
}
