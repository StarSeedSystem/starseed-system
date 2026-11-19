/**
 * Test de registro del proveedor abliteration.
 * Verifica que está registrado, requiere clave y está al final de la lista de orden.
 */
import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_ORDER, getProvider } from "../index";
import type { ProviderId } from "../types";

describe("Registro del proveedor abliteration", () => {
  it("está registrado en PROVIDERS", () => {
    expect("abliteration" in PROVIDERS).toBe(true);
  });

  it("su info.requiresKey es true", () => {
    const provider = getProvider("abliteration");
    expect(provider.info.requiresKey).toBe(true);
  });

  it("ocupa la última posición en PROVIDER_ORDER", () => {
    const last = PROVIDER_ORDER[PROVIDER_ORDER.length - 1];
    expect(last).toBe("abliteration");
  });

  it("los demás ids mantienen su posición relativa", () => {
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
});