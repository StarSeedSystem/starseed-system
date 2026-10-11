"use client";

import type { CanalEstacion } from "./sesion-en-vivo";

/**
 * Canal de relé propio para estaciones en vivo mediante WebSocket.
 * Se conecta a un servidor de relé que redistribuye mensajes de estaciones.
 */
export function crearCanalRele(
  url: string,
  tema: string,
  WS: typeof WebSocket = globalThis.WebSocket,
  timers: { poner: typeof setTimeout; quitar: typeof clearTimeout } = {
    poner: globalThis.setTimeout.bind(globalThis),
    quitar: globalThis.clearTimeout.bind(globalThis),
  }
): CanalEstacion {
  const wsUrl = `${url}?tema=${encodeURIComponent(tema)}`;
   let ws: InstanceType<typeof WS> | null = null;
   let reconnectTimeout: number | null = null;
   let reconnectDelay = 1000; // starts at 1s, doubles up to 30s
   const MAX_DELAY = 30_000;
   let closed = false;
   const openListeners = new Set<() => void>();
   const messageListeners = new Set<(texto: string) => void>();
   let isOpen = false;
   let listenersCount = 0; // from {"t":"rele","n":k} messages

  function connect() {
    if (ws) {
      ws.close();
    }
    ws = new WS(wsUrl);
     ws.onopen = () => {
       isOpen = true;
       reconnectDelay = 1000; // reset delay on successful connection
       Array.from(openListeners).forEach(cb => cb());
     };
    ws.onclose = () => {
      isOpen = false;
      // Schedule reconnection unless we are closing intentionally
      if (reconnectTimeout === null) {
        // Only schedule if we are not in the process of closing (cerrar sets a flag)
        // We'll handle closing via a separate flag
        scheduleReconnect();
      }
    };
     ws.onmessage = (event) => {
       const texto = event.data;
       if (typeof texto !== "string") return;
       // Handle presence messages: {"t":"rele","n":k}
       if (texto.startsWith('{"t":"rele"')) {
         try {
           const data = JSON.parse(texto);
           if (typeof data.n === "number") {
             listenersCount = data.n;
           }
         } catch {
           // ignore malformed presence messages
         }
         return; // do not pass presence messages to alRecibir
       }
       // Only pass messages that start with '{"t":"est"' to alRecibir
       if (texto.startsWith('{"t":"est"')) {
         Array.from(messageListeners).forEach(cb => cb(texto));
       }
     };
    ws.onerror = (error) => {
      // Errors trigger close, so we don't need to do anything extra here
      console.error("WebSocket error:", error);
    };
  }

   function scheduleReconnect() {
     if (closed || reconnectTimeout !== null) return; // already scheduled or closed
     reconnectTimeout = timers.poner(() => {
       reconnectTimeout = null;
       connect();
       // Double the delay for next time, up to MAX_DELAY
       reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
     }, reconnectDelay);
   }

  // Start initial connection
  connect();

  return {
    tipo: "internet",
    etiqueta: "Relé propio de estaciones",
     enviar(texto: string) {
       if (ws && ws.readyState === WS.OPEN) {
         ws.send(texto);
       }
     },
    alRecibir(cb: (texto: string) => void) {
      messageListeners.add(cb);
      return () => {
        messageListeners.delete(cb);
      };
    },
    abierto() {
      return isOpen;
    },
    alAbrir(cb: () => void) {
      openListeners.add(cb);
      return () => {
        openListeners.delete(cb);
      };
    },
     cerrar() {
       // Prevent further reconnections
       closed = true;
       if (reconnectTimeout !== null) {
         timers.quitar(reconnectTimeout);
         reconnectTimeout = null;
       }
       if (ws) {
         ws.close();
         ws = null;
       }
       isOpen = false;
       messageListeners.clear();
       openListeners.clear();
     },
    oyentes() {
      return listenersCount;
    },
  };
}