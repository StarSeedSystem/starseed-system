import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OracleConsumoResumen from "../oracle-consumo-resumen";
import { leerConsumoOracle } from "@/lib/mando/oracle-consumo-tipos";

describe("OracleConsumoResumen", () => {
  it("muestra el texto del gasto cuando hay datos", async () => {
    // Mock document for ConsumoOracle
    const mockDoc = {
      leido: new Date().toISOString(),
      gasto: {
        mes: 0,
        previsto: null,
        presupuesto: 1,
        presupuestoNombre: "",
        calculado: null,
        moneda: "MXN",
        fuente: "",
        obsoleto: false,
        porDia: [],
      },
      prueba: null,
      instancias: [],
      computo: null,
      horasA1: null,
      salidaGb: null,
      disco: null,
      objetos: null,
      reclamacion: null,
      freno: { activo: false, motivo: "" },
      margen: { apto: true, motivo: "", cpuLibrePct: null, memLibreGb: null },
      errores: [],
      obsoletas: [],
      nodo: null,
    };

    // Mock fetch for the specific endpoint
    (globalThis.fetch as any) = (url: string) => {
      if (url.endsWith("/api/mando/oracle/consumo")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              datos: leerConsumoOracle(mockDoc),
            }),
        });
      }
      // For other URLs, return a mock that will cause an error (not expected in this test)
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({}),
      });
    };

    // Render the component
    render(<OracleConsumoResumen />);

    // Wait for the gasto text to appear
    const gastoElement = await screen.findByText(/0,00 \/ 1,00 MXN/);
    expect(gastoElement).toBeTruthy();
  });
});