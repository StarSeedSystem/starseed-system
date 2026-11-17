/**
 * Comparador de canales WebSocket vs SSE (DR1114-1 · WebSocket vs SSE).
 *
 * Regla de decisión (la nuestra, Jev afina la zona de duda):
 *   · Muestras mínimas por canal: con pocas, indeciso.
 *   · Margen mínimo entre medianas: con poco margen, indeciso.
 *   · Si WebSocket gana con margen claro → `migrar` (sendAuroraTurn y
 *     notificaciones especiales pueden moverse a WebSocket).
 *
 * Puro: ninguna E/S, apto para cliente y servidor.
 */

import type { CanalLatencia, TipoMetrica, VistaLatenciaMetrics } from "./metrics";

/** Muestras mínimas por canal para fiarse del veredicto. */
export const MUESTRAS_MINIMAS = 20;

/** Margen mínimo entre medianas (ms) para declarar un ganador. */
export const MARGEN_MINIMO_MS = 25;

export interface OpcionesComparacion {
  tipo?: TipoMetrica;
  muestrasMinimas?: number;
  margenMinimoMs?: number;
}

export interface VeredictoCanales {
  ganador: CanalLatencia | "indeciso";
  muestrasWebsocket: number;
  muestrasSse: number;
  medianaWebsocketMs: number;
  medianaSseMs: number;
  /** medianaSse − medianaWebsocket: positivo si WebSocket es más rápido. */
  margenMs: number;
  /** Solo `true` si WebSocket gana con margen claro (criterio de migración). */
  migrar: boolean;
}

export function compararWebSocketSse(
  metricas: VistaLatenciaMetrics[],
  opciones?: OpcionesComparacion,
): VeredictoCanales {
  const tipo = opciones?.tipo ?? "latency";
  const muestrasMinimas = opciones?.muestrasMinimas ?? MUESTRAS_MINIMAS;
  const margenMinimoMs = opciones?.margenMinimoMs ?? MARGEN_MINIMO_MS;

  const de = (canal: CanalLatencia) =>
    metricas.find((m) => m.tipo === tipo && m.canal === canal) ?? null;
  const ws = de("websocket");
  const sse = de("sse");

  const indeciso: VeredictoCanales = {
    ganador: "indeciso",
    muestrasWebsocket: ws?.total_eventos ?? 0,
    muestrasSse: sse?.total_eventos ?? 0,
    medianaWebsocketMs: ws?.latencia_mediana_ms ?? 0,
    medianaSseMs: sse?.latencia_mediana_ms ?? 0,
    margenMs: 0,
    migrar: false,
  };

  if (!ws || !sse) return indeciso;
  const margen = Math.round(sse.latencia_mediana_ms - ws.latencia_mediana_ms);
  if (ws.total_eventos < muestrasMinimas || sse.total_eventos < muestrasMinimas) {
    return { ...indeciso, margenMs: margen };
  }
  if (Math.abs(margen) < margenMinimoMs) {
    return { ...indeciso, margenMs: margen };
  }

  const ganaWebsocket = margen > 0;
  return {
    ganador: ganaWebsocket ? "websocket" : "sse",
    muestrasWebsocket: ws.total_eventos,
    muestrasSse: sse.total_eventos,
    medianaWebsocketMs: ws.latencia_mediana_ms,
    medianaSseMs: sse.latencia_mediana_ms,
    margenMs: margen,
    migrar: ganaWebsocket,
  };
}
