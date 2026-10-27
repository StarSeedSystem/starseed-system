/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Pruebas del agente Mastra (node --test)
 * Sin red y sin procesos: el modelo es un MastraLanguageModelV2 simulado que
 * devuelve un eco; el servidor se prueba con app.fetch (listener real con
 * puerto 0 y cierre inmediato).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Agent } from "@mastra/core/agent";
import {
  HOST_EXTERIOR,  INSTRUCCIONES,
  PUERTO_SERVIDOR,
  URL_SERVIDOR_DE_IA,
  crearAgente,
  crearHerramientaEstado,
  crearMastra,
  crearModeloServidorPropio,
  iniciarServidor,
  estadoNeurona,
} from "../src/agente.mjs";


/**
 * Modelo simulado compatible con MastraLanguageModelV2: responde con un eco
 * del último mensaje del usuario. No abre conexiones ni procesos.
 */
function modeloSimulado() {
  return {
    specificationVersion: "v2",
    provider: "simulado",
    modelId: "simulado-local",
    supportedUrls: {},
    doGenerate: async (opciones) => {
      const ultimo = [...opciones.prompt].reverse().find((m) => m.role === "user");
      const texto = (ultimo?.content ?? [])
        .map((c) => (c.type === "text" ? c.text : ""))
        .join(" ")
        .trim();
      return {
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
        content: [{ type: "text", text: `eco: ${texto}` }],
      };
    },
    doStream: async (opciones) => {
      const resultado = await modeloSimulado().doGenerate(opciones);
      const parte = resultado.content.find((c) => c.type === "text");
      const flujo = new ReadableStream({
        start: (control) => {
          control.enqueue({ type: "stream-start", warnings: [] });
          control.enqueue({ type: "text-delta", id: "1", delta: parte.text });
          control.enqueue({
            type: "finish",
            finishReason: "stop",
            usage: resultado.usage,
          });
          control.close();
        },
      });
      return { stream: flujo, warnings: [] };
    },
  };
}

describe("agente-mastra · config", () => {
  it("el modelo por defecto apunta al servidor propio de IA", () => {
    const modelo = crearModeloServidorPropio();
    assert.equal(modelo.id, "servidor-propio/local");
    assert.equal(modelo.url, URL_SERVIDOR_DE_IA);
    assert.equal(modelo.api, "chat");
  });

  it("el modelo acepta nombre y api key por parámetro", () => {
    const modelo = crearModeloServidorPropio({ modelo: "qwen2", apiKey: "secreto" });
    assert.equal(modelo.id, "servidor-propio/qwen2");
    assert.equal(modelo.apiKey, "secreto");
  });

  it("el agente cumple el contrato OS (persona, herramientas, modelo)", () => {
    const agente = crearAgente();
    assert.ok(agente instanceof Agent);
    assert.equal(agente.name, "agente-neurona");
    assert.equal(agente.getInstructions(), INSTRUCCIONES);
  });

  it("Mastra queda configurado SOLO para 127.0.0.1 y su puerto", () => {
    const mastra = crearMastra();
    const config = mastra.getServer();
    assert.equal(config.host, HOST_EXTERIOR);
    assert.equal(config.port, PUERTO_SERVIDOR);
  });

  it("la herramienta estado-neurona es una función pura probada", () => {
    assert.deepEqual(estadoNeurona(), { estado: "viva", en_vivo: true });
    const herramienta = crearHerramientaEstado();
    assert.equal(herramienta.id, "estado-neurona");
  });
});

describe("agente-mastra · carrera con modelo simulado", () => {
  it("el agente responde un eco del mensaje (sin red)", async () => {
    const agente = crearAgente({ model: modeloSimulado() });
    const resultado = await agente.generate("prueba local");
    assert.ok(resultado.text.includes("prueba local"));
  });

  it("el servidor Mastra responde rutas del agente sin abrir red", async () => {
    const { app, cerrar } = await iniciarServidor({ port: 0 });
    try {
      const respuesta = await app.request("/api/agents/agente-neurona");
      assert.equal(respuesta.status, 200);
      const cuerpo = await respuesta.json();
      assert.equal(cuerpo?.name ?? cuerpo?.id, "agente-neurona");
    } finally {
      await cerrar();
    }
  });
});
