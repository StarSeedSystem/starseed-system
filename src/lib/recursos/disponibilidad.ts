export type AnuncioDisponibilidad = {
  nodoId: string;
  elemento: string;
  offset: number;
  totalBits: number;
  mapa: string;
  t: number;
};

export type RegistroDisponibilidad = {
  bits: boolean[];
  t: number;
};

export type EstadoDisponibilidad = Record<string, Record<string, RegistroDisponibilidad>>;

export function codificar(tengo: boolean[]): string {
  return "";
}

export function decodificar(mapa: string, totalBits?: number): boolean[] {
  return [];
}

export function anuncio(
  nodoId: string,
  elemento: string,
  tengo: boolean[],
  t = Date.now(),
  maxBytes = 1024
): AnuncioDisponibilidad[] {
  return [];
}

export function fusionar(
  anuncios: AnuncioDisponibilidad[],
  estadoPrevio?: EstadoDisponibilidad
): EstadoDisponibilidad {
  return {};
}

export function quienTiene(
  elemento: string,
  indice: number,
  ahora = Date.now(),
  estado?: EstadoDisponibilidad,
  caducidadMs = 30000
): string[] {
  return [];
}

export function reiniciarEstadoGlobal(): void {}
