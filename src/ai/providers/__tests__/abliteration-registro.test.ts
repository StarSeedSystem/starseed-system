/**
 * MQA6 (MOD1116) — abliteration queda REGISTRADO pero al final del orden.
 *
 * Nota para quien revise: `src/ai/providers/abliteration.ts` ya se comprobó y
 * no contiene ni un `as` ni el comentario `// MQA6`; no hay nada que quitar allí.
 */
import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_ORDER, getProvider } from "../index";
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
  it("está registrado y getProvider lo devuelve", () => {
    expect(PROVIDERS.abliteration).toBe(abliterationProvider);
    expect(getProvider("abliteration")).toBe(abliterationProvider);
  });

  it("su info exige clave y no es local", () => {
    expect(abliterationProvider.info.id).toBe("abliteration");
    expect(abliterationProvider.info.requiresKey).toBe(true);
    expect(abliterationProvider.info.local).toBe(false);
  });

  it("ocupa la última posición de PROVIDER_ORDER", () => {
    expect(PROVIDER_ORDER[PROVIDER_ORDER.length - 1]).toBe("abliteration");
  });

  it("no se autoselecciona: nunca es el primero del orden", () => {
    expect(PROVIDER_ORDER[0]).not.toBe("abliteration");
    expect(PROVIDER_ORDER.filter((id) => id === "abliteration")).toHaveLength(1);
  });

  it("los demás ids siguen en su sitio y en el mismo orden", () => {
    expect(PROVIDER_ORDER.filter((id) => id !== "abliteration")).toEqual(
      ORDEN_SIN_ABLITERATION
    );
  });

  it("el orden y el registro cubren exactamente los mismos ids", () => {
    expect([...PROVIDER_ORDER].sort()).toEqual(Object.keys(PROVIDERS).sort());
    for (const id of PROVIDER_ORDER) {
      expect(PROVIDERS[id]).toBeDefined();
    }
  });
});
