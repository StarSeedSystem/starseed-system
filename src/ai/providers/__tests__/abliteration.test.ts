/**
 * Tests del proveedor Abliteration.ai (funciones puras + fetch simulado).
 * Cubre: cuerpo enviado, cabecera Authorization, error 401 sin clave,
 * error 429 con Retry-After, flujo SSE de dos trozos.
 */
import { describe, expect, it, vi } from "vitest";
import { abliterationProvider } from "@/ai/providers/abliteration";
import type { ChatMessage, DecryptedProviderConfig, ChatOptions } from "@/ai/providers/types";

const mockConfig: DecryptedProviderConfig = {
  id: "abliteration" as any,
  label: "Test",
  baseUrl: "https://api.abliteration.ai/v1",
  apiKey: "test-key-123",
  models: ["abliterated-model"],
  defaultModel: "abliterated-model",
  enabled: true,
};

const mockMessages: ChatMessage[] = [
  { role: "system", content: "Eres un asistente." },
  { role: "user", content: "Hola" },
];

const mockOptions: ChatOptions = {
  model: "abliterated-model",
  temperature: 0.7,
  maxTokens: 100,
};

function mockFetch(response: Response, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValue(new Response(response.body, { status, headers: response.headers }));
}

describe("abliterationProvider.chat", () => {
  it("envía el cuerpo correcto y la cabecera Authorization", async () => {
    const responseBody = {
      choices: [{ message: { content: "¡Hola!" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };
    const spy = mockFetch(new Response(JSON.stringify(responseBody), { headers: { "Content-Type": "application/json" } }));

    const result = await abliterationProvider.chat(mockConfig, mockMessages, mockOptions);

    expect(spy).toHaveBeenCalledOnce();
    const call = spy.mock.calls[0];
    expect(call[0]).toBe("https://api.abliteration.ai/v1/chat/completions");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key-123",
    });
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.model).toBe("abliterated-model");
    expect(sentBody.messages).toEqual(mockMessages);
    expect(sentBody.stream).toBe(false);
    expect(sentBody.temperature).toBe(0.7);
    expect(sentBody.max_tokens).toBe(100);
    expect(result.text).toBe("¡Hola!");
    expect(result.usage?.inputTokens).toBe(10);
    expect(result.usage?.outputTokens).toBe(5);

    spy.mockRestore();
  });

  it("lanza error 401 con mensaje de clave ausente", async () => {
    const spy = mockFetch(new Response("Unauthorized", { status: 401 }), 401);

    await expect(abliterationProvider.chat(mockConfig, mockMessages, mockOptions)).rejects.toThrow(
      /Clave inválida o ausente/
    );

    spy.mockRestore();
  });

  it("lanza error 429 con Retry-After en el mensaje", async () => {
    const headers = new Headers();
    headers.set("retry-after", "30");
    const spy = mockFetch(new Response("Rate limited", { status: 429, headers }), 429);

    await expect(abliterationProvider.chat(mockConfig, mockMessages, mockOptions)).rejects.toThrow(
      /retry after 30s/
    );

    spy.mockRestore();
  });

  it("flujo SSE: dos trozos → texto completo y uso", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hola"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" mundo"}}],"usage":{"prompt_tokens":8,"completion_tokens":4}}\n\n',
      "data: [DONE]\n\n",
    ];
    let idx = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (idx < chunks.length) {
          controller.enqueue(encoder.encode(chunks[idx++]));
        } else {
          controller.close();
        }
      },
    });
    const spy = mockFetch(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));

    const received: string[] = [];
    const result = await abliterationProvider.chat(mockConfig, mockMessages, {
      ...mockOptions,
      onChunk: (d) => received.push(d),
    });

    expect(received).toEqual(["Hola", " mundo"]);
    expect(result.text).toBe("Hola mundo");
    expect(result.usage?.inputTokens).toBe(8);
    expect(result.usage?.outputTokens).toBe(4);

    spy.mockRestore();
  });
});

describe("abliterationProvider.listModels", () => {
  it("devuelve la lista de modelos del endpoint /models", async () => {
    const responseBody = { data: [{ id: "abliterated-model" }, { id: "abliterated-model-large-flash" }] };
    const spy = mockFetch(new Response(JSON.stringify(responseBody), { headers: { "Content-Type": "application/json" } }));

    const models = await abliterationProvider.listModels!(mockConfig);

    expect(models).toEqual(["abliterated-model", "abliterated-model-large-flash"]);
    spy.mockRestore();
  });

  it("lanza error si el endpoint falla", async () => {
    const spy = mockFetch(new Response("Error", { status: 500 }), 500);

    await expect(abliterationProvider.listModels!(mockConfig)).rejects.toThrow(/list models failed/);

    spy.mockRestore();
  });
});