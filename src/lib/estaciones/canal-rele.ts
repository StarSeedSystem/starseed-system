"use client";

import type { CanalEstacion } from "./sesion-en-vivo";

export function crearCanalRele(
  url: string,
  tema: string,
  WS: typeof WebSocket = globalThis.WebSocket
): CanalEstacion & {
  _reconectarTimeout: ReturnType<typeof setTimeout> | null;
  _reconectarIntentos: number;
} {
   const releUrl = `${url}?tema=${encodeURIComponent(tema)}`;
   let ws: InstanceType<typeof WS> | null = null;
   let reconectarTimeout: ReturnType<typeof setTimeout> | null = null;
   let reconectarIntentos = 0;
   const MAX_RECONECTAR_ESPERA = 30_000; // 30 seconds
   const oyentes = new Set<(texto: string) => void>();
   const alAbrirCallbacks = new Set<() => void>();
  let conectado = false;
  let contadorOyentes: number | null = null; // from rele messages

  const conectar = () => {
    if (ws?.readyState === WebSocket.OPEN) return;
    ws = new WS(releUrl);
    ws.onopen = () => {
      conectado = true;
      reconectarIntentos = 0;
      alAbrirCallbacks.forEach(cb => cb());
    };
    ws.onmessage = (event) => {
      const data = event.data;
      if (typeof data !== "string") return;
      // Check for rele messages: {"t":"rele","n":k}
      try {
        const parsed = JSON.parse(data);
        if (parsed.t === "rele" && typeof parsed.n === "number") {
          contadorOyentes = parsed.n;
          return; // Do not pass upwards
        }
      } catch {
        // Not JSON, or not the expected structure
      }
      // Check for est messages: must start with '{"t":"est"'
       if (data.startsWith('{"t":"est"')) {
         oyentes.forEach(cb => cb(data));
       }
    };
    ws.onclose = () => {
      conectado = false;
      ws = null;
      // Schedule reconnection
      if (reconectarTimeout !== null) {
        clearTimeout(reconectarTimeout);
        reconectarTimeout = null;
      }
      const delay = Math.min(1000 * 2 ** reconectarIntentos, MAX_RECONECTAR_ESPERA);
      reconectarTimeout = setTimeout(() => {
        reconectarIntentos++;
        conectar();
      }, delay);
    };
    ws.onerror = () => {
      // onclose will handle reconnection
      if (ws) ws.close();
    };
  };

  conectar(); // Initial connection

  const canal: CanalEstacion & {
    _reconectarTimeout: ReturnType<typeof setTimeout> | null;
    _reconectarIntentos: number;
  } = {
    tipo: "internet",
    etiqueta: "Relé propio de estaciones",
    enviar(texto: string) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(texto);
      }
    },
    alRecibir(cb: (texto: string) => void) {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
    abierto() {
      return conectado;
    },
    oyentes() {
      return contadorOyentes;
    },
    alAbrir(cb: () => void) {
      alAbrirCallbacks.add(cb);
      return () => {
        alAbrirCallbacks.delete(cb);
      };
    },
    cerrar() {
      if (reconectarTimeout !== null) {
        clearTimeout(reconectarTimeout);
        reconectarTimeout = null;
      }
      if (ws) {
        // Prevent any further callbacks from the WebSocket instance
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        ws = null;
      }
      conectado = false;
    },
    // Expose internal state for testing
    get _reconectarTimeout() {
      return reconectarTimeout;
    },
    get _reconectarIntentos() {
      return reconectarIntentos;
    },
  };

  return canal;
}