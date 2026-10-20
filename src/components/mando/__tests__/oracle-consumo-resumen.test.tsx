import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import OracleConsumoResumen from "../oracle-consumo-resumen";
import { leerConsumoOracle } from "@/lib/mando/oracle-consumo-tipos";

const fetchOriginal = globalThis.fetch;

/** Lo que el medidor deja en `nodo` (claves de `medidor_oracle.nodo_resumen`); null = sin nodo. */
let nodo: Record<string, unknown> | null = null;
/** Lo que el medidor deja en `reclamacion`; por defecto, sin máquinas (no hay insignia). */
let reclamacion: Record<string, unknown> | null = null;

beforeEach(() => {
  nodo = null;
  reclamacion = null;
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
        nodo,
        reclamacion,
      });
      return new Response(JSON.stringify({ datos }), { status: 200 });
    }
    return new Response(JSON.stringify({ datos: null }), { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  // este archivo monta el mismo componente en cada prueba y no limpia solo: sin esto findByText sale duplicado
  cleanup();
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

  it("con nodo del A1 enseña el chip con servicios y tono, y el detalle en el título", async () => {
    nodo = {
      vivo: true,
      fase: "guardian",
      leido: "2026-10-10T07:00:00Z",
      servicios_ok: 3,
      servicios_total: 3,
      servicios_caidos: [],
      guardian: { ok: false, minutos: 12, sha: "abcdef12", rojos: ["tsc"] },
      cpu_1h: 40,
      mem_ahora: 22,
      horas_sobre_umbral: 2,
      horas_medidas: 3,
    };
    render(<OracleConsumoResumen />);
    const chip = await screen.findByTestId("oracle-resumen-nodo");
    expect(chip).toHaveTextContent("Nodo A1 · 3/3 servicios");
    // el guardián en rojo pone el chip en aviso (ámbar), aunque los servicios estén todos arriba
    expect(chip.className).toContain("amber");
    expect(chip.getAttribute("title")).toContain("ROJO (tsc)");
  });

  it("la insignia «sin métricas de uso» sale en gris, no en verde como si todo estuviera bien", async () => {
    reclamacion = { riesgo: false, maquinas: [{ nombre: "starseed-a1", medida: false, riesgo: false, nivel: "sin-medir" }] };
    render(<OracleConsumoResumen />);
    const insignia = await screen.findByText("Sin métricas de uso: no se puede decir si hay riesgo de reclamación.");
    expect(insignia.className).toContain("text-white/60");
    expect(insignia.className).not.toContain("emerald");
  });

  it("la insignia de «sin riesgo» sigue en verde cuando de verdad se midió", async () => {
    reclamacion = { riesgo: false, maquinas: [{ nombre: "starseed-a1", medida: true, riesgo: false, nivel: "no", cpu_p95: 55, mem_p95: 40 }] };
    render(<OracleConsumoResumen />);
    const insignia = await screen.findByText(/^Sin riesgo de reclamación: starseed-a1/);
    expect(insignia.className).toContain("emerald");
  });

  it("sin nodo no pinta ningún chip del nodo", async () => {
    render(<OracleConsumoResumen />);
    await screen.findByText("0,00 / 1,00 MXN");
    expect(screen.queryByTestId("oracle-resumen-nodo")).toBeNull();
  });
});
