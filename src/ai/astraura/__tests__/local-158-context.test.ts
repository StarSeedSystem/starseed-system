/**
 * Contexto COMPACTO para Astraura 1.58 (fusión de habilidades acotada en
 * caracteres) — `buildLocal158CompactContext`. Función pura, sin red.
 */
import { describe, expect, it } from "vitest";
import {
  buildLocal158CompactContext,
  LOCAL_158_CONTEXT_BUDGET_CHARS,
} from "@/ai/astraura/local-158-context";

const HEADER = "Contexto compacto de Astraura (fusión de habilidades):";

describe("buildLocal158CompactContext", () => {
  it("sin datos, devuelve \"\" (nada que fusionar)", () => {
    expect(buildLocal158CompactContext({})).toBe("");
    expect(
      buildLocal158CompactContext({ personalityNames: [], skillLabels: [], connectorNames: [] }),
    ).toBe("");
  });

  it("compone las tres secciones en orden de prioridad con presupuesto amplio", () => {
    const out = buildLocal158CompactContext({
      personalityNames: ["Aurora"],
      skillLabels: ["Taste · calidad de UI y estética", "PM · producto y proyecto"],
      connectorNames: ["Ollama", "Google Calendar"],
    });
    const lines = out.split("\n");
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toBe("Personalidad activa: Aurora.");
    expect(lines[2]).toBe("Habilidades activas: Taste · calidad de UI y estética, PM · producto y proyecto.");
    expect(lines[3]).toBe("Conexiones activas: Ollama, Google Calendar.");
  });

  it("usa el presupuesto por defecto (600) cuando no se pasa uno explícito", () => {
    const withDefault = buildLocal158CompactContext({ personalityNames: ["Aurora"] });
    const withExplicit = buildLocal158CompactContext({ personalityNames: ["Aurora"] }, LOCAL_158_CONTEXT_BUDGET_CHARS);
    expect(withDefault).toBe(withExplicit);
  });

  it("deduplica etiquetas repetidas preservando el orden", () => {
    const out = buildLocal158CompactContext({ skillLabels: ["Código", "Código", "Código"] });
    expect(out).toBe(`${HEADER}\nHabilidades activas: Código.`);
  });

  it("omite una sección vacía sin dejar huecos", () => {
    const out = buildLocal158CompactContext({ personalityNames: ["Hermione"], connectorNames: ["n8n"] });
    expect(out).toBe(`${HEADER}\nPersonalidad activa: Hermione.\nConexiones activas: n8n.`);
    expect(out).not.toMatch(/Habilidades activas/);
  });

  it("presupuesto insuficiente ni para la cabecera → \"\"", () => {
    expect(buildLocal158CompactContext({ personalityNames: ["Aurora"] }, HEADER.length)).toBe("");
    expect(buildLocal158CompactContext({ personalityNames: ["Aurora"] }, 5)).toBe("");
    expect(buildLocal158CompactContext({ personalityNames: ["Aurora"] }, 0)).toBe("");
  });

  it("recorte INTELIGENTE por prioridad: con presupuesto justo para personalidad, cae habilidades y conexiones", () => {
    const full = buildLocal158CompactContext({
      personalityNames: ["Aurora"],
      skillLabels: ["Investigación (Open Notebook)"],
      connectorNames: ["Ollama"],
    });
    // Presupuesto = cabecera + salto de línea + la línea de personalidad exacta,
    // sin margen para nada más.
    const personalityLine = full.split("\n")[1];
    const tightBudget = HEADER.length + 1 + personalityLine.length;

    const limited = buildLocal158CompactContext(
      {
        personalityNames: ["Aurora"],
        skillLabels: ["Investigación (Open Notebook)"],
        connectorNames: ["Ollama"],
      },
      tightBudget,
    );
    expect(limited).toContain("Personalidad activa: Aurora.");
    expect(limited).not.toMatch(/Habilidades activas/);
    expect(limited).not.toMatch(/Conexiones activas/);
    expect(limited.length).toBeLessThanOrEqual(tightBudget);
  });

  it("cuando falta sitio para todas las etiquetas, añade «· +N más» en vez de cortar una a la mitad", () => {
    // Cada etiqueta lleva un TOKEN único ("Habilidad-N-") que no es substring de
    // ningún otro (el guion tras el número corta la ambigüedad 1 vs. 10, 11…).
    const manyLabels = Array.from(
      { length: 15 },
      (_, i) => `Habilidad-${i + 1}-de-nombre-bastante-largo-para-forzar-el-recorte-del-presupuesto`,
    );
    const out = buildLocal158CompactContext({ skillLabels: manyLabels }, 220);
    expect(out.length).toBeLessThanOrEqual(220);
    expect(out).toMatch(/· \+\d+ más\./);
    // Nunca corta una etiqueta a la mitad: si su token único aparece, la
    // etiqueta COMPLETA también aparece (no un prefijo cortado).
    for (let i = 0; i < manyLabels.length; i++) {
      const token = `Habilidad-${i + 1}-`;
      if (out.includes(token)) {
        expect(out.includes(manyLabels[i])).toBe(true);
      }
    }
  });

  it("nunca supera el presupuesto pedido, para un rango amplio de presupuestos", () => {
    const parts = {
      personalityNames: ["Aurora"],
      skillLabels: [
        "Generación audiovisual (imagen · audio · vídeo)",
        "Taste · calidad de UI y estética",
        "PM · producto y proyecto",
        "Sentidos web (Agent-Reach)",
      ],
      connectorNames: ["Ollama", "Google Calendar", "n8n"],
    };
    for (const budget of [0, 10, 40, 80, 150, 300, 600, 1200]) {
      const out = buildLocal158CompactContext(parts, budget);
      expect(out.length).toBeLessThanOrEqual(Math.max(0, budget));
    }
  });
});
