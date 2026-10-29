// src/lib/variaciones/adaptadores/__tests__/widgets.test.ts
import { describe, it, expect } from "vitest";
import { validarParcheWidget, tipoDeClaveWidget, sanearAjustesWidget } from "../widgets";
import type { WidgetType } from "@/components/dashboard/dashboard-types";

describe("widgets · familia de variaciones públicas", () => {
it("valida un parche de ajustes con sanitización y restricciones de tamaño", () => {
    const tipo: WidgetType = "CLOCK_DATE";
    // Este payload tiene apiKey → debe ser RECHAZADO (contrato §5: nada privado entra en un payload)
    const payload = {
      settings: { ciudad: "Madrid", apiKey: "secret123" },
      size: "M",
    };
    const resultado = validarParcheWidget(payload, tipo);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivos.some((m) => m.includes("privada"))).toBe(true);
  });

  it("rechaza ajustes con clave privada", () => {
    const tipo: WidgetType = "CLOCK_DATE";
    const payload = {
      settings: { ciudad: "Madrid", token: "abc123def456" },
    };
    const resultado = validarParcheWidget(payload, tipo);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivos.some((m) => m.includes("privada"))).toBe(true);
  });

  it("rechaza tamaño inválido", () => {
    const tipo: WidgetType = "CLOCK_DATE";
    const payload = {
      settings: { ciudad: "Madrid" },
      size: "XXL",
    };
    const resultado = validarParcheWidget(payload, tipo);
    expect(resultado.ok).toBe(false);
  });

  it("aplica dimensiones válidas según constraints del manifiesto", () => {
    const tipo: WidgetType = "CLOCK_DATE";
    const payload = {
      settings: { ciudad: "Madrid" },
      size: "S",
    };
    const resultado = validarParcheWidget(payload, tipo);
    expect(resultado.ok).toBe(true);
    expect(resultado.parche.size).toBe("S");
  });

  it("devuelve null para clave inválida", () => {
    const resultado = tipoDeClaveWidget("ajuste:accesibilidad");
    expect(resultado).toBeNull();
  });

  it("reconoce widget:toma el tipo widget", () => {
    const resultado = tipoDeClaveWidget("widget:CLOCK_DATE");
    expect(resultado).toBe("CLOCK_DATE");
  });
});