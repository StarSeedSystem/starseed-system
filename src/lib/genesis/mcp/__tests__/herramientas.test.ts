import { describe, it, expect } from "vitest";
import { atenderMcp, type HerramientaMcp } from "../protocolo";

describe("herramientas MCP", () => {
  const herramientas: HerramientaMcp[] = [
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

  it("estado devuelve estado del sistema", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: {
        name: "estado",
        arguments: {},
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas });
    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("1");
    expect("result" in respuesta).toBe(true);

    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(1);
    expect(resultado.contenido[0].texto).toContain("ok");
  });

  it("tareas_listar devuelve lista de tareas", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "2",
      method: "tools/call",
      params: {
        name: "tareas_listar",
        arguments: { limite: 5 },
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas });
    expect(respuesta.jsonrpc).toBe("2.0");
    expect(respuesta.id).toBe("2");
    expect("result" in respuesta).toBe(true);

    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(1);
    expect(resultado.contenido[0].texto).toContain("tareas con límite 5");
  });
});