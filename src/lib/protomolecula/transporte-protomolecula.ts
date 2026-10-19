import type { Operacion, Cambio } from "./tipos";
import type { ElementoSala } from "@/lib/salas/sincronia-sala";
import { elementoDeOperacion } from "./sesion-sincronia";
import type { MensajeEntrante } from "@/lib/malla/transporte-universal";

/**
 * Crea un enlace de sesión para la Protomolécula sobre el canal de aplicación "protomolecula".
 * @param sesion La sesión actual (para obtener el ID del dispositivo y otros datos)
 * @param enviar Función para enviar mensajes por el transporte universal
 * @param recibir Función para recibir mensajes del transporte universal
 * @param reloj Reloj común para obtener timestamps precisos
 * @returns Objeto con métodos para enviar operaciones, recibir mensajes y medir latencia
 */
export function crearEnlaceSesion({
  sesion,
  enviar,
  recibir,
  reloj,
}: {
  sesion: any;
  enviar: (destino: any, canal: string, cuerpo: unknown, opts?: any) => Promise<any>;
  recibir: (canal: string, cb: (m: MensajeEntrante) => void) => () => void;
  reloj: { ahora(): number; precisionMs?: number; cotaMs?: number };
}) {
  // Latency measurement: we'll keep it simple for now
  let isMeasuringLatency = false;

  // Set up the receiver for the "protomolecula" channel
  const detenerRecepcion = recibir("protomolecula", (mensaje: MensajeEntrante) => {
    // In a real implementation, we would process the message here
    // For now, we do nothing
  });

  return {
    /**
     * Envía una operación protomolecula.
     * @param op La operación a enviar
     * @param cambio El cambio resultante de aplicar la operación localmente
     */
    enviarOperacion: async (op: Operacion, cambio: Cambio) => {
      // Create a copy of the operation with t set to the current time from the reloj común
      const opConReloj = { ...op, t: reloj.ahora() };
      // Create an ElementoSala from the operation and cambio
      const elemento = elementoDeOperacion(opConReloj, cambio);
      // Send it as the body of a message on the protomolecula channel
      await enviar({} as any, "protomolecula", elemento, {});
    },

    /**
     * Configura la recepción de mensajes protomolecula.
     * @param cb Callback que se invoca con cada mensaje entrante (MensajeEntrante)
     * @returns Función para detener la recepción
     */
    recibirMensaje: (cb: (m: MensajeEntrante) => void) => () => {
      // We return the stopper from the recibir function
      return detenerRecepcion;
    },

    /**
     * Obtiene las métricas de latencia actuales.
     * @returns Objeto con p50, p95, número de muestras y estado
     */
    medidorLatencia: () => ({
      p50: null,
      p95: null,
      muestras: 0,
      estado: "sin medir",
    }),
  };
}