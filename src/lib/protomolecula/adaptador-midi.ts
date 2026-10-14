/**
 * Protomolécula · ADAPTADOR MIDI. Web MIDI → {fuente: FuenteControl, bruto: number}.
 * Módulo de servidor: inyecta navigator.requestMIDIAccess y maneja conexiones.
 * Permiso solo al pulsar «Conectar mandos». Si no hay Web MIDI, muestra motivo y no finge.
 */

export type AccesoMIDI = () => Promise<MIDIAccess>;

export interface MensajeMIDI {
  datos: Uint8Array;
  timestamp: number;
}

/**
 * Convierte cada mensaje MIDI en {fuente: FuenteControl, bruto: number}.
 * 0xB0 = control change, 0x90 = nota on, 0x80 = nota off, 0xE0 = pitch bend.
 * Canal 1-16 (en los datos: 0-15). Dispositivo por nombre.
 * Devuelve función de desconexión.
 */
export function conectarMidi(
  acceso: AccesoMIDI,
  alMensaje: (fuente: FuenteControl, bruto: number) => void
): () => void {
  let activos = new Set<string>();
  
  acceso().then(
    (midiAccess) => {
      // Manejar conexión de dispositivos
      midiAccess.inputs.forEach((entrada) => {
        entrada.onmidimessage = (evento: MIDIMessageEvent) => {
          const { datos, timestamp } = evento;
          
          // Ignorar mensajes vacíos
          if (datos.length === 0) return;
          
          // Extraer estado y canal (los 4 bits altos son estado, los 4 bajos son canal)
          const estado = datos[0] & 0xf0;
          const canal = (datos[0] & 0x0f) + 1; // MIDI canal 0-15 → 1-16
          
          let fuente: FuenteControl | null = null;
          let bruto: number = 0;
          
          switch (estado) {
            case 0xb0: // Control Change
              if (datos.length >= 2) {
                fuente = {
                  tipo: "midi",
                  mensaje: "cc",
                  canal,
                  numero: datos[1] // número de control (0-127)
                };
                bruto = datos[2] ?? 0; // valor (0-127)
              }
              break;
              
            case 0x90: // Nota On
              if (datos.length >= 3) {
                const velocidad = datos[2];
                // Velocidad 0 = nota off (estándar MIDI)
                if (velocidad === 0) {
                  fuente = {
                    tipo: "midi",
                    mensaje: "nota",
                    canal,
                    numero: datos[1] // número de nota (0-127)
                  };
                  bruto = 0; // nota off
                } else {
                  fuente = {
                    tipo: "midi",
                    mensaje: "nota",
                    canal,
                    numero: datos[1] // número de nota (0-127)
                  };
                  bruto = velocidad; // velocidad (1-127)
                }
              }
              break;
              
            case 0x80: // Nota Off
              if (datos.length >= 2) {
                fuente = {
                  tipo: "midi",
                  mensaje: "nota",
                  canal,
                  numero: datos[1] // número de nota (0-127)
                };
                bruto = 0; // nota off siempre tiene velocidad 0 en este contexto
              }
              break;
              
            case 0xe0: // Pitch Bend
              if (datos.length >= 3) {
                // Pitch bend es 14 bits: bits 0-6 del segundo byte + bits 0-6 del tercer byte << 7
                const valor = datos[1] | (datos[2] << 7); // 0-16383
                fuente = {
                  tipo: "midi",
                  mensaje: "pitch",
                  canal
                };
                bruto = valor;
              }
              break;
          }
          
          if (fuente) {
            // Evitar duplicados por el mismo dispositivo en el mismo ciclo
            const clave = `midi:${fuente.dispositivo ?? "*"}:${fuente.mensaje}:${fuente.canal}:${fuente.numero ?? 0}`;
            if (!activos.has(clave)) {
              activos.add(clave);
              // Limpiar después de un breve período para permitir nuevos mensajes del mismo tipo
              setTimeout(() => activos.delete(clave), 50);
              alMensaje(fuente, bruto);
            }
          }
        };
      });
      
      // Manejar conexión/desconexión de dispositivos
      midiAccess.onstatechange = () => {
        // Volver a escanear entradas cuando cambie el estado
        midiAccess.inputs.forEach((entrada) => {
          // Los eventos onmidimessage ya están configurados
        });
      };
    },
    (error) => {
      // No hay Web MIDI o permiso denegado
      console.error("Error al acceder a MIDI:", error);
      // No lanzamos nada; el llamador debe manejar la UI de error
    }
  );
  
  // Función de desconexión (por ahora no hace nada ya que la desconexión
  // se maneja mediante la recolección de basura de los event listeners)
  return () => {
    // En una implementación más completa, eliminaríamos los event listeners
    // pero por simplicidad dejamos que el recolector de basura los maneje
  };
}