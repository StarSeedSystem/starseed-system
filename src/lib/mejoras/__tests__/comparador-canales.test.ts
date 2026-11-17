/**
 * Comparador de canales WebSocket vs SSE (DR1114-1).
 *   NODE_ENV=test npx vitest run src/lib/mejoras/__tests__/comparador-canales.test.ts
 */
import { describe, expect, it } from "vitest";

import type { VistaLatenciaMetrics } from "../metrics";
import { compararWebSocketSse } from "../comparador-canales";

function vista(
  canal: "websocket" | "sse",
  eventos: number,
  mediana: number,
  tipo: "latency" | "event_delay" | "notification" = "latency",
): VistaLatenciaMetrics {
  return {
    tipo,
    canal,
    total_eventos: eventos,
    latencia_promedio_ms: mediana,
    latencia_mediana_ms: mediana,
    latencia_maxima_ms: mediana,
    latencia_minima_ms: mediana,
    ultimo_evento: "2026-11-14T00:00:00Z",
  };
}

describe("comparador-canales · veredicto WebSocket vs SSE", () => {
  it("declara ganador a websocket si su mediana es claramente mejor", () => {
    const v = compararWebSocketSse([vista("websocket", 30, 100), vista("sse", 30, 200)]);
    expect(v.ganador).toBe("websocket");
    expect(v.migrar).toBe(true);
    expect(v.margenMs).toBe(100);
  });

  it("declara ganador a sse si su mediana es claramente mejor", () => {
    const v = compararWebSocketSse([vista("websocket", 25, 300), vista("sse", 25, 100)]);
    expect(v.ganador).toBe("sse");
    expect(v.migrar).toBe(false);
  });

  it("es indeciso con pocas muestras", () => {
    const v = compararWebSocketSse([vista("websocket", 5, 100), vista("sse", 30, 200)]);
    expect(v.ganador).toBe("indeciso");
    expect(v.migrar).toBe(false);
  });

  it("es indeciso con margen pequeño", () => {
    const v = compararWebSocketSse([vista("websocket", 30, 195), vista("sse", 30, 200)]);
    expect(v.ganador).toBe("indeciso");
  });

  it("es indeciso si falta un canal", () => {
    const v = compararWebSocketSse([vista("websocket", 30, 100)]);
    expect(v.ganador).toBe("indeciso");
  });

  it("compara solo el tipo pedido y tolera http", () => {
    const metricas = [
      vista("websocket", 30, 300, "notification"),
      vista("websocket", 40, 100, "latency"),
      vista("sse", 30, 50, "notification"),
      vista("sse", 40, 400, "latency"),
    ];
    const v = compararWebSocketSse(metricas, { tipo: "notification" });
    expect(v.ganador).toBe("sse");
  });
});
