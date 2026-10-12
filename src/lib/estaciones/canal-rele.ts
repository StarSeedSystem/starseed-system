"use client";

import type { CanalEstacion } from "./sesion-en-vivo";

/**
 * Canal WebSocket de relé propio con reconexión automática.
 * @param url - URL base del servidor
 * @param tema - Tema de suscripción
 * @param WS - Constructor de WebSocket (para tests)
 */
export function crearCanalRele<
  WS extends { new (url: string): WebSocket; prototype: WebSocket }
>(
  url: string,
  tema: string,
  WS: WS = globalThis.WebSocket as unknown as WS
): CanalEstacion {
  let ws: InstanceType<WS> | null = null;
  let reconectarTimeout: ReturnType<typeof setTimeout> | null = null;
  let intentos = 0;
  const maxIntentos = 6;
  const oyentes = new Set<(texto: string) => void>();
  const alAbrirFn = new Set<() => void>();
  let conectadosCount = 0;
  let abiertoEstado = false;

  const conectar = () => {
    if (reconectarTimeout !== null) {
      clearTimeout(reconectarTimeout);
      reconectarTimeout = null;
    }
    const urlCompleta = `${url}?tema=${encodeURIComponent(tema)}`;
    ws = new WS(urlCompleta) as InstanceType<WS>;
    ws.onopen = () => {
      abiertoEstado = true;
      intentos = 0;
      Array.from(alAbrirFn).forEach(cb => cb());
    };
    ws.onmessage = (evento) => {
      try {
        const data = evento.data;
        if (data.startsWith('{"t":"rele"')) {
          try {
            const parsed = JSON.parse(data);
            if (typeof parsed.n === "number") conectadosCount = parsed.n;
          } catch {}
          return;
        }
        if (data.startsWith('{"t":"est"')) {
          Array.from(oyentes).forEach(cb => cb(data));
        }
      } catch { console.error("Error procesando mensaje en canal-rele:"); }
    };
    ws.onclose = () => {
      abiertoEstado = false;
      ws = null;
      if (intentos < maxIntentos) {
        reconectarTimeout = setTimeout(() => {
          intentos++;
          conectar();
        }, Math.min(1000 * 2 ** intentos, 30000));
      }
    };
    ws.onerror = (error) => {
      console.error("Error en WebSocket de canal-rele:", error);
      if (ws) ws.close();
    };
  };

  conectar();

  return {
    tipo: "internet",
    etiqueta: "Relé propio de estaciones",
    enviar(texto: string): void {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(texto);
        } catch (e) {
          // Ignorar errores de envío, la reconexión se manejará por onclose/onerror
        }
      }
    },
    alRecibir(cb: (texto: string) => void): () => void {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
    abierto(): boolean {
      return abiertoEstado;
    },
    oyentes(): number | null {
      return conectadosCount > 0 ? conectadosCount : null;
    },
    alAbrir(cb: () => void): () => void {
      alAbrirFn.add(cb);
      return () => {
        alAbrirFn.delete(cb);
      };
    },
    cerrar(): void {
      if (ws) {
        ws.close();
      }
      if (reconectarTimeout !== null) {
        clearTimeout(reconectarTimeout);
        reconectarTimeout = null;
      }
      abiertoEstado = false;
      ws = null;
    }
  };
}