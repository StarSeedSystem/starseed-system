"use client";

import type { CanalEstacion } from "./sesion-en-vivo";

const PREFIJO_EST = '{"t":"est"';
const PREFIJO_RELE = '{"t":"rele"';

/**
 * Crea un canal que se conecta a un servidor WebSocket de relé propio de estaciones.
 * Se reconecta con espera creciente (1, 2, 4... hasta 30 s).
 * Solo pasa al oyente los mensajes que empiezan por '{"t":"est"'.
 * Los mensajes de la forma '{"t":"rele","n":k}' actualizan el conteo de oyentes.
 */
export function crearCanalRele(
  url: string,
  tema: string,
  WS: typeof WebSocket = globalThis.WebSocket
): CanalEstacion {
  const wsUrl = `${url}?tema=${encodeURIComponent(tema)}`;
   let ws: WebSocket | null = null;
   let reconectarTimeout: ReturnType<typeof setTimeout> | null = null;
   let reconectarDelay = 1000; // empieza en 1 s
   const maxDelay = 30000; // 30 s max
  const oyentes = new Set<(texto: string) => void>();
  const alAbrirCallbacks = new Set<() => void>();
  let suscrito = false;
  let conexiones: number | null = null; // no se implementa presencia en este canal, pero la interfaz lo requiere

  function abrir() {
    if (ws) ws.close();
    ws = new WS(wsUrl);
    ws.onopen = () => {
      suscrito = true;
      reconectarDelay = 1000; // reset delay
      for (const cb of Array.from(alAbrirCallbacks)) cb();
    };
    ws.onmessage = (event) => {
      const data = event.data;
      if (typeof data !== "string") return;
      if (data.startsWith(PREFIJO_RELE)) {
        // mensaje de relé: actualizar oyentes
        try {
          const parsed = JSON.parse(data);
          if (typeof parsed.n === "number") {
            conexiones = parsed.n;
          }
        } catch {
          // ignorar mensajes malformados
        }
        return; // no pasar arriba
      }
      if (data.startsWith(PREFIJO_EST)) {
        for (const cb of Array.from(oyentes)) cb(data);
      }
    };
    ws.onclose = () => {
      suscrito = false;
      // intentar reconexión
      if (reconectarTimeout !== null) {
        clearTimeout(reconectarTimeout);
        reconectarTimeout = null;
      }
      reconectarTimeout = setTimeout(() => {
        abrir();
        // aumentar delay para próximo intento, hasta el máximo
        reconectarDelay = Math.min(reconectarDelay * 2, maxDelay);
      }, reconectarDelay);
    };
    ws.onerror = () => {
      // cerrar para trigger onclose y reconectar
      if (ws) ws.close();
    };
  }
  abrir();

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
      return ws ? ws.readyState === WebSocket.OPEN : false;
    },
    oyentes() {
      return conexiones;
    },
    alAbrir(cb: () => void) {
      alAbrirCallbacks.add(cb);
      return () => {
        alAbrirCallbacks.delete(cb);
      };
    },
    cerrar() {
      if (ws) {
        ws.close();
        ws = null;
      }
      if (reconectarTimeout !== null) {
        clearTimeout(reconectarTimeout);
        reconectarTimeout = null;
      }
      suscrito = false;
    },
  };
}