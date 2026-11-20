/**
 * Registro del proveedor «abliteration» en el índice de proveedores.
 *
 * Nota para quien revise: `src/ai/providers/abliteration.ts` debe quedarse sin
 * `as` en `export const abliterationProvider` y sin el comentario `// MQA6`.
 * Hoy ese archivo no contiene ninguno de los dos, así que no hay nada que quitar.
 */
import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_ORDER } from "../index";
import type { ProviderId } from "../types";

const ORDEN_ESPERADO: ProviderId[] = [
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

describe("registro del proveedor abliteration", () => {
  it("está registrado en PROVIDERS con su id", () => {
    expect(PROVIDERS.abliteration).toBeDefined();
    expect(PROVIDERS.abliteration.info.id).toBe("abliteration");
  });

  it("declara que requiere clave por ser de pago", () => {
    expect(PROVIDERS.abliteration.info.requiresKey).toBe(true);
    expect(PROVIDERS.abliteration.info.local).toBe(false);
  });

  it("ocupa la última posición de la lista de orden", () => {
    expect(PROVIDER_ORDER.at(-1)).toBe("abliteration");
    expect(PROVIDER_ORDER.indexOf("abliteration")).toBe(PROVIDER_ORDER.length - 1);
  });

  it("no queda en «gratis primero»: va después de todos los demás", () => {
    const posicion = PROVIDER_ORDER.indexOf("abliteration");
    PROVIDER_ORDER.forEach((id, indice) => {
      if (id !== "abliteration") expect(indice).toBeLessThan(posicion);
    });
  });

  it("los demás ids siguen en su sitio", () => {
    expect(PROVIDER_ORDER).toEqual(ORDEN_ESPERADO);
  });
});
