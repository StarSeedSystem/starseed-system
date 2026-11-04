import { describe, it, expect } from "vitest";
import { modelosUsados } from "../modelos-usados";
import type { ModelAccessClass } from "@/lib/astraura/model-preferences";
import type { AuroraVoiceEngine } from "@/lib/aurora/tts-oss/voice-config";

const LOCAL: ModelAccessClass = "local";
const STARSEED: ModelAccessClass = "starseed";
const API_FREE: ModelAccessClass = "api-free";
const API_EXTERNAL: ModelAccessClass = "api-external";

describe("modelosUsados", () => {
  it("devuelve solo los instalados cuando no hay preferencias ni voz", () => {
    const res = modelosUsados({
      instalados: ["smollm3-webgpu", "webllm"],
      preferencias: [],
      voz: "browser",
    });
    expect(res).toEqual(["smollm3-webgpu", "webllm", "browser"]);
  });

  it("elimina duplicados entre instalados y preferencias", () => {
    const res = modelosUsados({
      instalados: ["ollama-local"],
      preferencias: [LOCAL],
      voz: "browser",
    });
    // ollama-local viene de instalados Y de la clase LOCAL, pero solo aparece una vez
    expect(res.filter((x) => x === "ollama-local")).toHaveLength(1);
  });

  it("respeta el orden: instalados → preferencias → voz", () => {
    const res = modelosUsados({
      instalados: ["smollm3-webgpu"],
      preferencias: [LOCAL, STARSEED],
      voz: "kokoro",
    });
    const idxSmollm = res.indexOf("smollm3-webgpu");
    const idxOllama = res.indexOf("ollama-local");
    const idxAstraura = res.indexOf("astraura-158-local");
    const idxKokoro = res.indexOf("kokoro");

    expect(idxSmollm).toBeLessThan(idxOllama);
    expect(idxOllama).toBeLessThan(idxAstraura);
    expect(idxAstraura).toBeLessThan(idxKokoro);
  });

  it("incluye el motor de voz al final si no está duplicado", () => {
    const res = modelosUsados({
      instalados: [],
      preferencias: [API_FREE],
      voz: "omnivoice",
    });
    expect(res[res.length - 1]).toBe("omnivoice");
  });

  it("no duplica el motor de voz si ya está en preferencias", () => {
    // openvoice2 está en la clase STARSEED
    const res = modelosUsados({
      instalados: [],
      preferencias: [STARSEED],
      voz: "openvoice2",
    });
    expect(res.filter((x) => x === "openvoice2")).toHaveLength(1);
  });

  it("orden estable: misma entrada produce mismo orden", () => {
    const args = {
      instalados: ["webllm", "smollm3-webgpu"] as const,
      preferencias: [LOCAL, API_FREE] as const,
      voz: "vibevoice" as AuroraVoiceEngine,
    };
    const r1 = modelosUsados(args);
    const r2 = modelosUsados(args);
    expect(r1).toEqual(r2);
  });

  it("clase local incluye fuentes WebGPU/WebLLM/Chrome AI", () => {
    const res = modelosUsados({
      instalados: [],
      preferencias: [LOCAL],
      voz: "browser",
    });
    expect(res).toContain("smollm3-webgpu");
    expect(res).toContain("smolvlm2-webgpu");
    expect(res).toContain("webllm");
    expect(res).toContain("chrome-ai");
  });

  it("clase starseed incluye astraura-158 y openvoice2", () => {
    const res = modelosUsados({
      instalados: [],
      preferencias: [STARSEED],
      voz: "browser",
    });
    expect(res).toContain("astraura-158-local");
    expect(res).toContain("astraura-158-nube");
    expect(res).toContain("openvoice2");
  });

  it("clase api-free incluye openrouter-free y pollinations", () => {
    const res = modelosUsados({
      instalados: [],
      preferencias: [API_FREE],
      voz: "browser",
    });
    expect(res).toContain("openrouter-free");
    expect(res).toContain("pollinations-text");
  });

  it("clase api-external incluye openai-paid y anthropic-paid", () => {
    const res = modelosUsados({
      instalados: [],
      preferencias: [API_EXTERNAL],
      voz: "browser",
    });
    expect(res).toContain("openai-paid");
    expect(res).toContain("anthropic-paid");
  });

  it("array vacío de instalados y preferencias solo devuelve la voz", () => {
    const res = modelosUsados({
      instalados: [],
      preferencias: [],
      voz: "kokoro",
    });
    expect(res).toEqual(["kokoro"]);
  });

  it("mantiene el orden de las clases de acceso tal como vienen en preferencias", () => {
    const res = modelosUsados({
      instalados: [],
      preferencias: [API_FREE, LOCAL], // api-free antes que local
      voz: "browser",
    });
    const idxOpenRouter = res.indexOf("openrouter-free");
    const idxOllama = res.indexOf("ollama-local");
    expect(idxOpenRouter).toBeLessThan(idxOllama);
  });
});