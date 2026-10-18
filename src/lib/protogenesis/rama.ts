import type { Capa, Cambio, EstadoValores, Molecula, Parametro } from "@/lib/protomolecula/tipos";
import type { Operacion } from "@/lib/protomolecula/tipos";
import { aplicarOperacion } from "@/lib/protomolecula/parametros";
import { deshacerCambio } from "@/lib/protomolecula/parametros";

export interface Rama {
  encargoId: string;
  base: EstadoValores;
  baseVersion: number;
  valores: EstadoValores;
  cambios: Cambio[];
  capasNuevas: Capa[];
}

export function abrirRama(m: Molecula, encargoId: string): Rama {
  const copiaValores = { ...m.valores };
  return {
    encargoId,
    base: { ...copiaValores },
    baseVersion: m.version,
    valores: copiaValores,
    cambios: [],
    capasNuevas: [],
  };
}

export type ResultadoAplicar = { ok: true; rama: Rama } | { ok: false; motivo: string };

export function aplicarEnRama(rama: Rama, p: Parametro, op: Operacion): ResultadoAplicar {
  const aplicado = aplicarOperacion(rama.valores, p, op);
  if (!aplicado.ok) {
    return { ok: false, motivo: aplicado.motivo };
  }
  const nuevaRama: Rama = {
    ...rama,
    valores: aplicado.estado,
    cambios: [...rama.cambios, aplicado.cambio],
  };
  return { ok: true, rama: nuevaRama };
}

export type ResultadoCapa = { ok: true; rama: Rama } | { ok: false; motivo: string };

export function anadirCapa(rama: Rama, capa: Capa): ResultadoCapa {
  if (capa.referencia === null) {
    return { ok: false, motivo: "la capa debe citar una entidad" };
  }
  const nuevaRama: Rama = {
    ...rama,
    capasNuevas: [...rama.capasNuevas, capa],
  };
  return { ok: true, rama: nuevaRama };
}
