import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import OracleConsumoResumen from "../oracle-consumo-resumen";
import { leerConsumoOracle } from "@/lib/mando/oracle-consumo-tipos";

const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    if (String(url) === "/api/mando/oracle/consumo") {
      const datos = leerConsumoOracle({
        leido: "2026-10-10T07:00:00Z",
        ok: true,
        region: "mx-queretaro-1",
        consola: "https://cloud.oracle.com/?region=mx-queretaro-1",
        gasto: {
          mes: 0,
          previsto: 0,
          presupuesto: 1,
          presupuestoNombre: "starseed-alerta-1usd",
          calculado: null,
          moneda: "MXN",
          fuente: "Oracle",
          obsoleto: false,
          porDia: [],
        },
        instancias: [],
        errores: [],
        freno: { activo: false, motivo: "" },
        margen: { apto: true, motivo: "hay margen", cpuLibrePct: 95, memLibreGb: 8 },
      });
      return new Response(JSON.stringify({ datos }), { status: 200 });
    }
    return new Response(JSON.stringify({ datos: null }), { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  vi.restoreAllMocks();
});

describe("OracleConsumoResumen", () => {
  it("muestra el gasto '0,00 / 1,00 MXN' cuando hay datos", async () => {
    render(<OracleConsumoResumen />);
    expect(await screen.findByText("0,00 / 1,00 MXN")).toBeInTheDocument();
  });

  it("muestra 'Oracle sin medir todavía' cuando no hay datos", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ datos: null }), { status: 200 })) as typeof fetch;
    render(<OracleConsumoResumen />);
    expect(await screen.findByText("Oracle sin medir todavía")).toBeInTheDocument();
  });
});
