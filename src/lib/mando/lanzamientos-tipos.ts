export interface LanzamientoEstado {
  fase: string;
  detalle: string;
  version: string;
  pasos: { fase: string; t: number; detalle: string }[];
  jobs: { medio: string; job: string; estado: string; url: string; inicio: string; fin: string }[];
  medios: Record<string, { estado: string; faltan: string[]; pequenos: string[] }>;
  run_url?: string;
  release_url?: string;
  historial: { t: number; tipo: string; version?: string }[];
  pausado: boolean;
  tono: string;
}

export interface MedioFila {
  id: string;
  titulo: string;
  formatos: { nombre: string; url: string }[];
  version: string;
  estado: string;
  detalle: string;
  accion: string;
}

export interface PeticionLanzamiento {
  accion: "lanzar" | "pausar" | "reanudar" | "reintentar" | "regenerar" | "auto";
  medio?: string;
  activo?: boolean;
}
