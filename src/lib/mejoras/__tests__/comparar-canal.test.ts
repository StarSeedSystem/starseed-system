/**
 * Veredicto WebSocket vs SSE con datos reales de `os_live_metrics` (DR1114-1)
 *   npx vitest run src/lib/mejoras/__tests__/comparar-canal.test.ts
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../metrics", () => ({
  cargarMetricasLatencia: vi.fn(),
}));

import { cargarMetricasLatencia } from "../metrics";
import {
  decidirMigracion,
  compararCanales,
  MIN_EVENTOS_DEFECTO,
  VENTAJA_MINIMA_DEFECTO_MS,
  type OpcionesComparacion,
  type VistaLatenciaMetrics,
} from "../comparar-canal";

/** Fábrica de estadística por canal, como la devuelve `vista_latencia_metrics`. */
function stat(
  canal: "websocket" | "sse" | "http",
  mediana: number,
  eventos = 30,
  tipo: VistaLatenciaMetrics["tipo"] = "latency",
): VistaLatenciaMetrics {
  return {
    tipo,
    canal,
    total_eventos: eventos,
    latencia_promedio_ms: mediana + 20,
    latencia_mediana_ms: mediana,
    latencia_maxima_ms: mediana * 3,
    latencia_minima_ms: Math.max(1, mediana - 40),
    ultimo_evento: "2026-11-15T00:00:00Z",
  };
}

const OPCIONES: OpcionesComparacion = { minEventos: 10, ventajaMinimaMs: 50 };

describe("comparar-canal · decidirMigracion (puro)", () => {
  it("WebSocket gana con ventaja suficiente → migrar", () => {
    const v = decidirMigracion([stat("websocket", 120), stat("sse", 260)], OPCIONES);
    expect(v.ganador).toBe("websocket");
    expect(v.migrar).toBe(true);
    expect(v.diferenciaMs).toBe(140);
    expect(v.motivo).toContain("WebSocket");
  });

  it("SSE gana → no se migra aunque WebSocket exista", () => {
    const v = decidirMigracion([stat("websocket", 300), stat("sse", 150)], OPCIONES);
    expect(v.ganador).toBe("sse");
    expect(v.migrar).toBe(false);
    expect(v.diferenciaMs).toBeLessThan(0);
  });

  it("Falta uno de los dos canales → sin veredicto", () => {
    const v = decidirMigracion([stat("websocket", 120)], OPCIONES);
    expect(v.ganador).toBeNull();
    expect(v.migrar).toBe(false);
  });

  it("Pocos eventos → sin veredicto (no se migra por falta de prueba)", () => {
    const v = decidirMigracion(
      [stat("websocket", 120, 5), stat("sse", 260, 5)],
      OPCIONES,
    );
    expect(v.ganador).toBeNull();
    expect(v.motivo).toContain("Pocos eventos");
  });

  it("Ventaja por debajo del mínimo → ganador sí, migración no", () => {
    const v = decidirMigracion([stat("websocket", 240), stat("sse", 260)], OPCIONES);
    expect(v.ganador).toBe("websocket");
    expect(v.migrar).toBe(false);
    expect(v.motivo).toContain("no llega al mínimo");
  });

  it("Ignora filas de otro tipo de métrica", () => {
    const v = decidirMigracion(
      [stat("websocket", 50, 30, "event_delay"), stat("websocket", 120), stat("sse", 260)],
      OPCIONES,
    );
    expect(v.ganador).toBe("websocket");
    expect(v.migrar).toBe(true);
  });
});

describe("comparar-canal · compararCanales (pegamento)", () => {
  beforeEach(() => {
    vi.mocked(cargarMetricasLatencia).mockReset();
  });

  it("Filtra por tipo y delega el veredicto en decidirMigracion", async () => {
    vi.mocked(cargarMetricasLatencia).mockResolvedValue([
      stat("websocket", 100),
      stat("sse", 300),
      stat("sse", 999, 30, "notification"),
    ]);
    const v = await compararCanales({ minEventos: 10, ventajaMinimaMs: 50 });
    expect(v.ganador).toBe("websocket");
    expect(v.migrar).toBe(true);
  });

  it("Sin datos de la vista → sin veredicto, sin lanzar", async () => {
    vi.mocked(cargarMetricasLatencia).mockResolvedValue([]);
    const v = await compararCanales();
    expect(v.ganador).toBeNull();
    expect(v.migrar).toBe(false);
  });
});
