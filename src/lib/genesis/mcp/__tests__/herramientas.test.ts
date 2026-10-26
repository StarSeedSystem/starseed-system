import { describe, it, expect } from "vitest";
import { atenderMcp, type HerramientaMcp } from "../protocolo";

const herramientasActuales: HerramientaMcp[] = [
  {
    nombre: "estado",
    descripcion: "Obtiene el estado del sistema",
    esquema: { type: "object", properties: {} },
    ejecutar: async () => ({
      contenido: [{ tipo: "texto", texto: "ok" }],
    }),
  },
  {
    nombre: "tareas_listar",
    descripcion: "Lista tareas",
    esquema: { type: "object", properties: { limite: { type: "number" } } },
    ejecutar: async (args: Record<string, unknown>) => ({
      contenido: [{ tipo: "texto", texto: `tareas con límite ${args.limite ?? 10}` }],
    }),
  },
];

describe("herramientas MCP actuales", () => {
  it("estado devuelve ok", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: {
        name: "estado",
        arguments: {},
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas: herramientasActuales });

    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("1");
    expect("result" in respuesta).toBe(true);

    const result = (respuesta as { result: unknown }).result;
    expect(result).toEqual({
      contenido: [{ tipo: "texto", texto: "ok" }],
    });
  });

  it("tareas_listar devuelve lista con límite por defecto", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "2",
      method: "tools/call",
      params: {
        name: "tareas_listar",
        arguments: {},
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas: herramientasActuales });

    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("2");
    expect("result" in respuesta).toBe(true);

    const result = (respuesta as { result: unknown }).result;
    expect(result).toEqual({
      contenido: [{ tipo: "texto", texto: "tareas con límite 10" }],
    });
  });

  it("tareas_listar devuelve lista con límite personalizado", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "3",
      method: "tools/call",
      params: {
        name: "tareas_listar",
        arguments: { limite: 5 },
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas: herramientasActuales });

    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("3");
    expect("result" in respuesta).toBe(true);

    const result = (respuesta as { result: unknown }).result;
    expect(result).toEqual({
      contenido: [{ tipo: "texto", texto: "tareas con límite 5" }],
    });
  });

  it("herramienta inexistente devuelve error -32602", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "4",
      method: "tools/call",
      params: {
        name: "inexistente",
        arguments: {},
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas: herramientasActuales });

    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("4");
    expect("error" in respuesta).toBe(true);

    const error = (respuesta as { error: { code: number; message: string } }).error;
    expect(error.code).toBe(-32602);
    expect(error.message).toBe("Herramienta no encontrada");
  });
});