import type { Vinculo, FuenteControl } from "./vinculos-control";
import { procesar, claveFuente, estadoInicial } from "./vinculos-control";
import type { EstadoVinculo } from "./vinculos-control";
import type { Operacion, Parametro, Autor } from "./tipos";

/**
 * Almacenamiento local de vínculos por molécula.
 * La clave tiene el formato: starseed.protomolecula.vinculos.v1:<moleculaId>
 * El almacenamiento se inyecta (similar a F0C) y se envuelve en try/catch.
 */

const PREFIJO_VINCULOS = "starseed.protomolecula.vinculos.v1:";

/** Obtiene los vínculos guardados para una molécula. */
export function obtenerVinculos(moleculaId: string, almacen: Storage): Vinculo[] {
  try {
    const crudo = almacen.getItem(PREFIJO_VINCULOS + moleculaId);
    if (crudo === null) return [];
    const parsed: unknown = JSON.parse(crudo);
    if (!Array.isArray(parsed)) return [];
    // Filtrar solo aquellos que tengan la estructura esperada (opcional)
    return parsed as Vinculo[];
  } catch {
    return [];
  }
}

/** Guarda los vínculos para una molécula. */
export function guardarVinculos(moleculaId: string, vinculos: Vinculo[], almacen: Storage): void {
  try {
    almacen.setItem(PREFIJO_VINCULOS + moleculaId, JSON.stringify(vinculos));
  } catch {
    // En caso de error, no hacemos nada (silencioso como en F0C)
  }
}

/**
 * Crea un enrutador que, dado un mensaje MIDI, busca los vínculos correspondientes,
 * los procesa y envía las operaciones al controlador.
 */
export type CrearEnrutadorParams = {
  vinculos: Vinculo[];
  parametroDe: (ref: { atomoId: string; parametroId: string }) => Parametro;
  controlador: { mover: (op: Operacion) => void };
  autor: Autor;
  ahora: number;
  nuevoId: () => string;
};

export function crearEnrutador({ vinculos, parametroDe, controlador, autor, ahora, nuevoId }: CrearEnrutadorParams) {
  // Estado interno de cada vínculo (suavizado, último valor, etc.)
  const estados = new Map<string, EstadoVinculo>();

  /**
   * Procesa un mensaje MIDI y devuelve una función de desconexión (no-op en esta implementación).
   * En un entorno real, se desconectaría de los puertos MIDI.
   */
  const manejarMensaje = (mensaje: { fuente: FuenteControl; bruto: number }) => {
    const clave = claveFuente(mensaje.fuente);
    for (const vinculo of vinculos) {
      if (!vinculo.activo) continue;
      if (claveFuente(vinculo.fuente) !== clave) continue;

      const estadoActual = estados.get(vinculo.id) ?? estadoInicial();
      const parametro = parametroDe(vinculo.objetivo);
      const { operacion, estado: nuevoEstado } = procesar(
        vinculo,
        parametro,
        estadoActual,
        mensaje.bruto,
        { autor, ahora: Date.now(), id: nuevoId() }
      );

      if (operacion !== null) {
        controlador.mover(operacion);
      }

      estados.set(vinculo.id, nuevoEstado);
    }
  };

  // En un entorno de prueba, no hay hardware real que conectar.
  // Esta función se llamará desde el exterior con mensajes simulados.
  // Devolvemos una función de desconexión que no hace nada.
  return () => {
    // No hay recursos que liberar en esta simulación.
  };
}