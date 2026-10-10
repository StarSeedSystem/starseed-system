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
