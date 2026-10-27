/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Agente de la neurona (motor Mastra) · ola 1023A
 * ---------------------------------------------------------------------------
 * Contrato: architecture/repos-3d-oido-agentes-1023.md §3 — un contrato de
 * agente, varios motores intercambiables. El modelo SIEMPRE por el enrutador
 * propio; aquí el proveedor es el servidor propio de IA (OpenAI-compatible en
 * 127.0.0.1:4480). Nube de los autores y trazas externas: fuera. Sólo Apache-2.0.
 *
 * El servidor de Mastra se expone SOLO en 127.0.0.1 (la neurona no publica
 * agentes a internet).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { Mastra } from "@mastra/core";
import { z } from "zod";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { MastraServer } from "@mastra/hono";

/** Host donde vive todo: la neurona no publica fachada exterior. */
export const HOST_EXTERIOR = "127.0.0.1";
/** Puerto del servidor Mastra del agente (interfaz local). */
export const PUERTO_SERVIDOR = 4111;
/** Endpoint base del servidor propio de IA (protocolo OpenAI /v1). */
export const URL_SERVIDOR_DE_IA = "http://127.0.0.1:4480/v1";

/** Contrato del agente: persona fija del OS (instructions). */
export const INSTRUCCIONES = `Eres el agente de la neurona StarSeed.
Hablas en español con acentos, breve y concreto.
Usas la herramienta estado-neurona cuando te pregunten por la salud de la neurona.`;

/**
 * Lógica observe de la herramienta de ejemplo, separada para poder
 * probarla como función pura (entrada → salida, sin red ni disco).
 * @returns {{ estado: string, en_vivo: boolean }}
 */
export function estadoNeurona() {
  return { estado: "viva", en_vivo: true };
}

/** Herramienta de ejemplo: consulta el estado de la neurona. */
export function crearHerramientaEstado() {
  return createTool({
    id: "estado-neurona",
    description: "Devuelve el estado de la neurona donde vive este agente.",
    inputSchema: z.object({}),
    execute: async () => estadoNeurona(),
  });
}

/**
 * Modelo del enrutador propio: el servidor propio de IA en 127.0.0.1:4480,
 * protocolo OpenAI-compatible («chat»). Devuelve la config nativa que
 * @mastra/core interpreta directamente (OpenAICompatibleConfig).
 *
 * @param {{ modelo?: string, url?: string, apiKey?: string }} opc
 * @returns {{ id: string, url: string, apiKey: string, api: 'chat' }}
 */
export function crearModeloServidorPropio(opc = {}) {
  const modelo = opc.modelo ?? "local";
  const url = opc.url ?? URL_SERVIDOR_DE_IA;
  const apiKey = opc.apiKey ?? "no-hace-falta";
  return { id: `servidor-propio/${modelo}`, url, apiKey, api: "chat" };
}

/**
 * Construye el agente con el contrato OS. El modelo es inyectable para
 * poder probar con un modelo simulado (sin red y sin procesos).
 *
 * @param {{ model?: object }} opc
 */
export function crearAgente(opc = {}) {
  return new Agent({
    name: "agente-neurona",
    instructions: INSTRUCCIONES,
    tools: { "estado-neurona": crearHerramientaEstado() },
    model: opc.model ?? crearModeloServidorPropio(),
  });
}

/**
 * Instancia Mastra con el agente y la config del servidor: SOLO en
 * 127.0.0.1 (nunca 0.0.0.0). El agente es inyectable para tests. Sin
 * `storage` configurado: tienda en memoria, suficiente para arrancar.
 *
 * @param {{ agent?: object, host?: string, port?: number }} opc
 */
export function crearMastra(opc = {}) {
  return new Mastra({
    agents: { "agente-neurona": opc.agent ?? crearAgente() },
    server: { host: opc.host ?? HOST_EXTERIOR, port: opc.port ?? PUERTO_SERVIDOR },
  });
}

/**
 * Arranca el servidor Mastra local con Hono/X mínimos (sin Studio exterior):
 * registra las rutas del servidor de Mastra y escucha SOLO en 127.0.0.1.
 * Devuelve la app y una función `cerrar` para apagar el listener.
 *
 * @param {{ mastra?: object, host?: string, port?: number }} opc
 */
export async function iniciarServidor(opc = {}) {
  const mastra = opc.mastra ?? crearMastra();
  const host = opc.host ?? HOST_EXTERIOR;
  const port = opc.port ?? PUERTO_SERVIDOR;
  const app = new Hono();
  const servidor = new MastraServer({ mastra, app, prefix: "/api" });
  await servidor.init();
  const listener = serve({ fetch: app.fetch, hostname: host, port });
  return {
    app,
    servidor,
    cerrar: () =>
      new Promise((res) => {
        listener.close(() => res(undefined));
      }),
  };
}
