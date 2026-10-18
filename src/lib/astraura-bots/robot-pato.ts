/**
 * Bots/dots de Astraura · Adaptador para Open Duck Mini (robot-pato).
 * Contrato: architecture/astraura-voces-y-robots.md §4.
 *
 * Este módulo proporciona las implementaciones de las acciones del pato
 * para ser usadas por el adaptador de acciones de los bots.
 *
 * PuRO: sin React, sin red, sin `node:*`, sin reloj.
 */

export interface EstadoRobotPato {
  /** Posición actual en el plano (x, y) en metros. */
  posicion: { x: number; y: number };
  /** Orientación actual en radianes. */
  orientacion: number;
  /** Estado emocional actual (opcional). */
  emocion?: string;
}

/** Estado inicial del robot pato. */
export const ESTADO_INICIAL: EstadoRobotPato = {
  posicion: { x: 0, y: 0 },
  orientacion: 0,
};

/**
 * Acción de caminar.
 * @param args - Parámetros de la acción (actualmente ninguno).
 * @param estadoActual - Estado actual del robot.
 * @returns Nuevo estado del robot después de caminar.
 */
export function caminar(
  args: Record<string, unknown>,
  estadoActual: EstadoRobotPato
): EstadoRobotPato {
  // Por ahora, simulamos un movimiento hacia adelante de 0.5 metros en la dirección actual.
  const distancia = 0.5;
  const nuevaPosicion = {
    x: estadoActual.posicion.x + distancia * Math.cos(estadoActual.orientacion),
    y: estadoActual.posicion.y + distancia * Math.sin(estadoActual.orientacion),
  };
  return { ...estadoActual, posicion: nuevaPosicion };
}

/**
 * Acción de girar.
 * @param args - Parámetros de la acción (actualmente ninguno).
 * @param estadoActual - Estado actual del robot.
 * @returns Nuevo estado del robot después de girar.
 */
export function girar(
  args: Record<string, unknown>,
  estadoActual: EstadoRobotPato
): EstadoRobotPato {
  // Giramos 90 grados (π/2 radianes) en sentido horario.
  const angulo = Math.PI / 2;
  const nuevaOrientacion = estadoActual.orientacion + angulo;
  return { ...estadoActual, orientacion: nuevaOrientacion };
}

/**
 * Acción de emoción.
 * @param args - Parámetros de la acción (actualmente ninguno).
 * @param estadoActual - Estado actual del robot.
 * @returns Nuevo estado del robot después de mostrar emoción.
 */
export function emocion(
  args: Record<string, unknown>,
  estadoActual: EstadoRobotPato
): EstadoRobotPato {
  // Cambiamos el estado emocional a "alegre" como ejemplo.
  return { ...estadoActual, emocion: "alegre" };
}

/**
 * Acción de bailar.
 * @param args - Parámetros de la acción (actualmente ninguno).
 * @param estadoActual - Estado actual del robot.
 * @returns Nuevo estado del robot después de bailar.
 */
export function bailar(
  args: Record<string, unknown>,
  estadoActual: EstadoRobotPato
): EstadoRobotPato {
  // Bailar: giramos en círculo completo (2π radianes) y retornamos a la orientación original.
  // Simulamos un baile que deja al robot en la misma posición y orientación.
  return estadoActual;
}

/**
 * Acción de negar con la cabeza.
 * @param args - Parámetros de la acción (actualmente ninguno).
 * @param estadoActual - Estado actual del robot.
 * @returns Nuevo estado del robot después de negar.
 */
export function negacion(
  args: Record<string, unknown>,
  estadoActual: EstadoRobotPato
): EstadoRobotPato {
  // Negar: movemos la cabeza de un lado a otro y retornamos a la posición original.
  // No cambia la posición ni orientación del cuerpo.
  return estadoActual;
}

/**
 * Acción de alto (detener cualquier movimiento inmediato).
 * @param args - Parámetros de la acción (actualmente ninguno).
 * @param estadoActual - Estado actual del robot.
 * @returns Estado del robot sin cambios (el alto se aplica en el nivel de movimiento).
 */
export function alto(
  args: Record<string, unknown>,
  estadoActual: EstadoRobotPato
): EstadoRobotPato {
  // El alto detiene cualquier movimiento en curso, pero no cambia la posición ni orientación actual.
  // En esta simulación, no tenemos movimiento en curso, así que retornamos el estado actual.
  return estadoActual;
}