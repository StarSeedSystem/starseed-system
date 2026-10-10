import type { Parametro, Operacion, ParametroRef } from "./tipos";

export function aplicarOperacion(
  valores: Record<string, number | string>,
  p: Parametro,
  op: Operacion
): { valores: Record<string, number | string>; cambio?: import("./tipos").Cambio } {
  const clave = p.id;
  const actual = typeof valores[clave] === "number" ? (valores[clave] as number) : 0;
  if (op.tipo === "fijar" || op.tipo === "reemplazar") {
    let nuevo: number | string = op.valor !== undefined ? op.valor : actual;
    if (typeof nuevo === "number" && p.rango) {
      const [min, max] = p.rango;
      if (nuevo < min) { nuevo = min; }
      if (nuevo > max) { nuevo = max; }
      return {
        valores: { ...valores, [clave]: nuevo },
        cambio: {
          atomoId: "",
          parametroId: p.id,
          antes: actual,
          despues: nuevo,
          acotado: typeof nuevo === "number" ? (nuevo !== (op.valor as number)) : false,
          tipo: op.tipo,
        },
      };
    }
    return {
      valores: { ...valores, [clave]: nuevo },
      cambio: {
        atomoId: "",
        parametroId: p.id,
        antes: actual,
        despues: nuevo,
        tipo: op.tipo,
      },
    };
  }
  if (op.tipo === "sumar") {
    const delta = typeof op.valor === "number" ? op.valor : 0;
    const nuevoNum = (actual as number) + delta;
    let nuevo = nuevoNum;
    if (p.rango) {
      const [min, max] = p.rango;
      if (nuevo < min) { nuevo = min; }
      if (nuevo > max) { nuevo = max; }
    }
    return {
      valores: { ...valores, [clave]: nuevo },
      cambio: {
        atomoId: "",
        parametroId: p.id,
        antes: actual,
        despues: nuevo,
        acotado: typeof nuevo === "number" ? (nuevo !== nuevoNum) : false,
        tipo: op.tipo,
      },
    };
  }
  if (op.tipo === "multiplicar") {
    const factor = typeof op.valor === "number" ? op.valor : 1;
    const nuevoNum = (actual as number) * factor;
    let nuevo = nuevoNum;
    if (p.rango) {
      const [min, max] = p.rango;
      if (nuevo < min) { nuevo = min; }
      if (nuevo > max) { nuevo = max; }
    }
    return {
      valores: { ...valores, [clave]: nuevo },
      cambio: {
        atomoId: "",
        parametroId: p.id,
        antes: actual,
        despues: nuevo,
        acotado: typeof nuevo === "number" ? (nuevo !== nuevoNum) : false,
        tipo: op.tipo,
      },
    };
  }
  if (op.tipo === "disparo") {
    return {
      valores,
      cambio: {
        atomoId: "",
        parametroId: p.id,
        antes: actual,
        despues: actual,
        tipo: op.tipo,
      },
    };
  }
  return { valores };
}
