import { describe, it, expect } from "vitest";
import {
  atenderMcp,
  type HerramientaMcp,
  type RespuestaExitoJsonRpc,
  type RespuestaErrorJsonRpc,
} from "@/lib/genesis/mcp/protocolo";

describe("MCP route · protocolo básico (main actual sin auth)", () => {
  const herramientasBase: HerramientaMcp[] = [
    {
      nombre: "estado",
      descripcion: "Obtiene el estado del sistema",
      esquema: { type: "object", properties: {} as Record<string, unknown> },
      ejecutar: async (): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> => ({
        contenido: [{ tipo: "texto", texto: "ok" }],
      }),
    },
    {
      nombre: "tareas_listar",
      descripcion: "Lista tareas",
      esquema: { type: "object", properties: { limite: { type: "number" } } as Record<string, unknown> },
      ejecutar: async (args: Record<string, unknown>): Promise<{ contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean }> => ({
        contenido: [{ tipo: "texto", texto: `tareas con límite ${args.limite ?? 10}` }],
      }),
    },
  ];

  it("initialize devuelve nombre y capacidades", async () => {
    const peticion = { jsonrpc: "2.0", id: "1", method: "initialize" };
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasBase });
    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("1");
    expect("result" in respuesta).toBe(true);
    const result = (respuesta as RespuestaExitoJsonRpc).result as {
      serverInfo: { name: string; version: string };
      capabilities: { tools: Record<string, unknown> };
    };
    expect(result.serverInfo.name).toBe("starseed-genesis");
    expect(result.serverInfo.version).toBeDefined();
    expect(result.capabilities.tools).toBeDefined();
  });

  it("tools/list devuelve herramientas disponibles", async () => {
    const peticion = { jsonrpc: "2.0", id: "2", method: "tools/list" };
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasBase });
    expect("result" in respuesta).toBe(true);
    const result = (respuesta as RespuestaExitoJsonRpc).result as { tools: Array<{ name: string }> };
    expect(result.tools).toHaveLength(2);
    expect(result.tools.map((t) => t.name)).toEqual(["estado", "tareas_listar"]);
  });

  it("tools/call ejecuta herramienta con argumentos", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "3",
      method: "tools/call",
      params: { name: "tareas_listar", arguments: { limite: 5 } },
    };
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasBase });
    expect("result" in respuesta).toBe(true);
    const result = (respuesta as RespuestaExitoJsonRpc).result as { contenido: Array<{ tipo: string; texto: string }> };
    expect(result.contenido[0].texto).toContain("tareas con límite 5");
  });

  it("tools/call con herramienta inexistente devuelve error -32602", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "4",
      method: "tools/call",
      params: { name: "inexistente", arguments: {} },
    };
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasBase });
    expect("error" in respuesta).toBe(true);
    const error = (respuesta as RespuestaErrorJsonRpc).error;
    expect(error.code).toBe(-32602);
    expect(error.message).toBe("Herramienta no encontrada");
  });

  it("método desconocido devuelve error -32601", async () => {
    const peticion = { jsonrpc: "2.0", id: "5", method: "desconocido" };
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasBase });
    expect("error" in respuesta).toBe(true);
    const error = (respuesta as RespuestaErrorJsonRpc).error;
    expect(error.code).toBe(-32601);
    expect(error.message).toBe("Método no encontrado");
  });

  it("petición inválida devuelve error -32600", async () => {
    const peticion = { id: "6", method: "initialize" };
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasBase });
    expect("error" in respuesta).toBe(true);
    const error = (respuesta as RespuestaErrorJsonRpc).error;
    expect(error.code).toBe(-32600);
    expect(error.message).toBe("Solicitud inválida");
  });

  it("tools/call sin parámetros devuelve error -32602", async () => {
    const peticion = { jsonrpc: "2.0", id: "7", method: "tools/call" };
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasBase });
    expect("error" in respuesta).toBe(true);
    const error = (respuesta as RespuestaErrorJsonRpc).error;
    expect(error.code).toBe(-32602);
  });
});

/*
 * CASOS DE LA RAMA NUBE (no aplican en main actual):
 * - Requieren autenticación Bearer, sesiones, tokens con alcance, rate-limiting
 * - Requieren funciones conPermiso / filtrarHerramientas que no existen en main
 * - La implementación de auth/permisos está en la rama nube-ola/40946608828/ola/VPU1019Y
 * - Cuando esa implementación llegue a main, estos tests deberán activarse.
 */

describe.skip("MCP route · auth y permisos (rama nube - requiere implementación)", () => {
  it("sin Bearer ni ámbito de sesión responde No autorizado y anota la denegación", () => {
    // Requiere: atenderPostMcp, banco(), peticionListar(), errorDe()
    // Espera: error.code === -32001, llamada tipo "denegado" statusCode 401
  });

  it("una cabecera mal formada o con token desconocido también se deniega", () => {
    // Requiere: atenderPostMcp con Bearer token inválido
    // Espera: error.code === -32001
  });

  it("con sesión el tools/list muestra todas las herramientas", () => {
    // Requiere: sesión con ámbito, herramientas ["estado", "tareas_listar", "chat"]
  });

  it("un token solo lista las herramientas de su alcance", () => {
    // Requiere: token con alcance ["estado:leer"] → solo herramienta "estado"
  });

  it("una llamada dentro del alcance se ejecuta y se registra sin datos sensibles", () => {
    // Requiere: token con alcance, verificar registro sin token en JSON
  });

  it("una llamada fuera del alcance no encuentra la herramienta", () => {
    // Requiere: token con alcance ["estado:leer"] llamando "chat" → error -32602
  });

  it("un token expirado se deniega", () => {
    // Requiere: crearToken con caducidad, verificar error -32001 y tipo "denegado"
  });

  it("alcanzar el límite responde 32002 y no ejecuta la herramienta", () => {
    // Requiere: límite de usos, segunda llamada → error -32002, statusCode 429
  });

  it("«*» concede todo y un permiso ajeno no concede", () => {
    // Requiere: función conPermiso(sesion, "chat:enviar") === true
    // Requiere: conPermiso(token, "chat:enviar") === false
  });

  it("filtrarHerramientas respeta el permiso de cada ficha", () => {
    // Requiere: función filtrarHerramientas(HERRAMIENTAS, token) → solo permitidas
  });
});