// Tipos y operación del ESTADO SIMPLE de la molécula (molecula-estado.ts, almacen-moleculas.ts).
// INT1010D (2026-10-10): el enjambre (PM1010F0*) los escribió cuando el núcleo del contrato (tipos.ts,
// parametros.ts: Capa con tipo/formato, AtomoEnUso con herramientaId, Operacion por acción) aún no estaba
// en main. Al llegar el núcleo, esta primera versión se conserva aquí para que su estado y sus pruebas
// sigan en verde. Pendiente (cola del enjambre): portar molecula-estado al núcleo y retirar este archivo.

export type Ambito = "personal" | "publico" | "privado" | "grupo";

export interface Capa {
  id: string;
  nombre: string;
  orden?: number;
}

export interface Atomo {
  id: string;
  capaId: string;
  tipo: string;
  estado?: string;
}

export interface AtomoEnUso extends Atomo {
  estado?: string;
}

export interface ParametroRef {
  atomoId: string;
  parametroId: string;
}

export interface Parametro {
  id: string;
  tipo: string;
  rango?: [number, number];
  valor?: number | string;
  unidad?: string;
}

export interface Operacion {
  tipo: "fijar" | "sumar" | "multiplicar" | "reemplazar" | "disparo";
  valor?: number | string;
  referencia?: ParametroRef;
}

export interface Cambio {
  atomoId: string;
  parametroId: string;
  antes?: number | string;
  despues?: number | string;
  acotado?: boolean;
  tipo: string;
}

export interface Molecula {
  id: string;
  titulo: string;
  ambito: Ambito;
  capas: Capa[];
  atomos: Atomo[];
  valores: Record<string, number | string>;
  version: number;
  creadaEn: number;
  actualizadaEn: number;
}

export function aplicarOperacion(
  valores: Record<string, number | string>,
  p: Parametro,
  op: Operacion
): { valores: Record<string, number | string>; cambio?: Cambio } {
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
