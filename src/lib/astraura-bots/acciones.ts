export interface Senso {
  id: string;
  nombre: string;
  descripcion: string;
  prioridad: number;
  canal: string;
}

export interface Accion {
  id: string;
  nombre: string;
  descripcion: string;
  ejecutor: string;
  entradas: Record<string, unknown>;
  salidas: Record<string, unknown>;
}

export const ACCIONES: Accion[] = [
  {
    id: "accion-leer-perfil",
    nombre: "Leer Perfil",
    descripcion: "Lee el perfil de una persona",
    ejecutor: "persona",
    entradas: { personaId: { tipo: "string" } },
    salidas: { perfil: { tipo: "object" } },
  },
  {
    id: "accion-escribir-perfil",
    nombre: "Escribir Perfil",
    descripcion: "Escribe el perfil de una persona",
    ejecutor: "persona",
    entradas: { perfil: { tipo: "object" } },
    salidas: { exito: { tipo: "boolean" } },
  },
  {
    id: "accion-leer-bots",
    nombre: "Leer Bots",
    descripcion: "Lee la lista de bots",
    ejecutor: "bot",
    entradas: {},
    salidas: { bots: { tipo: "array" } },
  },
];

export function accionPorId(id: string): Accion | undefined {
  return ACCIONES.find((a) => a.id === id);
}

export function accionParaEjecutor(ejecutor: string): Accion[] {
  return ACCIONES.filter((a) => a.ejecutor === ejecutor);
}
