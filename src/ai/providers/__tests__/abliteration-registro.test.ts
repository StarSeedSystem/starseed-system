/**
 * Tests de registro del proveedor abliteration.
 * Verifica que está en el índice, requiere clave y está al final de PROVIDER_ORDER.
 */
import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_ORDER, getProvider } from "../index";
import type { ProviderId } from "../types";

describe("Registro del proveedor abliteration", () => {
  it("existe en PROVIDERS y tiene requiresKey=true", () => {
    const provider = PROVIDERS.abliteration;
    expect(provider).toBeDefined();
    expect(provider.info.id).toBe("abliteration");
    expect(provider.info.requiresKey).toBe(true);
  });

  it("getProvider('abliteration') devuelve el proveedor", () => {
    const provider = getProvider("abliteration");
    expect(provider.info.id).toBe("abliteration");
  });

  it("ocupa la última posición en PROVIDER_ORDER", () => {
    const lastIndex = PROVIDER_ORDER.length - 1;
    expect(PROVIDER_ORDER[lastIndex]).toBe("abliteration");
  });

  it("los demás ProviderId siguen en su sitio relativo", () => {
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

  it("abliteration NO está en la sección 'gratis primero' (primeros 7)", () => {
    const gratisPrimero = PROVIDER_ORDER.slice(0, 7);
    expect(gratisPrimero).not.toContain("abliteration");
  });
});