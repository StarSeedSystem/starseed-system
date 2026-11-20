/**
 * Registro del proveedor «abliteration» (MOD1116).
 *
 * Solo prueba el índice de proveedores: que esté registrado, que exija clave y
 * que quede al final del orden por defecto (de pago, sin selección automática).
 *
 * Nota para quien revise: `src/ai/providers/abliteration.ts` no es archivo de
 * esta tarea. Debe quedar sin el `as` y sin el comentario `// MQA6`; en esta
 * revisión ese archivo ya venía limpio (sin ninguno de los dos).
 */
import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_ORDER } from "../index";
import { abliterationProvider } from "../abliteration";

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
  it("está registrado en la tabla de proveedores", () => {
    expect(PROVIDERS.abliteration).toBe(abliterationProvider);
    expect(PROVIDER_ORDER).toContain("abliteration");
  });

  it("exige clave (es un proveedor de nube de pago)", () => {
    expect(PROVIDERS.abliteration.info.requiresKey).toBe(true);
    expect(PROVIDERS.abliteration.info.local).toBe(false);
  });

  it("ocupa la última posición del orden por defecto", () => {
    expect(PROVIDER_ORDER[PROVIDER_ORDER.length - 1]).toBe("abliteration");
    expect(PROVIDER_ORDER.indexOf("abliteration")).toBe(PROVIDER_ORDER.length - 1);
  });

  it("los demás ids conservan su orden relativo", () => {
    expect(PROVIDER_ORDER.filter((id) => id !== "abliteration")).toEqual(
      ORDEN_SIN_ABLITERATION,
    );
  });
});
