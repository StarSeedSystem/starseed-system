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
    {
      nombre: "tareas_crear",
      descripcion: "Crea una nueva tarea",
      esquema: { type: "object", properties: { titulo: { type: "string" }, descripcion: { type: "string" } } },
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [
          { tipo: "texto", texto: `Tarea creada: ${args.titulo ?? "Sin título"}` },
          { tipo: "texto", texto: `${args.descripcion ?? "Sin descripción"}` },
        ],
      }),
    },
    {
      nombre: "agentes_listar",
      descripcion: "Lista agentes",
      esquema: { type: "object", properties: { activo: { type: "boolean" } } },
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [
          { tipo: "texto", texto: `Agentes encontrados: ${args.activo === false ? "inactivos" : "activos"}` },
          { tipo: "texto", texto: "Claude" },
        ],
      }),
    },
    {
      nombre: "medidores",
      descripcion: "Devuelve métricas del sistema",
      esquema: { type: "object", properties: { tipo: { type: "string" } } },
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [{ tipo: "texto", texto: `cpu: 50%, memoria: 60%, disco: 70%` }],
      }),
    },
    {
      nombre: "proponer",
      descripcion: "Valida y guarda una operación",
      esquema: { type: "object", properties: { operacion: { type: "object" }, motivo: { type: "string" } } },
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [
          { tipo: "texto", texto: `Operación propuesta: ${(args.operacion as Record<string, unknown>)?.tipo ?? "desconocida"}` },
          { tipo: "texto", texto: (args.motivo as string) ?? "Sin motivo" },
        ],
      }),
    },
    {
      nombre: "biblioteca_buscar",
      descripcion: "Busca paquetes",
      esquema: { type: "object", properties: { query: { type: "string" }, limite: { type: "number" } } },
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [
          { tipo: "texto", texto: `Resultados de biblioteca para "${args.query ?? ""}"` },
          { tipo: "texto", texto: `starseed-os` },
        ],
      }),
    },
    {
      nombre: "opciones_sugerir",
      descripcion: "Devuelve sugerencias",
      esquema: { type: "object", properties: { ambito: { type: "string" } } },
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [{ tipo: "texto", texto: `Sugerencias para "${args.ambito ?? ""}"` }],
      }),
    },
    {
      nombre: "chat",
      descripcion: "Registra un evento de chat",
      esquema: { type: "object", properties: { mensaje: { type: "string" }, tipo: { type: "string" } } },
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [
          { tipo: "texto", texto: `Evento de chat registrado: ${(args.tipo as string) ?? "desconocido"}` },
          { tipo: "texto", texto: `${args.mensaje ?? "Sin mensaje"}` },
        ],
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
    expect(respuesta.id).toBe("3");
    expect("result" in respuesta).toBe(true);

    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Tarea creada:");
    expect(resultado.contenido[0].texto).toContain("Nueva tarea");
    expect(resultado.contenido[1].texto).toContain("Descripción de la tarea");
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
    expect(respuesta.id).toBe("4");
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
    expect(respuesta.id).toBe("5");
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
    expect(respuesta.id).toBe("6");
    expect("result" in respuesta).toBe(true);

    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Operación propuesta:");
    expect(resultado.contenido[0].texto).toContain("perfil.editar");
    expect(resultado.contenido[1].texto).toContain("Esta es una prueba");
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
    expect(respuesta.id).toBe("7");
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
    expect(respuesta.id).toBe("8");
    expect("result" in respuesta).toBe(true);

    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(1);
    expect(resultado.contenido[0].texto).toContain("Sugerencias para");
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
    expect(respuesta.id).toBe("9");
    expect("result" in respuesta).toBe(true);

    const resultado = (respuesta as any).result;
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Evento de chat registrado:");
    expect(resultado.contenido[1].texto).toContain("Prueba de evento");
  });
});