import { describe, it, expect } from "vitest";
import { PROVIDERS, PROVIDER_ORDER, getProvider } from "./index";
import type { ProviderId } from "./types";

describe("abliteration provider registration", () => {
  it("ProviderId union includes abliteration", () => {
    const ids: ProviderId[] = [
      "astraura-158",
      "astraura-158-malla",
      "ia-malla",
      "starseed",
      "ollama",
      "openai",
      "anthropic",
      "google",
      "openai-compatible",
      "deepseek",
      "groq",
      "abliteration",
      "openrouter",
      "nvidia",
    ];
    expect(ids).toContain("abliteration");
  });

  it("abliterationProvider is registered in PROVIDERS", () => {
    expect("abliteration" in PROVIDERS).toBe(true);
    const provider = PROVIDERS.abliteration;
    expect(provider.info.id).toBe("abliteration");
    expect(provider.info.requiresKey).toBe(true);
  });

  it("getProvider returns abliteration provider", () => {
    const provider = getProvider("abliteration");
    expect(provider.info.id).toBe("abliteration");
    expect(provider.info.requiresKey).toBe(true);
  });

  it("abliteration is last in PROVIDER_ORDER", () => {
    const last = PROVIDER_ORDER[PROVIDER_ORDER.length - 1];
    expect(last).toBe("abliteration");
  });

  it("other provider ids remain in their positions", () => {
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