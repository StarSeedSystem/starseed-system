/**
 * Tests para registro del proveedor abliteration en el índice de proveedores.
 * Verifica que abliteration esté registrado, requiera clave, ocupe la última posición
 * en el orden por defecto y que los demás ids mantengan su orden.
 */
import { describe, expect, it } from "vitest";
import { abliterationProvider } from "../abliteration";
import { abliteration as abliterationId } from "../types";
import { PROVIDERS, PROVIDER_ORDER } from "../index";

describe("Registro de abliteration", () => {
  it("abliteration está registrado en PROVIDERS", () => {
    expect(PROVIDERS["abliteration"]).toBe(abliterationProvider);
  });

  it("abliteration.info.requiresKey es true", () => {
    expect(abliterationProvider.info.requiresKey).toBe(true);
  });

  it("abliteration ocupa la última posición en PROVIDER_ORDER", () => {
    expect(PROVIDER_ORDER[PROVIDER_ORDER.length - 1]).toBe("abliteration");
  });

  it("los otros provider IDs mantienen su orden", () => {
    const expectedOrder: Array<typeof abliterationId> = [
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
    ];

    expect(PROVIDER_ORDER.slice(0, -1)).toEqual(expectedOrder);
  });
});
