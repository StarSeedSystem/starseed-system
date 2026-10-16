/**
 * Protomolécula · ADAPTADOR MIDI. Web MIDI → {fuente: FuenteControl, bruto: number}.
 * Módulo puro de lógica: quien provee navigator.requestMIDIAccess llama a conectarMidi.
 * No hay acceso directo a dispositivos ni reloj.
 */
import type { FuenteControl } from "./vinculos-control";

/** Callback que recibe cada mensaje MIDI convertido. */
export type AlMidiMensaje = (datos: { fuente: FuenteControl; bruto: number }) => void;

/** Resultado de conectarMidi: función para desconectar y liberar recursos. */
export type DesconectarMidi = () => void;

/**
 * Conecta al sistema MIDI y convierte cada mensaje en {fuente, bruto}.
 * @param acceso - Acceso MIDI inyectado (navigator.requestMIDIAccess)
 * @param alMensaje - Callback para cada mensaje convertido
 * @return Función para desconectar y liberar recursos
 */
export function conectarMidi(
  acceso: MIDIAccess,
  alMensaje: AlMidiMensaje
): DesconectarMidi {
  const manejadores: Array<() => void> = [];

  const handleMessage = (event: MIDIMessageEvent) => {
    const [comando, dato1, dato2] = event.data;
    const canal = (comando & 0x0f) + 1; // MIDI channels are 0-15, we want 1-16
    const comandoTipo = comando & 0xf0;

    let fuente: FuenteControl | null = null;
    let bruto: number = 0;

    switch (comandoTipo) {
      case 0x80: // Note off
      case 0x90: // Note on
        fuente = {
          tipo: "midi",
          mensaje: comandoTipo === 0x90 ? "nota" : "nota",
          canal,
          numero: dato1
        };
        bruto = dato2; // velocity
        // Velocity 0 in note on is treated as note off
        if (comandoTipo === 0x90 && dato2 === 0) {
          fuente.mensaje = "nota"; // still note, but velocity 0 means off
        }
        break;

      case 0xB0: // Control change
        fuente = {
          tipo: "midi",
          mensaje: "cc",
          canal,
          numero: dato1
        };
        bruto = dato2;
        break;

      case 0xE0: // Pitch bend
        fuente = {
          tipo: "midi",
          mensaje: "pitch",
          canal
        };
        // 14-bit value: dato1 (LSB) + (dato2 << 7) (MSB)
        bruto = dato1 + (dato2 << 7);
        break;

      default:
        // Ignore other messages (sysex, etc.)
        return;
    }

    if (fuente) {
      // Add device name if available
      if (event.target && typeof (event.target as any).name === "string") {
        fuente.dispositivo = (event.target as any).name;
      }

      alMensaje({ fuente, bruto });
    }
  };

  const handleConnect = (event: MIDIConnectionEvent) => {
    // Optional: could log or handle connection events
    const port = event.port;
    // We could update device names in our fuentes, but for simplicity
    // we'll get the name when a message arrives
  };

  // Add listeners
  acceso.addEventListener("statechange", handleConnect);
  acceso.inputs.forEach((port) => {
    port.addEventListener("midimessage", handleMessage);
    manejadores.push(() => port.removeEventListener("midimessage", handleMessage));
  });

  // Handle future port connections
  const handleInput = (event: MIDIConnectionEvent) => {
    event.port.addEventListener("midimessage", handleMessage);
    manejadores.push(() => event.port.removeEventListener("midimessage", handleMessage));
  };
  acceso.addEventListener("connect", handleInput);

  // Return disconnection function
  return () => {
    acceso.removeEventListener("statechange", handleConnect);
    acceso.removeEventListener("connect", handleInput);
    acceso.inputs.forEach((port) => {
      port.removeEventListener("midimessage", handleMessage);
    });
    manejadores.forEach((desconectar) => desconectar());
  };
}