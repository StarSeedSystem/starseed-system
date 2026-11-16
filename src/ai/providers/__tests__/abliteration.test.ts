/**
 * Tests para el proveedor Abliteration.ai.
 *
 * Simula respuestas de fetch para verificar el flujo de chat,
 * manejo de errores y streaming SSE.
 */
import { describe, expect, it, vi } from "vitest";
import { abliterationProvider } from "../abliteration";
import type { DecryptedProviderConfig } from "../types";

const config: DecryptedProviderConfig = {
  id: "abliteration",
  label: "Abliteration",
  baseUrl: "https://api.abliteration.ai/v1",
  apiKey: "test-key",
  models: ["abliterated-model"],
  defaultModel: "abliterated-model",
  enabled: true,
};

describe("abliterationProvider", () => {
  it("chat envía la petición correcta", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hola mundo" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    } as Response);

    const res = await abliterationProvider.chat(config, [{ role: "user", content: "Hola" }], { model: "abliterated-model" });
    
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/chat/completions"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Authorization": "Bearer test-key",
        }),
      })
    );
    expect(res.text).toBe("Hola mundo");
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    
    fetchSpy.mockRestore();
  });

  it("lanza error en 401", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid Key",
    } as Response);

    await expect(abliterationProvider.chat(config, [], { model: "m" }))
      .rejects.toThrow(/401/);
  });

  it("maneja streaming SSE", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hola "}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"mundo"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    const calls: string[] = [];
    const onChunk = vi.fn((chunk: string) => calls.push(chunk));
    await abliterationProvider.chat(config, [], { model: "m", onChunk });
    
    expect(calls).toEqual(["Hola ", "mundo"]);
  });
});
