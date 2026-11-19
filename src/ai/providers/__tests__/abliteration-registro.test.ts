/**
 * Tests de registro del proveedor abliteration en el índice de proveedores.
 * Verifica que está registrado, requiere clave y ocupa la última posición en PROVIDER_ORDER.
 */
import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_ORDER, getProvider } from "../index";
import type { ProviderId } from "../types";

describe("abliteration provider registration", () => {
  it("está registrado en PROVIDERS", () => {
    expect("abliteration" in PROVIDERS).toBe(true);
  });

  it("getProvider('abliteration') devuelve el proveedor correcto", () => {
    const provider = getProvider("abliteration");
    expect(provider.info.id).toBe("abliteration");
  });

  it("info.requiresKey es true", () => {
    const provider = getProvider("abliteration");
    expect(provider.info.requiresKey).toBe(true);
  });

  it("ocupa la última posición en PROVIDER_ORDER", () => {
    const lastIndex = PROVIDER_ORDER.length - 1;
    expect(PROVIDER_ORDER[lastIndex]).toBe("abliteration");
  });

  it("los demás IDs mantienen su posición relativa en PROVIDER_ORDER", () => {
    const expectedOrder: ProviderId[] = [
      "astraura-158",
      "astraura-158-malla",
      "ia-malla",
      "starseed",
      "ollama",
      "deepseek",
      "groq",
      "openrouter",
      "nvidia",
      "openai",
      "anthropic",
      "google",
      "openai-compatible",
      "abliteration",
    ];
    expect(PROVIDER_ORDER).toEqual(expectedOrder);
  });

  it("ProviderId incluye 'abliteration' en la unión de tipos", () => {
    const ids: ProviderId[] = PROVIDER_ORDER;
    expect(ids).toContain("abliteration");
  });
});