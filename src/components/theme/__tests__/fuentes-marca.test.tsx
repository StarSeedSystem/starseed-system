import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyFontVariables, FONT_VARIABLES, buildFontStack, FONT_DEFINITIONS } from "../fuentes-marca";

describe("FuentesMarca", () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty(FONT_VARIABLES.display);
    document.documentElement.style.removeProperty(FONT_VARIABLES.titular);
    document.documentElement.style.removeProperty(FONT_VARIABLES.organica);
  });

  it("debería construir el stack de fuentes con respaldos", () => {
    const stack = buildFontStack("display");
    expect(stack).toContain("'Satoshi'");
    expect(stack).toContain("'Rajdhani'");
    expect(stack).toContain("'Inter'");
  });

  it("debería aplicar las variables CSS al documento", () => {
    applyFontVariables();
    const rootStyle = getComputedStyle(document.documentElement);
    expect(rootStyle.getPropertyValue(FONT_VARIABLES.display)).toBeDefined();
    expect(rootStyle.getPropertyValue(FONT_VARIABLES.display)).toContain("Satoshi");
  });
});