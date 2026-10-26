/**
 * StarSeed OS · Agente Mastra · proyecto mínimo
 * Modelo: servidor propio de IA en 127.0.0.1:4480 (OpenAI-compatible)
 * NO se usa ninguna carpeta `ee/` de @mastra/core (licencia empresarial).
 */

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { createServer } from "node:http";

// Configuración del servidor propio de IA (nube ligera / Astraura)
const ASTRAURA_CLOUD_URL = process.env.ASTRAURA_CLOUD_URL ?? "http://127.0.0.1:4480";

/**
 * Herramienta de ejemplo: saludo con nombre.
 * Funciones puras, sin red, sin disco, sin procesos.
 */
export const saludar = createTool({
  id: "saludar",
  description: "Saluda a una persona por su nombre",
  inputSchema: {
    type: "object",
    properties: {
      nombre: { type: "string" },
    },
    required: ["nombre"],
  },
  execute: async (inputData) => {
    const { nombre } = inputData;
    return { mensaje: `Hola, ${nombre}` };
  },
});

export const agente = new Agent({
  name: "AgenteStarSeed",
  instructions:
    "Eres un asistente de StarSeed OS, el sistema operativo social descentralizado. Responde en español con acentos.",
  model: {
    provider: "openai",
    baseURL: ASTRAURA_CLOUD_URL,
    apiKey: process.env.ASTRAURA_158_KEY ?? "fake-key-local",
    model: "astraura-158/auto",
  },
  tools: { saludar },
});

// Servidor expuesto SOLO en 127.0.0.1 (regla de la tarea)
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      servicio: "agentes-mastra",
      agente: agente.name,
      modelo: ASTRAURA_CLOUD_URL,
      escuchando: "127.0.0.1",
    })
  );
});

server.listen(4481, "127.0.0.1", () => {
  console.log("Servidor Mastra escuchando en http://127.0.0.1:4481 (solo local)");
});

export default agente;
