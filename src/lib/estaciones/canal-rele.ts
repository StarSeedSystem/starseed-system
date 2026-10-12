"use client";

import type { CanalEstacion } from "./sesion-en-vivo";

export function crearCanalRele(
  url: string,
  tema: string,
  WS: typeof WebSocket = globalThis.WebSocket
): CanalEstacion {
  const urlConTema = `${url}?tema=${encodeURIComponent(tema)}`;
  let ws: WS | null = null;
  let estaAbierto = false;
  let intentos = 0;
  const maxEspera = 30;
  const oyentes = new Set<(texto: string) => void>();
  const alAbrirCallbacks = new Set<() => void>();
  let contadorOyentes = 0;
  let cerradoManual = false;

  const conectar = () => {
    ws = new WS(urlConTema);
    ws.binaryType = "text";

    ws.onopen = () => {
      estaAbierto = true;
      intentos = 0; // Reset contador de éxitos
      for (const cb of alAbrirCallbacks) cb();
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const mensaje = event.data;

      // Mensajes de presencia del relé: {"t":"rele","n":k}
      if (mensaje.startsWith('{"t":"rele"')) {
        try {
          const parsed = JSON.parse(mensaje);
          if (parsed.t === "rele" && typeof parsed.n === "number") {
            contadorOyentes = parsed.n;
          }
        } catch {
          // Ignorar mensajes malformados
        }
        return;
      }

      // Solo pasar mensajes que empiecen con {"t":"est"
      if (mensaje.startsWith('{"t":"est"')) {
        for (const cb of oyentes) cb(mensaje);
      }
    };

    ws.onclose = () => {
      estaAbierto = false;
      ws = null;
      if (cerradoManual) return;
      // Programar reconexión con espera creciente
      const espera = Math.min(2 ** intentos, maxEspera);
      intentos++;
      setTimeout(conectar, espera * 1000);
    };

    ws.onerror = () => {
      // Si hay error, cerrar para que se déclenche onclose y se reconecte
      if (ws) {
        ws.close();
      }
    };
  };

  conectar();

  return {
    tipo: "internet",
    etiqueta: "Relé propio de estaciones",
    enviar(texto: string) {
      if (ws && ws.readyState === WebSocket.OPEN) {
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
      return estaAbierto;
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
      cerradoManual = true;
      if (ws) {
        ws.close();
        ws = null;
      }
      estaAbierto = false;
    }
  };
}