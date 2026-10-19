/**
 * Protomolécula · ADAPTADOR GAMEPAD (F6, contrato §4.4). Convierte el estado de un mando de videojuego
 * en `{ fuente, bruto }`, que es lo que recibe `vinculos-control.ts#procesar`.
 *
 * El acceso del navegador se INYECTA: este módulo nunca toca `navigator` por su cuenta. La interfaz
 * llama a `conectarGamepad(navigator, requestAnimationFrame)` SOLO cuando la persona pulsa «Conectar mandos»
 * (es ahí cuando el navegador pide el permiso) y, si no hay Gamepad API, enseña el motivo: no se finge ningún mando.
 * Hoy no hay ningún mando real conectado ni probado: las pruebas usan entradas simuladas.
 */
import type { FuenteControl } from "./vinculos-control";

export type FuenteGamepad = Extract<FuenteControl, { tipo: "gamepad" }>;
export interface MensajeGamepad { fuente: FuenteGamepad; bruto: number }
export interface EventoEstadoJuego { timestamp: number; estados: (Gamepad | null)[] }
export interface NavegadorGamepad { getGamepads?: () => (Gamepad | null)[] }
export type AnimacionFrame = (callback: FrameRequestCallback) => number;

/** Saber si hay Gamepad API sin pedir permiso (para pintar el botón o el motivo). */
export const hayGamepad = (nav?: NavegadorGamepad | null): boolean => 
  typeof nav?.getGamepads === "function";

export const SIN_GAMEPAD = "Este navegador no ofrece API de Gamepad";
export const SIN_PERMISO_GAMEPAD = "No hay permiso para usar mandos de videojuego en este sitio: actívalo en los ajustes del navegador";

/**
 * Solo al pulsar «Conectar mandos». 
 * Devuelve la función que lo desconecta todo; tras llamarla no llega nada más.
 */
export function conectarGamepad(
  nav: NavegadorGamepad | null,
  frame: AnimacionFrame,
  alMensaje: (m: MensajeGamepad) => void,
  alCambiarDispositivos?: (nombres: string[]) => void,
): () => void {
  const obtenerEstadoJuego = (): EventoEstadoJuego => {
    const gamepads = nav?.getGamepads ? nav.getGamepads() : [];
    return { timestamp: performance.now(), estados: gamepads };
  };

  let animacionFrameId: number | null = null;
  let estadoAnterior: Record<number, { axes: number[]; buttons: number[] }> = {};
  let indicesConectados: number[] = [];

  const enviarCambioDispositivos = () => {
    const nombres = indicesConectados
      .map((i) => {
        const gp = nav?.getGamepads ? nav.getGamepads()[i] : null;
        return gp ? gp.id : `Unknown ${i}`;
      })
      .filter((nombre): nombre is string => nombre !== null);
    alCambiarDispositivos?.(nombres);
  };

  const bucle = () => {
    const estadoActual = obtenerEstadoJuego();
    const { estados, timestamp } = estadoActual;

    // Detectar conexiones y desconexiones
    const indicesActuales: number[] = [];
    estados.forEach((gp, indice) => {
      if (gp) indicesActuales.push(indice);
    });

    const conectados = indicesActuales.filter((i) => !indicesConectados.includes(i));
    const desconectados = indicesConectados.filter((i) => !indicesActuales.includes(i));

    if (conectados.length > 0 || desconectados.length > 0) {
      indicesConectados = indicesActuales;
      enviarCambioDispositivos();
    }

    // Procesar cada gamepad conectado
    estados.forEach((gp, indice) => {
      if (!gp) return;

      // Ejes
      gp.axes.forEach((valor, eje) => {
        const estadoPrevio = estadoAnterior[indice];
        const ejePrev = estadoPrevio && estadoPrevio.axes ? estadoPrevio.axes[eje] : undefined;
        if (ejePrev === undefined || Math.abs(valor - ejePrev) > 1e-5) {
          // Eje cambió
          const fuente: FuenteGamepad = {
            tipo: "gamepad",
            control: "eje",
            numero: eje,
            indice,
          };
          alMensaje({ fuente, bruto: valor });
        }
      });

      // Botones
      gp.buttons.forEach((boton, indiceBoton) => {
        const estadoPrevio = estadoAnterior[indice];
        const botonPrev = estadoPrevio && estadoPrevio.buttons ? estadoPrevio.buttons[indiceBoton] : undefined;
        const valor = boton.pressed ? 1 : 0; // También podríamos usar boton.value for analógicos, pero la mayoría son digitales
        if (botonPrev === undefined || valor !== botonPrev) {
          const fuente: FuenteGamepad = {
            tipo: "gamepad",
            control: "boton",
            numero: indiceBoton,
            indice,
          };
          alMensaje({ fuente, bruto: valor });
        }
      });

      // Actualizar estado anterior para este gamepad
      if (!estadoAnterior[indice]) {
        estadoAnterior[indice] = { axes: [], buttons: [] };
      }
      estadoAnterior[indice].axes = gp.axes.slice();
      estadoAnterior[indice].buttons = gp.buttons.map((b) => b.pressed ? 1 : 0);
    });

    // Eliminar el estado de los gamepads desconectados
    Object.keys(estadoAnterior)
      .map(Number)
      .filter((indice) => !indicesActuales.includes(indice))
      .forEach((indice) => {
        delete estadoAnterior[indice];
      });

    // Solicitar el siguiente frame
    animacionFrameId = frame(bucle);
  };

  // Iniciar el bucle
  animacionFrameId = frame(bucle);

  // Función de desconexión
  return () => {
    if (animacionFrameId !== null) {
      cancelAnimationFrame(animacionFrameId);
      animacionFrameId = null;
    }
    estadoAnterior = {};
    indicesConectados = [];
  };
}