import { describe, it, expect } from "vitest";
import { atenderMcp, type HerramientaMcp } from "../protocolo";

function herramientasCompletas(): HerramientaMcp[] {
  return [
    {
      nombre: "estado",
      descripcion: "Obtiene el estado del sistema",
      esquema: { type: "object", properties: {} },
      ejecutar: async () => ({
        contenido: [{ tipo: "texto", texto: "timestamp: 2026-10-24T23:00:00Z\nactivo: true" }],
      }),
    },
    {
      nombre: "tareas_listar",
      descripcion: "Lista tareas",
      esquema: { type: "object", properties: { limite: { type: "number" } } },
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [
          { tipo: "texto", texto: "Tareas encontradas:" },
          { tipo: "texto", texto: "tarea-1" },
        ],
      }),
    },
    {
      nombre: "tareas_crear",
      descripcion: "Crea una tarea",
      esquema: { type: "object", properties: { titulo: { type: "string" }, descripcion: { type: "string" } } },
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [
          { tipo: "texto", texto: "Tarea creada:" },
          { tipo: "texto", texto: String(args.titulo ?? "") },
        ],
      }),
    },
    {
      nombre: "agentes_listar",
      descripcion: "Lista agentes",
      esquema: { type: "object", properties: { activo: { type: "boolean" } } },
      ejecutar: async () => ({
        contenido: [
          { tipo: "texto", texto: "Agentes encontrados:" },
          { tipo: "texto", texto: "Claude" },
        ],
      }),
    },
    {
      nombre: "medidores",
      descripcion: "Obtiene métricas",
      esquema: { type: "object", properties: { tipo: { type: "string" } } },
      ejecutar: async () => ({
        contenido: [{ tipo: "texto", texto: "cpu: 10%\nmemoria: 50%" }],
      }),
    },
    {
      nombre: "proponer",
      descripcion: "Proponer operación",
      esquema: { type: "object", properties: {} },
      ejecutar: async (args: Record<string, unknown>) => {
        const operacion = (args.operacion as Record<string, unknown>) || {};
        return {
          contenido: [
            { tipo: "texto", texto: "Operación propuesta:" },
            { tipo: "texto", texto: String(operacion.tipo ?? "") },
          ],
        };
      },
    },
    {
      nombre: "biblioteca_buscar",
      descripcion: "Buscar en biblioteca",
      esquema: { type: "object", properties: { query: { type: "string" }, limite: { type: "number" } } },
      ejecutar: async () => ({
        contenido: [
          { tipo: "texto", texto: "Resultados de biblioteca" },
          { tipo: "texto", texto: "starseed-os" },
        ],
      }),
    },
    {
      nombre: "opciones_sugerir",
      descripcion: "Sugerir opciones",
      esquema: { type: "object", properties: { ambito: { type: "string" } } },
      ejecutar: async () => ({
        contenido: [{ tipo: "texto", texto: "sugerencias disponibles" }],
      }),
    },
    {
      nombre: "chat",
      descripcion: "Chat/eventos",
      esquema: { type: "object", properties: {} },
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [
          { tipo: "texto", texto: "Evento de chat registrado:" },
          { tipo: "texto", texto: String(args.mensaje ?? "") },
        ],
      }),
    },
  ];
}

describe("herramientas MCP", () => {
  const herramientas = herramientasCompletas();

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
    expect("result" in respuesta).toBe(true);
    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(1);
    expect(resultado.contenido[0].texto).toContain("timestamp");
    expect(resultado.contenido[0].texto).toContain("activo");
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
    expect("result" in respuesta).toBe(true);
    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Tareas encontradas:");
    expect(resultado.contenido[1].texto).toContain("tarea-1");
  });

  it("tareas_crear crea una nueva tarea", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "3",
      method: "tools/call",
      params: {
        name: "tareas_crear",
        arguments: {
          titulo: "Nueva tarea",
          descripcion: "Descripción de la tarea",
        },
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas });
    expect(respuesta.jsonrpc).toBe("2.0");
    expect("result" in respuesta).toBe(true);
    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Tarea creada:");
    expect(resultado.contenido[1].texto).toContain("Nueva tarea");
  });

  it("agentes_listar devuelve lista de agentes", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "4",
      method: "tools/call",
      params: {
        name: "agentes_listar",
        arguments: { activo: true },
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas });
    expect(respuesta.jsonrpc).toBe("2.0");
    expect("result" in respuesta).toBe(true);
    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Agentes encontrados:");
    expect(resultado.contenido[1].texto).toContain("Claude");
  });

  it("medidores devuelve métricas del sistema", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "5",
      method: "tools/call",
      params: {
        name: "medidores",
        arguments: { tipo: "general" },
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas });
    expect(respuesta.jsonrpc).toBe("2.0");
    expect("result" in respuesta).toBe(true);
    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(1);
    expect(resultado.contenido[0].texto).toContain("cpu");
    expect(resultado.contenido[0].texto).toContain("memoria");
  });

  it("proponer valida y guarda una operación", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "6",
      method: "tools/call",
      params: {
        name: "proponer",
        arguments: {
          operacion: {
            tipo: "perfil.editar",
            motivo: "Probar operación",
            cambios: {
              nombre: "Nuevo nombre",
              bio: "Una biografía de prueba",
            },
          },
          motivo: "Esta es una prueba",
        },
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas });
    expect(respuesta.jsonrpc).toBe("2.0");
    expect("result" in respuesta).toBe(true);
    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Operación propuesta:");
    expect(resultado.contenido[1].texto).toContain("perfil.editar");
  });

  it("biblioteca_buscar encuentra paquetes", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "7",
      method: "tools/call",
      params: {
        name: "biblioteca_buscar",
        arguments: { query: "starseed", limite: 5 },
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas });
    expect(respuesta.jsonrpc).toBe("2.0");
    expect("result" in respuesta).toBe(true);
    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Resultados de biblioteca");
    expect(resultado.contenido[1].texto).toContain("starseed-os");
  });

  it("opciones_sugerir devuelve sugerencias", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "8",
      method: "tools/call",
      params: {
        name: "opciones_sugerir",
        arguments: { ambito: "persona" },
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas });
    expect(respuesta.jsonrpc).toBe("2.0");
    expect("result" in respuesta).toBe(true);
    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(1);
    expect(resultado.contenido[0].texto).toContain("sugerencias");
  });

  it("chat registra un evento", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "9",
      method: "tools/call",
      params: {
        name: "chat",
        arguments: {
          mensaje: "Prueba de evento",
          tipo: "hecho",
        },
      },
    };

    const respuesta = await atenderMcp(peticion, { herramientas });
    expect(respuesta.jsonrpc).toBe("2.0");
    expect("result" in respuesta).toBe(true);
    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Evento de chat registrado:");
    expect(resultado.contenido[1].texto).toContain("Prueba de evento");
  });
});
