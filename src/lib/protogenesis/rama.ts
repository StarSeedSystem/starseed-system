import type { Capa, Cambio, EstadoValores, Molecula, Parametro } from "@/lib/protomolecula/tipos";
import type { Operacion } from "@/lib/protomolecula/tipos";
import { aplicarOperacion } from "@/lib/protomolecula/parametros";
import { deshacerCambio } from "@/lib/protomolecula/parametros";

// Módulo puro para ramas de encargo en ProtoGenesis
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

export type ResultadoFusion =
  | { ok: true; molecula: Molecula; conflictos: string[] }
  | { ok: false; motivo: string };

export function fusionar(m: Molecula, rama: Rama): ResultadoFusion {
  const nuevaMolecula: Molecula = {
    ...m,
    valores: { ...m.valores },
    capas: [...m.capas],
  };

  const conflictos: string[] = [];
  const base = rama.base;

  for (const clave of Object.keys(rama.valores)) {
    const valorBase = base[clave];
    const valorRama = rama.valores[clave];
    if (valorBase === undefined) continue;
    if (valorRama === valorBase) continue;
    const valorActual = nuevaMolecula.valores[clave];
    if (valorActual !== valorBase) {
      conflictos.push(`parámetro ${clave} cambió en la molécula`);
      continue;
    }
    nuevaMolecula.valores[clave] = valorRama;
  }

  for (const capa of rama.capasNuevas) {
    nuevaMolecula.capas.push({ ...capa });
  }

  nuevaMolecula.version = m.version + 1;
  nuevaMolecula.actualizadaEn = Date.now();

  return { ok: true, molecula: nuevaMolecula, conflictos };
}

export function deshacerFusion(m: Molecula, cambiosAplicados: Cambio[]): Molecula {
  let valores = { ...m.valores };
  for (const c of cambiosAplicados) {
    const revertido = deshacerCambio(valores, c, true);
    if (revertido.ok) {
      valores = revertido.estado;
    } else {
      const clave = `${c.operacion.objetivo.atomoId}::${c.operacion.objetivo.parametroId}`;
      valores[clave] = c.antes;
    }
  }
  const capas = [...m.capas];
  return { ...m, valores };
}
