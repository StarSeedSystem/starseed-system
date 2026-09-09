import { describe, it, expect } from "vitest";
import {
  esModeloMuerto,
  filtrarModelosVivos,
  OLVIDO_MODELO_MUERTO_MS,
  type ModeloMuerto,
} from "@/ai/astraura/free-catalog";

describe("memoria de modelos muertos (Ola 302)", () => {
  it("el 400 real de LLM7 con gpt-oss se clasifica como modelo muerto", () => {
    const msg =
      "Model 'gpt-oss' is currently unavailable.";
    expect(esModeloMuerto(msg)).toBe(true);
  });

  it("clasifica los mensajes de modelo retirado/desconocido como muerto", () => {
    expect(esModeloMuerto(`{"error":{"code":"model_unavailable"}}`)).toBe(true);
    expect(esModeloMuerto("Model not found: mistral")).toBe(true);
    expect(esModeloMuerto("unknown model qwen3-coder-480b")).toBe(true);
    expect(esModeloMuerto("this model has been decommissioned")).toBe(true);
    expect(esModeloMuerto("gpt-oss is no longer available")).toBe(true);
    expect(esModeloMuerto("this model does not exist")).toBe(true);
  });

  it("NO clasifica como muertos los cuotas, 429, 401 ni errores de red", () => {
    expect(esModeloMuerto(`{"error":{"code":"rate_limit_exceeded"}}`)).toBe(false);
    expect(esModeloMuerto("429 Too Many Requests")).toBe(false);
    expect(esModeloMuerto("no response received, check the url")).toBe(false);
    expect(esModeloMuerto("Missing Bearer token (401)")).toBe(false);
    expect(esModeloMuerto("insufficient_quota")).toBe(false);
    expect(esModeloMuerto("accounts that have not been recharged")).toBe(false);
  });

  it("el olvido a las 24 h devuelve el modelo a la rotación", () => {
    const ayer = Date.now() - OLVIDO_MODELO_MUERTO_MS - 1_000;
    const muertos: ModeloMuerto[] = [
      { fuente: "llm7-free", modelo: "gpt-oss", desde: ayer, motivo: "retirado" },
    ];
    const candidatos = [{ fuente: "llm7-free", modelo: "gpt-oss" }];
    expect(filtrarModelosVivos(candidatos, muertos, Date.now())).toEqual(candidatos);
  });

  it("filtra el modelo muerto recientemente pero deja pasar los vivos", () => {
    const ahora = Date.now();
    const muertos: ModeloMuerto[] = [
      { fuente: "llm7-free", modelo: "gpt-oss", desde: ahora - 60_000, motivo: "retirado" },
    ];
    const candidatos = [
      { fuente: "llm7-free", modelo: "gpt-oss" },
      { fuente: "llm7-free", modelo: "gemma3:27b" },
      { fuente: "pollinations-text", modelo: "openai" },
    ];
    const vivos = filtrarModelosVivos(candidatos, muertos, ahora);
    expect(vivos).toEqual([
      { fuente: "llm7-free", modelo: "gemma3:27b" },
      { fuente: "pollinations-text", modelo: "openai" },
    ]);
  });
});