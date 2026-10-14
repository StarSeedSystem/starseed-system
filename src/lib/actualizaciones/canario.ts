export interface NeuronaCandidata {
  id: string;
  online: boolean;
  usoReciente: number;
  elegida?: boolean;
}

export function elegirCanaria(ns: readonly NeuronaCandidata[]): string | null {
  // TODO: implement
  return null;
}

export interface ResultadoHumo {
  paginaCarga: boolean;
  servicios: Record<string, boolean>;
}

export function evaluarHumo(r: ResultadoHumo): { ok: boolean; fallos: string[] } {
  // TODO: implement
  return { ok: true, fallos: [] };
}

export type EstadoDespliegue = 
  | "pendiente"
  | "canaria"
  | "propagando"
  | "hecho"
  | "revirtiendo"
  | "revertido";

export type EventoDespliegue =
  | { tipo: "aplicada-en-canaria" }
  | { tipo: "humo"; ok: boolean }
  | { tipo: "propagada" }
  | { tipo: "revertida" };

export function siguienteEstado(e: EstadoDespliegue, ev: EventoDespliegue): EstadoDespliegue {
  // TODO: implement
  return e;
}