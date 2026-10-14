/**
 * Protomolécula · ALMACÉN DE VÍNCULOS. Persistencia local por molécula.
 * Almacén inyectable y try/catch como en F0C (almacen-moleculas.ts).
 */

import type { EstadoVinculo } from "./vinculos-control";

export const PREFIJO_VINCULOS = "starseed.protomolecula.vinculos.v1:";

/**
 * Almacén local inyectable (igual que en almacen-moleculas.ts).
 */
export interface AlmacenLocal {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/**
 * Crea un enrutador que procesa mensajes MIDI y los convierte en operaciones
 * sobre los parámetros vinculados.
 * 
 * Por cada mensaje busca los vínculos con esa claveFuente,
 * llama a `procesar` conservando el `EstadoVinculo` de cada uno
 * y pasa la operación a `controlador.mover` (origen `midi`).
 */
export function crearEnrutador({
  vinculos,
  parametroDe,
  controlador,
  autor,
  ahora,
  nuevoId
}: {
  vinculos: Vinculo[]; // Vinculos de la molécula actual
  parametroDe: (ref: ParametroRef) => Parametro | undefined; // Función para obtener parámetro por referencia
  controlador: {
    mover: (op: Operacion) => void; // Método para aplicar operaciones
  };
  autor: Autor; // Autor de las operaciones
  ahora: number; // Timestamp actual
  nuevoId: () => string; // Función para generar nuevos IDs
}): (mensaje: { fuente: FuenteControl; bruto: number }) => void {
  
  // Estado de cada vínculo (claveFuente → EstadoVinculo)
  const estados = new Map<string, EstadoVinculo>();
  
  // Inicializar estados para todos los vínculos
  for (const v of vinculos) {
    const clave = claveFuente(v.fuente);
    estados.set(clave, estadoInicial());
  }
  
  return (mensaje: { fuente: FuenteControl; bruto: number }) => {
    const clave = claveFuente(mensaje.fuente);
    const vinculosParaEsteMensaje = vinculos.filter(v => claveFuente(v.fuente) === clave);
    
    if (vinculosParaEsteMensaje.length === 0) return; // No hay vínculos para este mensaje
    
    // Procesar cada vínculo que coincida con el mensaje
    for (const v of vinculosParaEsteMensaje) {
      const parametro = parametroDe(v.objetivo);
      if (!parametro) continue; // Saltar si no encontramos el parámetro
      
      const estadoActual = estados.get(clave) ?? estadoInicial();
      const contexto: ContextoVinculo = {
        autor,
        ahora,
        id: nuevoId()
      };
      
      const { operacion, estado } = procesar(v, parametro, estadoActual, mensaje.bruto, contexto);
      
      // Actualizar el estado del vínculo
      estados.set(clave, estado);
      
      // Si hay una operación, pasarla al controlador
      if (operacion) {
        controlador.mover(operacion);
      }
    }
  };
}