import { describe, it, expect } from "vitest";
import { atenderMcp } from "../protocolo";

describe("protocolo MCP", () => {
  const herramientasFalsas = [
    {
      nombre: "estado",
      descripcion: "Obtiene el estado del sistema",
      esquema: { type: "object", properties: {} as Record<string, unknown> },
      ejecutar: async (args: Record<string, unknown>, ctx?: unknown) => ({
        contenido: [{ tipo: "texto", texto: "ok" }],
      }),
    },
    {
      nombre: "tareas_listar",
      descripcion: "Lista tareas",
      esquema: { type: "object", properties: { limite: { type: "number" } } } as Record<string, unknown>,
      ejecutar: async (args: Record<string, unknown>, ctx?: unknown) => ({
        contenido: [{ tipo: "texto", texto: `tareas con límite ${args.limite ?? 10}` }],
      }),
    },
  ];

  it("initialize devuelve nombre y capacidades", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "1",
      method: "initialize",
    };
    
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasFalsas });
    
    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("1");
    expect("result" in respuesta).toBe(true);
    
    const result = (respuesta as any).result;
    expect(result.serverInfo.name).toBe("starseed-genesis");
    expect(result.serverInfo.version).toBeDefined();
    expect(result.capabilities.tools).toBeDefined();
  });

  it("tools/list devuelve herramientas disponibles", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "2",
      method: "tools/list",
    };
    
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasFalsas });
    
    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("2");
    expect("result" in respuesta).toBe(true);
    
    const result = (respuesta as any).result;
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].name).toBe("estado");
    expect(result.tools[1].name).toBe("tareas_listar");
  });

  it("tools/call ejecuta herramienta con argumentos", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "3",
      method: "tools/call",
      params: {
        name: "tareas_listar",
        arguments: { limite: 5 },
      },
    };
    
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasFalsas });
    
    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("3");
    expect("result" in respuesta).toBe(true);
    
    const result = (respuesta as any).result;
    expect(result.contenido).toBeDefined();
    expect(result.contenido[0].texto).toContain("tareas con límite 5");
  });

  it("tools/call con herramienta inexistente devuelve error -32602", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "4",
      method: "tools/call",
      params: {
        name: "inexistente",
        arguments: {},
      },
    };
    
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasFalsas });
    
    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("4");
    expect("error" in respuesta).toBe(true);
    
    const error = (respuesta as any).error;
    expect(error.code).toBe(-32602);
    expect(error.message).toBe("Herramienta no encontrada");
  });

  it("método desconocido devuelve error -32601", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "5",
      method: "desconocido",
    };
    
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasFalsas });
    
    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("5");
    expect("error" in respuesta).toBe(true);
    
    const error = (respuesta as any).error;
    expect(error.code).toBe(-32601);
    expect(error.message).toBe("Método no encontrado");
  });

  it("petición inválida devuelve error -32600", async () => {
    const peticion = {
      id: "6",
      method: "initialize",
    };
    
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasFalsas });
    
    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBeNull();
    expect("error" in respuesta).toBe(true);
    
    const error = (respuesta as any).error;
    expect(error.code).toBe(-32600);
    expect(error.message).toBe("Solicitud inválida");
  });

  it("tools/call sin parámetros devuelve error -32602", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "7",
      method: "tools/call",
    };
    
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasFalsas });
    
    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("7");
    expect("error" in respuesta).toBe(true);
    
    const error = (respuesta as any).error;
    expect(error.code).toBe(-32602);
  });

  it("lotes no soportados - petición fuera de secuencia", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "8",
      method: "initialize",
      params: "valor_no_objeto",
    };
    
    const respuesta = await atenderMcp(peticion, { herramientas: herramientasFalsas });
    
    expect(respuesta.jsonrpc).toBe("2.0");
    expect("error" in respuesta || "result" in respuesta).toBe(true);
  });
});
