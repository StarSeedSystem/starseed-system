export interface Paquete {
  id: string;
  tamano: number;
  esPersistente: boolean;
}

export interface EstadoPaquetes {
  indice: Record<string, Paquete>;
  almacen: Set<string>; // IDs de binarios en disco
}

export interface ResultadoBorrado {
  exito: boolean;
  motivo?: string;
}

export interface ResumenEspacio {
  usado: number;
  tope: number;
  porPar: number;
  persistente: number;
}

/**
 * Quita un paquete del almacén y del índice.
 * Lógica pura: la interacción real con disco se inyecta o simula.
 */
export function quitarPaquete(
  id: string,
  estado: EstadoPaquetes,
  borrarBinario: (id: string) => boolean
): ResultadoBorrado {
  if (!estado.indice[id]) {
    return { exito: false, motivo: "No encontrado" };
  }

  // Regla: si el borrado del binario falla, deja la entrada
  if (!borrarBinario(id)) {
    return { exito: false, motivo: "Error al borrar binario" };
  }

  delete estado.indice[id];
  estado.almacen.delete(id);

  return { exito: true };
}

export function quitarTodos(
  estado: EstadoPaquetes,
  borrarBinario: (id: string) => boolean
): void {
  for (const id of Object.keys(estado.indice)) {
    quitarPaquete(id, estado, borrarBinario);
  }
}

export function resumenEspacio(
  estado: EstadoPaquetes,
  tope: number
): ResumenEspacio {
  let usado = 0;
  let persistente = 0;
  
  for (const p of Object.values(estado.indice)) {
    usado += p.tamano;
    if (p.esPersistente) persistente += p.tamano;
  }

  return {
    usado,
    tope,
    porPar: usado - persistente,
    persistente
  };
}
