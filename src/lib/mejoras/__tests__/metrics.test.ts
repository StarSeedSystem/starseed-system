/**
 * Métricas de latencia percibida en tiempo real (DR1114-1 · WebSocket vs SSE)
 *   NODE_ENV=test npx vitest run src/lib/mejoras/__tests__/metrics.test.ts
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockClient: any = {
  from: vi.fn(),
};

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => mockClient,
}));

import {
  registrarMetrica,
  cargarMetricasLatencia,
  cargarMetricasPorOrigen,
  _setClienteMetricas,
} from "../metrics";

describe("metrics · registro de latencia percibida", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _setClienteMetricas(mockClient);
  });

  it("registrarMetrica inserta correctamente una métrica de latencia", async () => {
    const chain: any = {};
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockReturnValue({
      data: { id: 123 },
      error: null,
    });
    mockClient.from.mockReturnValue(chain);

    const resultado = await registrarMetrica(
      "latency",
      "websocket",
      "sendAuroraTurn",
      150,
      { destino: "chat:personal", datos: { parametro: "valor" } },
    );

    expect(resultado.ok).toBe(true);
    expect(resultado.id).toBe(123);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "latency",
        canal: "websocket",
        origen: "sendAuroraTurn",
        latenciaMs: 150,
        destino: "chat:personal",
        datos: { parametro: "valor" },
      }),
    );
  });

  it("registrarMetrica devuelve error si falla la inserción", async () => {
    const chain: any = {};
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockReturnValue({
      data: null,
      error: { message: "Error de prueba" },
    });
    mockClient.from.mockReturnValue(chain);

    const resultado = await registrarMetrica("latency", "sse", "aviso-mensajes", 100);

    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBe("Error de prueba");
  });

  it("cargarMetricasLatencia devuelve estadísticas por canal", async () => {
    const result = [
      {
        tipo: "latency",
        canal: "websocket",
        total_eventos: 10,
        latencia_promedio_ms: 150,
        latencia_mediana_ms: 140,
        latencia_maxima_ms: 300,
        latencia_minima_ms: 80,
        ultimo_evento: "2026-11-14T01:00:00Z",
      },
      {
        tipo: "latency",
        canal: "sse",
        total_eventos: 10,
        latencia_promedio_ms: 250,
        latencia_mediana_ms: 240,
        latencia_maxima_ms: 400,
        latencia_minima_ms: 180,
        ultimo_evento: "2026-11-14T01:00:00Z",
      },
    ];

    // El SDK de Supabase: select().order().order() se await directamente con { data, error }
    const promiseResult = Promise.resolve({ data: result, error: null });

    // Mock para .from().select("*").order().order()
    // El primer .order() retorna algo que tiene su propio .order() que retorna la promesa
    const queryBuilder = {
      order: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue(promiseResult),
      }),
    };

    const chain = {
      select: vi.fn().mockReturnValue(queryBuilder),
    };
    mockClient.from.mockReturnValue(chain);

    const metricas = await cargarMetricasLatencia();

    expect(metricas).toHaveLength(2);
    expect(metricas[0].canal).toBe("websocket");
    expect(metricas[0].latencia_promedio_ms).toBe(150);
    expect(metricas[1].canal).toBe("sse");
    expect(metricas[1].latencia_promedio_ms).toBe(250);
  });

  it("cargarMetricasPorOrigen filtra por origen", async () => {
    const result = [
      { id: 1, t: "2026-11-14T00:00:00Z", tipo: "latency", canal: "websocket", origen: "sendAuroraTurn", latenciaMs: 150 },
      { id: 2, t: "2026-11-14T00:05:00Z", tipo: "latency", canal: "websocket", origen: "sendAuroraTurn", latenciaMs: 145 },
    ];

    let eqCall: string | null = null;
    let gteCall: string | null = null;

    const promiseResult = Promise.resolve({ data: result, error: null });

    const chain = {
      select: vi.fn().mockImplementation((_cols: string) => ({
        eq: vi.fn().mockImplementation((key: string) => {
          eqCall = key;
          return {
            gte: vi.fn().mockImplementation((_k: string) => {
              gteCall = "t";
              return {
                order: vi.fn().mockReturnValue(promiseResult),
              };
            }),
          };
        }),
      })),
    };
    mockClient.from.mockReturnValue(chain);

    const metricas = await cargarMetricasPorOrigen("sendAuroraTurn");

    expect(eqCall).toBe("origen");
    expect(gteCall).not.toBeNull();
    expect(metricas).toHaveLength(2);
  });

  it("registrarMetrica maneja excepciones", async () => {
    const chain = {
      insert: vi.fn().mockImplementation(() => {
        throw new Error("Fallo inesperado");
      }),
    };
    mockClient.from.mockReturnValue(chain);

    const resultado = await registrarMetrica("latency", "http", "aviso-mensajes", 200);

    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBe("Fallo inesperado");
  });

  it("cargarMetricasLatencia devuelve array vacío en error", async () => {
    const promiseResult = Promise.resolve({ data: null, error: { message: "Error de tabla" } });

    const chain = {
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue(promiseResult),
      }),
    };
    mockClient.from.mockReturnValue(chain);

    const metricas = await cargarMetricasLatencia();

    expect(metricas).toEqual([]);
  });
});