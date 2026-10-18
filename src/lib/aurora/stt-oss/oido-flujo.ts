"use client";
// StarSeed OS - Oído en flujo para Phonon-2 (WebSocket /v1/audio/stream)
export type OidoFlujoCallback = (texto: string) => void;
export type OidoFlujoCierreCallback = (error: Event | null) => void;

export interface OidoFlujoSalida {
  /** Envía una trama de audio PCM16 (Int16Array) al servidor. */
  enviar: (pcm: Int16Array) => void;
  /** Cierra la conexión de forma graceful. */
  terminar: () => void;
  /** Cancela la conexión (por error o interrupción). */
  cancelar: () => void;
}
 // Abre un flujo de oído hacia el servidor Phonon-2.
export function abrirFlujoOido(
  url: string,
  WebSocketImpl: { new (url: string): WebSocket },
  alParcial: OidoFlujoCallback,
  alFinal: OidoFlujoCallback,
  alCerrar: OidoFlujoCierreCallback
): OidoFlujoSalida {
  let ws: WebSocket | null = null;
  let estaActivo = false;
    const float32ToPcm16 = (input: Float32Array): Int16Array => {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      let s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Int16Array(buffer);
   };
    const resampleLinear = (input: Float32Array, fromRate: number, toRate: number): Float32Array => {
    if (fromRate === toRate || input.length === 0) return input;
    const ratio = fromRate / toRate;
    const outLength = Math.max(1, Math.floor(input.length / ratio));
    const output = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const frac = pos - i0;
      output[i] = input[i0] * (1 - frac) + input[i1] * frac;
    }
    return output;
  };

  const conectar = () => {
    ws = new WebSocketImpl(url);
    estaActivo = true;

    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      // Conexión abierta, listo para enviar
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // El servidor debería enviar JSON, pero por si acaso manejamos solo texto
        return;
      }
      if (typeof event.data === "string") {
        try {
          const data = JSON.parse(event.data);
          // Mensajes tolerantes: campos type/text o partial/final/done
          let texto = "";
          if (data.type === "partial" || data.partial !== undefined) {
            texto = data.type === "partial" ? data.text || data.partial : data.partial || "";
            if (texto) alParcial(texto);
          }
          if (data.type === "final" || data.final !== undefined) {
            texto = data.type === "final" ? data.text || data.final : data.final || "";
            if (texto) alFinal(texto);
          }
          // Si se indica done, podemos considerar el flujo terminado por el servidor
          if (data.done) {
            // El servidor cierra, nosotros también
            terminar();
          }
        } catch (e) {
          // Ignorar mensajes malformados
        }
      }
    };

    ws.onerror = (error) => {
      alCerrar(error);
    };

    ws.onclose = (event) => {
      estaActivo = false;
      ws = null;
      alCerrar(event);
    };
  };

  conectar();

  return {
    enviar: (pcm: Int16Array) => {
      if (!estaActivo || !ws) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(pcm.buffer);
      }
    },
    terminar: () => {
      if (ws) {
        ws.close();
        ws = null;
      }
      estaActivo = false;
    },
    cancelar: () => {
      if (ws) {
        ws.close(1000, "Cancelado por usuario");
        ws = null;
      }
      estaActivo = false;
    }
  };
}