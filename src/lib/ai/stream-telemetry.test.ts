import { describe, it, expect } from "vitest";
import {
  applySseChunk,
  createTelemetryState,
  parseSseLine,
  telemetryToResponse,
} from "./stream-telemetry";

describe("parseSseLine", () => {
  it("devuelve null para líneas vacías o sin data:", () => {
    expect(parseSseLine("", {})).toBeNull();
    expect(parseSseLine("event: ping", {})).toBeNull();
  });

  it("ignora comentarios SSE cuando ignoreComments es true", () => {
    expect(parseSseLine(": OPENROUTER PROCESSING", { ignoreComments: true })).toBeNull();
  });

  it("devuelve done=true para [DONE]", () => {
    const r = parseSseLine("data: [DONE]", {});
    expect(r).toEqual({ delta: "", done: true });
  });

  it("extrae delta y usage de un chunk válido", () => {
    const payload = JSON.stringify({
      choices: [{ delta: { content: "hola" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const r = parseSseLine(`data: ${payload}`, {});
    expect(r).toEqual({ delta: "hola", inputTokens: 10, outputTokens: 5, done: false });
  });

  it("devuelve delta vacío si no hay content", () => {
    const payload = JSON.stringify({ choices: [{ delta: {} }] });
    const r = parseSseLine(`data: ${payload}`, {});
    expect(r?.delta).toBe("");
  });

  it("lanza error con errorPrefix si hay error en el payload", () => {
    const payload = JSON.stringify({ error: { message: "cuota agotada" } });
    expect(() => parseSseLine(`data: ${payload}`, { errorPrefix: "OpenRouter" }))
      .toThrow("OpenRouter: cuota agotada");
  });

  it("devuelve null para JSON inválido", () => {
    expect(parseSseLine("data: {nope}", {})).toBeNull();
  });
});

describe("applySseChunk", () => {
  it("acumula texto y actualiza tokens", () => {
    const state = createTelemetryState();
    applySseChunk(state, { delta: "ho", done: false });
    applySseChunk(state, { delta: "la", done: false, inputTokens: 3, outputTokens: 2 });
    expect(state.fullText).toBe("hola");
    expect(state.inputTokens).toBe(3);
    expect(state.outputTokens).toBe(2);
  });

  it("sobrescribe tokens con el último valor", () => {
    const state = createTelemetryState();
    applySseChunk(state, { delta: "", done: false, inputTokens: 1 });
    applySseChunk(state, { delta: "", done: false, inputTokens: 5 });
    expect(state.inputTokens).toBe(5);
  });
});

describe("telemetryToResponse", () => {
  it("devuelve solo texto si no hay tokens", () => {
    expect(telemetryToResponse({ fullText: "hola" })).toEqual({ text: "hola" });
  });

  it("incluye usage cuando hay tokens", () => {
    const r = telemetryToResponse({ fullText: "hola", inputTokens: 3, outputTokens: 2 });
    expect(r).toEqual({ text: "hola", usage: { inputTokens: 3, outputTokens: 2 } });
  });

  it("incluye usage parcial si solo hay inputTokens", () => {
    const r = telemetryToResponse({ fullText: "x", inputTokens: 1 });
    expect(r).toEqual({ text: "x", usage: { inputTokens: 1, outputTokens: undefined } });
  });
});