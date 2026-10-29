/** DAN1024H · El contexto de diseño para la creación con IA: puro, breve, sin claves ni rutas. */
import { describe, it, expect } from "vitest";
import { contextoDisenoIA } from "../principios-referencia";

describe("contextoDisenoIA — forma y pureza", () => {
  it("responde un texto no vacío y acotado (≤ 900) para cualquier entidad", () => {
    for (const entidad of [undefined, null, {}, { nombre: "Trinity Lab" }, { nombre: "pi".repeat(200), registroMovimiento: "experimental" }]) {
      const t = contextoDisenoIA(entidad);
      expect(t.length).toBeGreaterThan(0);
      expect(t.length).toBeLessThanOrEqual(900);
    }
  });

  it("es determinista: la misma entidad da siempre el mismo texto y no muta nada", () => {
    const entidad = { nombre: "Astraura", registroMovimiento: "expresivo" as const };
    expect(contextoDisenoIA(entidad)).toBe(contextoDisenoIA(entidad));
    expect(entidad.registroMovimiento).toBe("expresivo");
  });

  it("sin entidad responde el mismo texto que con entidad vacía", () => {
    expect(contextoDisenoIA(undefined)).toBe(contextoDisenoIA(null));
    expect(contextoDisenoIA(undefined)).toBe(contextoDisenoIA({}));
  });
});

describe("contextoDisenoIA — el ADN y el registro de movimiento", () => {
  it("cita los principios del ADN: composición, Trinity, brillo y solo transform y opacity", () => {
    const t = contextoDisenoIA(undefined);
    expect(t).toContain("Composición centrada");
    expect(t).toContain("Trinity");
    expect(t).toContain("brillo multicapa");
    expect(t).toContain("transform");
    expect(t).toContain("opacity");
    expect(t).toContain("140 y 350");
  });

  it("cita el registro de la entidad: valido el que llega, desconocido cae a «sobrio»", () => {
    expect(contextoDisenoIA({ registroMovimiento: "expresivo" })).toContain("«expresivo»");
    expect(contextoDisenoIA({ registroMovimiento: "experimental" })).toContain("«experimental»");
    expect(contextoDisenoIA({ registroMovimiento: "sobrio" })).toContain("«sobrio»");
    expect(contextoDisenoIA({ registroMovimiento: "libre" })).toContain("«sobrio»");
    expect(contextoDisenoIA(undefined)).toContain("«sobrio»");
  });

  it("nombra la entidad cuando la recibe y la calla cuando no", () => {
    expect(contextoDisenoIA({ nombre: "  Grupo Vega  " })).toContain("para «Grupo Vega»");
    expect(contextoDisenoIA(undefined)).toContain("Contexto de diseño StarSeed (ADN)");
  });

  it("recuerda el símbolo oficial (vesica, sin recolorear ni deformar) y el movimiento reducido", () => {
    const t = contextoDisenoIA(undefined);
    expect(t).toContain("vesica vertical");
    expect(t).toContain("recolorea")
    expect(t).toContain("deforma");
    expect(t).toContain("prefers-reduced-motion");
  });
});

describe("contextoDisenoIA — nada de claves ni rutas", () => {
  const t = contextoDisenoIA({ nombre: "Protomolécula", registroMovimiento: "expresivo" });

  it("no lleva barras: ni rutas de código ni direcciones", () => {
    expect(t.includes("/")).toBe(false);
  });

  it("no lleva direcciones web ni nombres de variable secreta", () => {
    expect(t).not.toMatch(/https?:|www\.|\bnode:|process\.env|env:/);
    expect(t).not.toMatch(/_(KEY|SECRET|TOKEN|CLAVE)|password|apiKey/i);
  });
});
