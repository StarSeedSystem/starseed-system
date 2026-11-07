import { describe, it, expect } from "vitest";
import { adaptGenerateImageResult } from "../generar-imagen-adapter";

describe("adaptGenerateImageResult (generar_imagen fallback)", () => {
  it("adapta MediaGenResult ok con url a ContentOutcome y guarda en biblioteca", () => {
    const mediaResult = {
      ok: true,
      url: "https://image.pollinations.ai/prompt/test",
      provider: "pollinations" as const,
    };
    const prompt = "un gato en el espacio";
    const saved = { ok: true, id: "aurora-abc123" };

    const result = adaptGenerateImageResult(mediaResult, prompt, saved);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Generé la imagen");
    expect(result.message).toContain("Pollinations.ai");
    expect(result.message).toContain("guardé en tu Biblioteca");
    expect(result.data).toEqual({ id: "aurora-abc123", url: mediaResult.url });
  });

  it("adapta MediaGenResult ok sin guardado en biblioteca", () => {
    const mediaResult = {
      ok: true,
      url: "https://image.pollinations.ai/prompt/test",
      provider: "pollinations" as const,
    };
    const prompt = "un gato en el espacio";
    const saved = { ok: false, id: "" };

    const result = adaptGenerateImageResult(mediaResult, prompt, saved);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Generé la imagen");
    expect(result.message).toContain("no pude guardarla");
    expect(result.data).toEqual({ id: undefined, url: mediaResult.url });
  });

  it("adapta MediaGenResult fallido a ContentOutcome con mensaje honesto", () => {
    const mediaResult = {
      ok: false,
      provider: "pollinations" as const,
      error: "Pollinations saturado",
    };
    const prompt = "un gato en el espacio";

    const result = adaptGenerateImageResult(mediaResult, prompt, { ok: false, id: "" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("No se pudo generar la imagen");
    expect(result.data).toEqual({ needsConfig: false, error: "Pollinations saturado" });
  });
});