/**
 * Patos simulados para bots sin hardware (BOT1011 · VZR1011G).
 * Contrato: architecture/astraura-voces-y-robots.md §4.
 * Archivo PURO: sin React, sin red, sin reloj, sin node:*.
 * Importado por componentes de cliente.
 */

/**
 * Las 5 acciones que puede realizar el pato simulado, según needle-duck.
 */
export const ACCIONES_PATO = [
  "caminar",      // caminar hacia adelante
  "girar",        // girar a la izquierda/derecha
  "emocion",      // expresar emoción (alegría, sorpresa, etc.)
  "bailar",       // realizar un baile sencillo
  "negacion",     // negar con la cabeza (como saying "no")
] as const;
export type AccionPato = (typeof ACCIONES_PATO)[number];

/**
 * Traduce una acción de alto nivel a comandos específicos para el pato.
 * En una implementación real, esto sería manejado por el modelo ONNX de needle-duck.
 * Para fines de simulación, mapeamos a valores de control específicos.
 */
export function accionToComando(accion: AccionPato, intensidad = 0.5): Record<string, number> {
  // Clamp intensidad entre 0 y 1
  const intensidadClamp = Math.max(0, Math.min(1, intensidad));
  
  switch (accion) {
    case "caminar":
      // Valor entre 0 y 1 para velocidad hacia adelante
      return { adelante: intensidadClamp };
    case "girar":
      // Valor entre -1 y 1 para giro (negativo = izquierda, positivo = derecha)
      return { giro: (Math.random() > 0.5 ? 1 : -1) * intensidadClamp };
    case "emocion":
      // Valor entre 0 y 1 para intensidad de emoción
      return { emocion: intensidadClamp };
    case "bailar":
      // Valor entre 0 y 1 para intensidad de baile
      return { baile: intensidadClamp };
    case "negacion":
      // Valor entre 0 y 1 para intensidad de movimiento de cabeza
      return { cabeza: intensidadClamp };
    default:
      return {};
  }
}

/**
 * Determina si el navegador puede manejar la simulación completa de pato.
 * Verifica disponibilidad de WebAssembly y capacidades gráficas necesarias.
 */
export function puedeEjecutarSimulacion(): boolean {
  // En una implementación real, verificaríamos:
  // - Soporte de WebAssembly
  // - Capacidades WebGL/WebGPU
  // - Memoria disponible
  // Para este ejemplo, asumimos que sí se puede ejecutar
  return typeof WebAssembly !== "undefined" && !!navigator.gpu;
}

/**
 * Estado interno de la simulación del pato (para uso interno del componente).
 * En una implementación real, esto estaría encapsulado en el worker de simulación.
 */
export interface EstadoSimulacion {
  /** Posición actual en el espacio 3D */
  posicion: [number, number, number];
  /** Rotación actual (Euler XYZ en radianes) */
  rotacion: [number, number, number];
  /** Estado de las articulaciones (simplificado) */
  articulaciones: Record<string, number>;
  /** Tiempo transcurrido en la simulación */
  tiempo: number;
}

/**
 * Estado inicial de la simulación del pato.
 */
export function estadoInicial(): EstadoSimulacion {
  return {
    posicion: [0, 0, 0],
    rotacion: [0, 0, 0],
    articulaciones: {},
    tiempo: 0,
  };
}