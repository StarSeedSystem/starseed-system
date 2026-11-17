import { describe, it, expect } from "vitest";
import { abliterationProvider } from "../abliteration";
import { PROVIDERS, PROVIDER_ORDER } from "..";

describe("abliteration provider registration", () => {
  it("is registered in PROVIDERS", () => {
    expect(PROVIDERS.abliteration).toBe(abliterationProvider);
  });

  it("info.requiresKey is true", () => {
    expect(abliterationProvider.info.requiresKey).toBe(true);
  });

  it("is last in PROVIDER_ORDER", () => {
    expect(PROVIDER_ORDER.at(-1)).toBe("abliteration");
  });

  it("all other provider ids remain in order", () => {
    const expectedOrder = [
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