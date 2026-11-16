/**
 * Tests del proveedor Astraura abliteration.ai.
 * Prohibido vi.mock de módulos node; inyecta dependencias o usa fetch simulado.
 */
import { describe, expect, it, vi } from "vitest";
import { abliterationProvider } from "../abliteration";
import type { DecryptedProviderConfig } from "../types";

// Helper para simular fetch global
const mockFetch = (ok: boolean, status: number, body: any, headers?: Record<string, string>) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(headers),
  });
};

describe("abliterationProvider", () => {
  const config: DecryptedProviderConfig = {
    id: "abliteration",
    label: "Abliteration",
    baseUrl: "https://api.abliteration.ai/v1",
    apiKey: "test-key",
    models: ["abliterated-model"],
    defaultModel: "abliterated-model",
    enabled: true,
  };

  it("chat: envía petición correcta y devuelve respuesta", async () => {
    mockFetch(true, 200, {
      choices: [{ message: { content: "Hola mundo" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const res = await abliterationProvider.chat(config, [{ role: "user", content: "Hola" }], { model: "abliterated-model" });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.abliteration.ai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer test-key",
        },
      })
    );
    expect(res.text).toBe("Hola mundo");
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("chat: error 429 con Retry-After", async () => {
    mockFetch(false, 429, { error: { message: "Rate limit exceeded" } }, { "retry-after": "5" });
    await expect(abliterationProvider.chat(config, [], { model: "model" })).rejects.toThrow(/429/);
  });

  it("chat: error 401 sin clave", async () => {
    mockFetch(false, 401, { error: "Unauthorized" });
    await expect(abliterationProvider.chat(config, [], { model: "model" })).rejects.toThrow(/401/);
  });

  it("chat: flujo SSE de dos trozos", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hola"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" mundo"}}], "usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
      headers: new Headers(),
    });

    const chunks: string[] = [];
    const res = await abliterationProvider.chat(config, [{ role: "user", content: "test" }], {
      model: "abliterated-model",
      onChunk: (c) => chunks.push(c),
    });

    expect(chunks).toEqual(["Hola", " mundo"]);
    expect(res.text).toBe("Hola mundo");
    expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
  });
});

