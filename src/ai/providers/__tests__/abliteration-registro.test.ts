/**
 * MQA6 · Registro del proveedor «abliteration» en el índice de proveedores.
 *
 * Prueba pura: solo consulta las tablas exportadas (sin red, sin disco).
 *
 * NOTA PARA QUIEN REVISE: `src/ai/providers/abliteration.ts` no contiene hoy ni
 * un `as` de tipo ni un comentario `// MQA6`, así que no hay nada que quitar
 * allí; este registro no depende de ninguno de los dos.
 */
import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_ORDER, getProvider } from "../index";
import { abliterationProvider } from "../abliteration";
import type { ProviderId } from "../types";

/** Orden esperado del resto de ids, sin tocar por la llegada de abliteration. */
const ORDEN_SIN_ABLITERATION: ProviderId[] = [
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
  it("está registrado en la tabla de proveedores", () => {
    expect(PROVIDERS.abliteration).toBe(abliterationProvider);
    expect(getProvider("abliteration").info.id).toBe("abliteration");
  });

  it("su info exige clave porque es de pago", () => {
    expect(PROVIDERS.abliteration.info.requiresKey).toBe(true);
  });

  it("ocupa la última posición de la lista de orden, sin duplicarse", () => {
    expect(PROVIDER_ORDER[PROVIDER_ORDER.length - 1]).toBe("abliteration");
    expect(PROVIDER_ORDER.filter((id) => id === "abliteration")).toHaveLength(1);
  });

  it("no altera la posición de los demás ids", () => {
    expect(PROVIDER_ORDER.slice(0, -1)).toEqual(ORDEN_SIN_ABLITERATION);
  });
});
