import { describe, it, expect } from "vitest";
import { spaceIdToHost } from "@/lib/aurora/tts-oss/chatterbox";
import { VOICE_ENGINE_REGISTRY, AUTO_ENDPOINT_ORDER, buildVoiceChain } from "@/lib/aurora/tts-oss/engine-registry";
import { getVoiceConfig } from "@/lib/aurora/tts-oss/voice-config";

describe("spaceIdToHost", () => {
  it("converts owner/space to host format", () => {
    expect(spaceIdToHost("Risuyi/ChatterboxTTS")).toBe("risuyi-chatterboxtts");
    expect(spaceIdToHost("user/My-Space")).toBe("user-my-space");
    expect(spaceIdToHost("A/B/C")).toBe("a-b-c");
    expect(spaceIdToHost("---leading---trailing---")).toBe("leading-trailing");
  });
});

describe("Chatterbox registry entry", () => {
  it("exists in VOICE_ENGINE_REGISTRY", () => {
    // Note: we changed the id to "chatterboxgrok" to get the correct access class
    expect(VOICE_ENGINE_REGISTRY.chatterboxgrok).toBeDefined();
  });

  it("has correct properties", () => {
    const chatterbox = VOICE_ENGINE_REGISTRY.chatterboxgrok;
    expect(chatterbox.id).toBe("chatterboxgrok");
    expect(chatterbox.label).toBe("Chatterbox");
    expect(chatterbox.hint).toContain("Voz expresiva y natural");
    expect(chatterbox.kind).toBe("endpoint");
    expect(chatterbox.realism).toBe(4);
    expect(chatterbox.requiresEndpoint).toBe(true);
    expect(chatterbox.requiresDownload).toBe(false);
    expect(chatterbox.free).toBe(true);
    expect(chatterbox.langs).toContain("es");
    expect(chatterbox.spanish).toBe(true);
    expect(chatterbox.emotions).toBe(true);
    expect(chatterbox.cloning).toBe(true);
    expect(chatterbox.latency).toContain("s");
    expect(chatterbox.license).toBe("MIT");
    expect(chatterbox.repo).toBe("https://github.com/Risuyi/ChatterboxTTS");
    expect(Array.isArray(chatterbox.requirements)).toBe(true);
    expect(chatterbox.requirements.length).toBeGreaterThan(0);
  });
});

describe("AUTO_ENDPOINT_ORDER", () => {
  it("includes chatterboxgrok", () => {
    expect(AUTO_ENDPOINT_ORDER).toContain("chatterboxgrok");
  });

  it("is placed after omnivoice", () => {
    const omnivoiceIndex = AUTO_ENDPOINT_ORDER.indexOf("omnivoice");
    const chatterboxIndex = AUTO_ENDPOINT_ORDER.indexOf("chatterboxgrok");
    expect(omnivoiceIndex).toBeGreaterThanOrEqual(0);
    expect(chatterboxIndex).toBeGreaterThan(omnivoiceIndex);
  });

  // Note: kokoro is not in AUTO_ENDPOINT_ORDER, so we cannot check its position relative to kokoro here.
  // The chain building adds kokoro after the AUTO_ENDPOINT_ORDER, so chatterbox being in AUTO_ENDPOINT_ORDER
  // ensures it comes before kokoro in the full chain.
});

describe("buildVoiceChain", () => {
  it("includes chatterboxgrok in the chain when no endpoints are configured", () => {
    // Create a minimal config with no endpoints configured
    const cfg = getVoiceConfig();
    // Clear the engines configuration to simulate no user configuration
    cfg.engines = {};
    // Set explicit choice to browser to avoid pushing anything from step 2
    cfg.engine = "browser";

    // Build the chain with no pin override (pass null to skip personality pin)
    const chain = buildVoiceChain(cfg, null);

    // Debug: print the chain
    console.log("Chain:", chain);

    // The chain should include, in order: omnivoice, openvoice2, chatterboxgrok, kokoro
    // Note: The actual chain may include other zero-configuration engines like voice158 and vibevoice
    // if they are considered configured (they are not, because they require an endpoint).
    // So we expect at least: omnivoice, openvoice2, chatterboxgrok, kokoro

    // Find the indices of the expected engines
    const omnivoiceIndex = chain.indexOf("omnivoice");
    const openvoice2Index = chain.indexOf("openvoice2");
    const chatterboxIndex = chain.indexOf("chatterboxgrok");
    const kokoroIndex = chain.indexOf("kokoro");

    // All should be present
    expect(omnivoiceIndex).toBeGreaterThanOrEqual(0);
    expect(openvoice2Index).toBeGreaterThanOrEqual(0);
    expect(chatterboxIndex).toBeGreaterThanOrEqual(0);
    expect(kokoroIndex).toBeGreaterThanOrEqual(0);

    // Check the order: omnivoice -> openvoice2 -> chatterboxgrok -> kokoro
    expect(omnivoiceIndex).toBeLessThan(openvoice2Index);
    expect(openvoice2Index).toBeLessThan(chatterboxIndex);
    expect(chatterboxIndex).toBeLessThan(kokoroIndex);
  });

  it("does not include browser in the chain (it's the fallback)", () => {
    const cfg = getVoiceConfig();
    cfg.engines = {};
    const chain = buildVoiceChain(cfg);
    // The browser is not part of the chain; it's used as a fallback by the caller
    expect(chain).not.toContain("browser");
  });
});
