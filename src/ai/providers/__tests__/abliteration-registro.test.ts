/**
 * Tests de registro del proveedor abliteration.
 * Verifica que está registrado, requiere clave y ocupa la última posición.
 */
import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_ORDER, getProvider } from "../index";

describe("Registro de abliteration", () => {
  it("el proveedor está registrado en PROVIDERS", () => {
    expect(PROVIDERS).toHaveProperty("abliteration");
    expect(getProvider("abliteration")).toBeDefined();
  });

  it("info.requiresKey es true", () => {
    const info = getProvider("abliteration")?.info;
    expect(info).toBeDefined();
    expect(info?.requiresKey).toBe(true);
  });

  it("ocupa la última posición de PROVIDER_ORDER", () => {
    const lastId = PROVIDER_ORDER[PROVIDER_ORDER.length - 1];
    expect(lastId).toBe("abliteration");
  });

  it("los demás ids siguen en su sitio", () => {
    expect(PROVIDER_ORDER[0]).toBe("astraura-158");
    expect(PROVIDER_ORDER[1]).toBe("astraura-158-malla");
    expect(PROVIDER_ORDER[2]).toBe("ia-malla");
    expect(PROVIDER_ORDER[PROVIDER_ORDER.length - 2]).toBe("openai-compatible");
  });

  it("PROVIDERS contiene todos los IDs de PROVIDER_ORDER", () => {
    for (const id of PROVIDER_ORDER) {
      expect(PROVIDERS).toHaveProperty(id);
    }
  });
});