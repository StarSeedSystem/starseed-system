import type { CapacidadAmbito } from "./ambito";

export interface TareaOla {
  id: string;
  ola: string;
  titulo: string;
  dependencias: string[];
  archivos?: string[];
  descripcion?: string;
  tipo?: "analisis";
}

export interface Ola {
  nombre: string;
  tareas: TareaOla[];
}

export interface Autor {
  id: string;
  nombre: string;
}

export type EstadoPropuesta = "abierta" | "aprobada" | "rechazada" | "caducada";

export interface Propuesta {
  capacidad: CapacidadAmbito;
  estado: EstadoPropuesta;
  venceMs?: number;
}

export function necesitaVotacion(
  ambitoModoGobierno: "jerarquico" | "democratico",
  capacidad: CapacidadAmbito,
  estaAprobada: boolean = false,
): boolean {
  if (ambitoModoGobierno !== "democratico") return false;
  if (estaAprobada) return false;

  const capacidadesRequierenVotacion: CapacidadAmbito[] = [
    "lanzar-olas",
    "publicar",
    "gestionar-motores",
    "usar-apis",
  ];

  return capacidadesRequierenVotacion.includes(capacidad);
}

export function propuestaDeOla(
  ambito: string,
  ola: Ola,
  autor: Autor,
): { titulo: string; descripcion: string } {
  const numTareas = ola.tareas.length;
  const archivosTocados = new Set<string>();

  ola.tareas.forEach(tarea => {
    if (tarea.archivos) {
      tarea.archivos.forEach(archivo => archivosTocados.add(archivo));
    }
  });

  const tieneProveedoresPago = false;

  const titulo = `Propuesta de ola ${ola.nombre}`;
  const descripcion = 
    `Propuesta para lanzar la ola ${ola.nombre} con ${numTareas} tarea(s).\n\n` +
    `Archivos tocados: ${archivosTocados.size > 0 ? Array.from(archivosTocados).join(", ") : "ninguno"}.\n` +
    `Usa proveedores de pago: ${tieneProveedoresPago ? "sí" : "no"}.\n\n` +
    `Propuesto por ${autor.nombre}.\n\n` +
    `La opción democrática siempre está disponible: este cambio se aplicará automáticamente si la mayoría lo aprueba.`;

  return { titulo, descripcion };
}

export function capacidadesAprobadas(
  propuestas: Propuesta[],
  ahoraMs: number,
): CapacidadAmbito[] {
  return propuestas
    .filter(p => p.estado === "aprobada" && (!p.venceMs || p.venceMs > ahoraMs))
    .map(p => p.capacidad);
}
