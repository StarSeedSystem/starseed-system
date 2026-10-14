import type { Estacion } from "./tipos";

export interface CanalRele {
  alAbrir(callback: () => void): void;
  abrir(): void;
  abierto(): boolean;
  alRecibir(callback: (texto: string) => void): void;
  enviar(texto: string): void;
  cerrar(): void;
  oyentes?(): number | undefined;
}

function crearCanalRele(url: string, tema: string, WebSocketClass: typeof WebSocket): CanalRele {
  let instanciaWebSocket: any = null;
  const oyentesDePresencia: number[] = [];
  const callbacksDeApertura: (() => void)[] = [];
  const callbacksDeRecepcion: ((texto: string) => void)[] = [];
  let recuentoDeEnviados: string[] = [];
  let idDeReconexion: ReturnType<typeof setTimeout> | null = null;

  function abrirWebSocket() {
    if (instanciaWebSocket) {
      instanciaWebSocket.cerrar?.();
    }
    const urlConTema = `${url}?tema=${encodeURIComponent(tema)}`;
    instanciaWebSocket = new WebSocketClass(urlConTema);
    instanciaWebSocket.agregarEventoListener("open", () => {
      callbacksDeApertura.forEach(cb => cb());
    });
    instanciaWebSocket.agregarEventoListener("message", (evento: any) => {
      const datos = evento.data;
      if (datos && typeof datos === "string") {
        try {
          const msg = JSON.parse(datos);
          if (msg.t === "rele") {
            const n = Number(msg.n);
            if (!Number.isNaN(n)) {
              oyentesDePresencia.push(n);
            }
          } else if (msg.t === "est") {
            callbacksDeRecepcion.forEach(cb => cb(datos));
          }
        } catch {
          // Plain text messages (non-JSON) are not delivered to listeners
        }
      }
    });
    instanciaWebSocket.agregarEventoListener("close", () => {
      instanciaWebSocket = null;
      agendarReconexion();
    });
  }

  function agendarReconexion() {
    if (idDeReconexion) {
      clearTimeout(idDeReconexion);
    }
    const tiempoEspera = Math.pow(2, oyentesDePresencia.length) * 1000;
    idDeReconexion = setTimeout(() => {
      idDeReconexion = null;
      abrirWebSocket();
    }, tiempoEspera);
  }

  function cerrar() {
    if (idDeReconexion) {
      clearTimeout(idDeReconexion);
      idDeReconexion = null;
    }
    if (instanciaWebSocket) {
      instanciaWebSocket.cerrar?.();
      instanciaWebSocket = null;
    }
    callbacksDeApertura.length = 0;
    callbacksDeRecepcion.length = 0;
    recuentoDeEnviados = [];
    oyentesDePresencia.length = 0;
  }

  abrirWebSocket();

  return {
    alAbrir(callback) {
      if (instanciaWebSocket && instanciaWebSocket.listening) {
        callback();
      }
      callbacksDeApertura.push(callback);
    },
    abrir() {
      if (!instanciaWebSocket) {
        abrirWebSocket();
      }
    },
    abierto() {
      return !!(instanciaWebSocket && instanciaWebSocket.listening);
    },
    alRecibir(callback) {
      callbacksDeRecepcion.push(callback);
    },
    enviar(texto: string) {
      if (instanciaWebSocket && instanciaWebSocket.listening) {
        instanciaWebSocket.enviar?.(texto);
        recuentoDeEnviados.push(texto);
      }
    },
    cerrar,
    oyentes() {
      return oyentesDePresencia.length;
    },
  };
}

export { crearCanalRele };