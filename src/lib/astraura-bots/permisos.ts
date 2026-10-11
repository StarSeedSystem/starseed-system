export interface Permiso {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: "lectura" | "escritura" | "ejecucion";
}

export const PERMISOS: Permiso[] = [
  {
    id: "permiso-leer",
    nombre: "Leer",
    descripcion: "Permiso para leer datos",
    tipo: "lectura",
  },
  {
    id: "permiso-escribir",
    nombre: "Escribir",
    descripcion: "Permiso para escribir datos",
    tipo: "escritura",
  },
  {
    id: "permiso-ejecutar",
    nombre: "Ejecutar",
    descripcion: "Permiso para ejecutar acciones",
    tipo: "ejecucion",
  },
];

export function permisoPorId(id: string): Permiso | undefined {
  return PERMISOS.find((p) => p.id === id);
}

export function tienePermiso(usuarioPermisos: string[], permisoRequerido: string): boolean {
  return usuarioPermisos.includes(permisoRequerido);
}
