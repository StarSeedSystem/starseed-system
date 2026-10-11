export interface Persona {
  id: string;
  nombre: string;
  rol: string;
  habilidades: string[];
}

export interface Bot {
  id: string;
  personaId: string;
  nombre: string;
  personalidad: Record<string, number>;
  sentido: string;
}

export interface Criterio {
  id: string;
  descripcion: string;
  peso: number;
}

export interface Paso {
  id: string;
  descripcion: string;
  responsableId: string;
}

export interface Tarea {
  id: string;
  titulo: string;
  descripcion: string;
  director: string;
  origen: string;
  criterios: Criterio[];
  pasos: Paso[];
  verificaciones: EstadoVerificacion[];
}

export interface EstadoVerificacion {
  verifId: string;
  criterioId: string;
  porTipo: "persona" | "bot" | "pruebas";
  porId: string;
  ok: boolean;
  evidencia: string;
}

export type EstadoTarea = "en-curso" | "verificando" | "hecha";

export interface Permiso {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: "lectura" | "escritura" | "ejecucion";
}

export interface Accion {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: "sentido" | "accion" | "tarea";
  ejecutor: string;
}

export interface RepartoModelo {
  id: string;
  nombre: string;
  descripcion: string;
  parametros: Record<string, unknown>;
}

export interface Bucle {
  id: string;
  nombre: string;
  descripcion: string;
  iteraciones: number;
  delay: number;
}
