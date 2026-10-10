/*
 * serie-nativa — la radio LoRa enchufada por USB, dentro de la app nativa (2026-10-10).
 * Contrato: architecture/apps-nativas-segundo-plano.md §3.2.
 *
 * WKWebView, WebKitGTK y el WebView de Android no traen Web Serial. La app abre el puerto en Rust
 * (native/src-tauri/src/serie.rs) y manda los bytes por el evento `starseed://serie`. Aquí se
 * envuelven en un objeto con la forma de un `SerialPort` (open / readable / writable / close),
 * para dárselo TAL CUAL a `TransportWebSerial.createFromPort` de @meshtastic: mismo decodificador
 * que en Chrome, nada reescrito. Sin Node; el puente se inyecta para probarlo.
 */

import { puenteNativo, type PuenteNativo } from "./puente";

type PuenteSerie = Pick<PuenteNativo, "serieAbrir" | "serieEscribir" | "serieCerrar" | "alRecibirSerie" | "alCerrarSerie">;

export interface PuertoSerieNativo {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(opciones?: { baudRate?: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): { ruta: string };
}

export function crearPuertoSerieNativo(ruta: string, puente: PuenteSerie = puenteNativo()): PuertoSerieNativo {
  let quitarDatos: (() => void) | null = null;
  let quitarCierre: (() => void) | null = null;
  let control: ReadableStreamDefaultController<Uint8Array> | null = null;
  let cerrado = false;

  const soltar = () => {
    quitarDatos?.();
    quitarCierre?.();
    quitarDatos = quitarCierre = null;
  };
  const terminarLectura = () => {
    if (cerrado) return;
    cerrado = true;
    try {
      control?.close();
    } catch {
      /* ya cerrada */
    }
  };

  const puerto: PuertoSerieNativo = {
    readable: null,
    writable: null,
    getInfo: () => ({ ruta }),
    async open(opciones) {
      cerrado = false;
      puerto.readable = new ReadableStream<Uint8Array>({
        start(c) {
          control = c;
        },
        cancel() {
          terminarLectura();
        },
      });
      // Escuchar ANTES de abrir: los primeros bytes de la radio no se pierden.
      quitarDatos = await puente.alRecibirSerie((b) => {
        if (!cerrado) control?.enqueue(b);
      });
      quitarCierre = await puente.alCerrarSerie((r) => {
        if (!r || r === ruta) terminarLectura();
      });
      const r = await puente.serieAbrir(ruta, opciones?.baudRate ?? 115200);
      if (!r.ok) {
        soltar();
        terminarLectura();
        throw new Error(r.motivo);
      }
      puerto.writable = new WritableStream<Uint8Array>({
        async write(trozo) {
          const w = await puente.serieEscribir(trozo);
          if (!w.ok) throw new Error(w.motivo);
        },
      });
    },
    async close() {
      soltar();
      terminarLectura();
      await puente.serieCerrar();
    },
  };
  return puerto;
}

/**
 * Transporte Meshtastic completo sobre la radio USB nativa. Lo usa el adaptador de malla cuando
 * corre dentro de la app (src/ai/astraura/mesh/meshtastic-adapter.ts, tarea del enjambre).
 */
export async function crearTransporteMeshtasticNativo(ruta: string, baudios = 115200, puente?: PuenteSerie) {
  const { TransportWebSerial } = await import("@meshtastic/transport-web-serial");
  const puerto = crearPuertoSerieNativo(ruta, puente);
  return TransportWebSerial.createFromPort(puerto as unknown as Parameters<typeof TransportWebSerial.createFromPort>[0], baudios);
}
