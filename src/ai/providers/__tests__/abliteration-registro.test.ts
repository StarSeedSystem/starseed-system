/**
 * MQA6 · registro del proveedor «abliteration» en el índice de proveedores.
 *
 * Nota para revisión: `src/ai/providers/abliteration.ts` no es de esta tarea.
 * Si ahí aparece un `as` (cast) o el comentario `// MQA6`, debe quitarlo quien
 * revise ese archivo; esta prueba no lo toca.
 */
import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_ORDER, getProvider } from "../index";

const ORDEN_SIN_ABLITERATION = [
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

describe("registro del proveedor abliteration", () => {
  it("está registrado y su info.requiresKey es true", () => {
    expect(PROVIDERS.abliteration).toBeDefined();
    const proveedor = getProvider("abliteration");
    expect(proveedor).toBe(PROVIDERS.abliteration);
    expect(proveedor.info.id).toBe("abliteration");
    expect(proveedor.info.requiresKey).toBe(true);
  });

  it("ocupa la última posición de la lista de orden por defecto", () => {
    expect(PROVIDER_ORDER[PROVIDER_ORDER.length - 1]).toBe("abliteration");
    expect(PROVIDER_ORDER.filter((id) => id === "abliteration")).toHaveLength(1);
    // Al no ir primero, no se selecciona automáticamente.
    expect(PROVIDER_ORDER[0]).not.toBe("abliteration");
  });

  it("los demás ids siguen en su sitio y la longitud solo crece en uno", () => {
    const sinAbliteration = PROVIDER_ORDER.filter((id) => id !== "abliteration");
    expect(sinAbliteration).toEqual(ORDEN_SIN_ABLITERATION);
    expect(PROVIDER_ORDER).toHaveLength(ORDEN_SIN_ABLITERATION.length + 1);
  });

  it("la tabla de proveedores cubre cada id del orden", () => {
    for (const id of PROVIDER_ORDER) {
      expect(PROVIDERS[id]).toBeDefined();
      expect(PROVIDERS[id].info.id).toBe(id);
    }
  });
});
