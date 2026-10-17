/**
 * ProtoGenesis · Rama del encargo (PG1013E)
 * Módulo puro: sin node:, sin Supabase, sin window.
 * Exporta la interfaz `Rama` y las funciones `abrirRama`, `aplicarEnRama`, `anadirCapa`, `fusionar`, `deshacerFusion`.
 */

import type {
  Molecula,
  Capa,
  Parametro,
  Operacion,
  Cambio,
  ParametroRef,
  EstadoValores,
} from "@/lib/protomolecula/tipos";

export interface Rama {
  encargoId: string;
  base: EstadoValores;
  baseVersion: number;
  valores: EstadoValores;
  cambios: Cambio[];
  capasNuevas: Capa[];
}

function copiarObjeto<T>(obj: T): T {
  return Array.isArray(obj) ? obj.slice() : { ...obj };
}

function generarClave(ref: ParametroRef): string {
  return `${ref.atomoId}::${ref.parametroId}`;
}

/** Abre una nueva rama para un encargo sobre una molécula (copia, nunca referencia). */
export function abrirRama(m: Molecula, encargoId: string): Rama {
  return {
    encargoId,
    base: copiarObjeto(m.valores),
    baseVersion: m.version,
    valores: copiarObjeto(m.valores),
    cambios: [],
    capasNuevas: [],
  };
}

/** Aplica una operación sobre una rama, devolviendo una nueva rama u ok false con motivo. */
export function aplicarEnRama(
  rama: Rama,
  p: Parametro,
  op: Operacion,
): {
  ok: true;
  rama: Rama;
} | {
  ok: false;
  motivo: string;
} {
  const antes = rama.valores[generarClave(op.objetivo)] ?? p.defecto;
  const actual = rama.valores[generarClave(op.objetivo)];

  let nuevoValor: any;
  if (op.accion.tipo === "exacta") {
    if (op.accion.valor === undefined) {
      return { ok: false, motivo: "operación exacta sin valor" };
    }
    nuevoValor = op.accion.valor;
    if (p.tipo === "entero" && typeof nuevoValor === "number") {
      nuevoValor = Math.round(nuevoValor);
    }
    if (p.min !== undefined && typeof nuevoValor === "number" && nuevoValor < p.min) {
      nuevoValor = p.min;
    }
    if (p.max !== undefined && typeof nuevoValor === "number" && nuevoValor > p.max) {
      nuevoValor = p.max;
    }
  } else if (op.accion.tipo === "relativa") {
    nuevoValor = (actual as number) + op.accion.cantidad;
    if (p.tipo === "entero" && typeof nuevoValor === "number") {
      nuevoValor = Math.round(nuevoValor);
    }
    if (p.min !== undefined && typeof nuevoValor === "number" && nuevoValor < p.min) {
      nuevoValor = p.min;
    }
    if (p.max !== undefined && typeof nuevoValor === "number" && nuevoValor > p.max) {
      nuevoValor = p.max;
    }
  } else if (op.accion.tipo === "alternar") {
    if (p.tipo !== "booleano") {
      return { ok: false, motivo: "operación alternar solo para booleanos" };
    }
    nuevoValor = !actual;
  } else if (op.accion.tipo === "disparo") {
    return {
      ok: true,
      rama: {
        ...rama,
        cambios: [
          ...rama.cambios,
          {
            operacion: op,
            antes: actual,
            despues: actual,
            acotado: false,
            reversible: false,
            nota: "disparo",
          },
        ],
      },
    };
  } else {
    return { ok: false, motivo: "acción de operación no soportada" };
  }

  const cambio: Cambio = {
    operacion: op,
    antes,
    despues: nuevoValor,
    acotado: (p.min !== undefined && typeof nuevoValor === "number" && nuevoValor < p.min) || (p.max !== undefined && typeof nuevoValor === "number" && nuevoValor > p.max),
    reversible: op.accion.tipo !== "disparo",
    nota: undefined,
  };

  const ramaNueva: Rama = {
    ...rama,
    valores: { ...rama.valores, [generarClave(op.objetivo)]: nuevoValor },
    cambios: [...rama.cambios, cambio],
  };

  return { ok: true, rama: ramaNueva };
}

/** Añade una capa a una rama. */
export function anadirCapa(rama: Rama, capa: Capa): Rama {
  const nuevaCapa = { ...capa, id: capa.id || `capa-${Date.now()}` };
  return {
    ...rama,
    capasNuevas: [...rama.capasNuevas, nuevaCapa],
  };
}

  /** Fusiona los cambios de una rama sobre la molécula ACTUAL solo para parámetros que siguen como en la base; los cambios que otra persona modificó son conflictos (se enseñan). */
export function fusionar(m: Molecula, rama: Rama): {
  ok: true;
  molecula: Molecula;
  conflictos: string[];
} | {
  ok: false;
  motivo: string;
} {
  const conflictos: string[] = [];
  const nuevosValores = { ...m.valores };
  let versionNue = m.version;
  let hayCambios = false;

  for (const cambio of rama.cambios) {
    const clave = generarClave(cambio.operacion.objetivo);
    const valorActual = m.valores[clave];

    if (valorActual !== rama.base[clave]) {
      conflictos.push(`conflicto en ${cambio.operacion.objetivo.atomoId}::${cambio.operacion.objetivo.parametroId}: usted tenía ${rama.base[clave]}, pero otra persona cambió a ${valorActual}`);
      continue;
    }

    if (cambio.operacion.accion.tipo === "disparo") {
      continue;
    }

    nuevosValores[clave] = cambio.despues;
    hayCambios = true;
  }

  const moleculaNueva: Molecula = {
    ...m,
    version: hayCambios ? versionNue + 1 : versionNue,
    valores: nuevosValores,
    actualizadaEn: Date.now(),
  };

  return {
    ok: true,
    molecula: moleculaNueva,
    conflictos,
  };
}

  /** Deshace una fusión: revierte a los valores de la base. */
export function deshacerFusion(m: Molecula, cambiosAplicados: Cambio[]): Molecula {
  const revertedValores = { ...m.valores };

  for (const cambio of cambiosAplicados) {
    const clave = generarClave(cambio.operacion.objetivo);
    if (m.valores[clave] === cambio.despues) {
      revertedValores[clave] = cambio.antes;
    }
  }

  return {
    ...m,
    valores: revertedValores,
    actualizadaEn: Date.now(),
  };
}

/** Obtiene los cambios aplicados durante una fusión (extraídos de la historia). */
export function obtenerCambiosDeFusion(fusionResult: ReturnType<typeof fusionar>): Cambio[] {
  if (!fusionResult.ok) {
    return [];
  }
  const rama: Rama = {
    encargoId: "temp",
    base: fusionResult.molecula.valores,
    baseVersion: fusionResult.molecula.version - 1,
    valores: fusionResult.molecula.valores,
    cambios: [],
    capasNuevas: [],
  };
  return rama.cambios;
}
