import type { FuenteControl } from "./vinculos-control";

/**
 * Conecta a los mandos MIDI y convierte cada mensaje en un objeto {fuente, bruto}.
 * @param acceso - El objeto MIDIAccess obtenido mediante navigator.requestMIDIAccess.
 * @param alMensaje - Callback que recibe {fuente: FuenteControl, bruto: number}.
 * @returns Función para desconectar y liberar recursos.
 */
export function conectarMidi(acceso: MIDIAccess, alMensaje: (obj: { fuente: FuenteControl; bruto: number }) => void): () => void {
  if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
    throw new Error("Web MIDI no disponible en este entorno");
  }

  // Store removal functions to clean up later
  const removals: (() => void)[] = [];

  const handleMessage = (event: MIDIMessageEvent) => {
    const [status, data1, data2] = event.data;
    const tipo = status & 0xF0;
    const canal = (status & 0x0F) + 1; // 1-16
    let fuente: FuenteControl | null = null;
    let bruto: number = 0;

    switch (tipo) {
      case 0x80: // note off
      case 0x90: // note on (velocity 0 = note off)
        fuente = {
          tipo: "midi",
          mensaje: "nota",
          canal,
          numero: data1, // note number
          dispositivo: event.port?.name ?? undefined,
        };
        bruto = data2; // velocity
        break;
      case 0xB0: // control change
        fuente = {
          tipo: "midi",
          mensaje: "cc",
          canal,
          numero: data1, // controller number
          dispositivo: event.port?.name ?? undefined,
        };
        bruto = data2; // value
        break;
      case 0xE0: // pitch bend
        fuente = {
          tipo: "midi",
          mensaje: "pitch",
          canal,
          // numero no aplica para pitch bend
          dispositivo: event.port?.name ?? undefined,
        };
        // 14-bit value: LSB (data1) + MSB (data2) << 7
        bruto = data1 + (data2 << 7);
        break;
      default:
        // ignore other messages (e.g., program aftertouch, etc.)
        return;
    }

    if (fuente) {
      alMensaje({ fuente, bruto });
    }
  };

  const handleStateChange = () => {
    // Remove existing listeners
    removals.forEach((rm) => rm());
    removals.length = 0;
    // Add listeners again
    acceso.inputs.forEach((port) => {
      port.addEventListener("midimessage", handleMessage);
      removals.push(() => port.removeEventListener("midimessage", handleMessage));
    });
  };

  // Initial connection
  acceso.inputs.forEach((port) => {
    port.addEventListener("midimessage", handleMessage);
    removals.push(() => port.removeEventListener("midimessage", handleMessage));
  });

  // Listen for state changes (device connect/disconnect)
  acceso.addEventListener("statechange", handleStateChange);
  removals.push(() => acceso.removeEventListener("statechange", handleStateChange));

  // Return disconnect function
  return () => {
    removals.forEach((rm) => rm());
    removals.length = 0;
    // Optionally close the access? MIDIAccess has no close method.
  };
}