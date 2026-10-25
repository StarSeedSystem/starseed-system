import { describe, it, expect } from "vitest";
import { atenderMcp, type HerramientaMcp, type RespuestaJsonRpc } from "../protocolo";

interface ResultadoLlamada {
  contenido: Array<{ tipo: "texto"; texto: string }>;
  esError?: boolean;
}

export async function resultadoLlamada(
  peticion: unknown,
  herramientas: HerramientaMcp[]
): Promise<ResultadoLlamada> {
  const respuesta: RespuestaJsonRpc = await atenderMcp(peticion, { herramientas });
  expect(respuesta.jsonrpc).toBe("2.0");
  if (!("result" in respuesta)) {
    throw new Error(`Respuesta de error inesperada: ${respuesta.error.message}`);
  }
  return respuesta.result as ResultadoLlamada;
}

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
      ejecutar: async (args: Record<string, unknown>) => {
        const limite = typeof args.limite === "number" ? args.limite : 10;
        const todas = ["tarea-1", "tarea-2", "tarea-3"].slice(0, limite);
        return {
          contenido: [{ tipo: "texto", texto: "Tareas encontradas:" }, ...todas.map((t) => ({ tipo: "texto" as const, texto: t }))],
        };
      },
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
      ejecutar: async (args: Record<string, unknown>) => {
        const todos = [
          { nombre: "Claude", activo: true },
          { nombre: "Codex", activo: true },
          { nombre: "Hermes", activo: false },
        ];
        const visibles = typeof args.activo === "boolean"
          ? todos.filter((a) => a.activo === args.activo)
          : todos;
        return {
          contenido: [
            { tipo: "texto", texto: "Agentes encontrados:" },
            ...visibles.map((a) => ({ tipo: "texto" as const, texto: a.nombre })),
          ],
        };
      },
    },
    {
      nombre: "medidores",
      descripcion: "Obtiene métricas",
      esquema: { type: "object", properties: { tipo: { type: "string" } } },
      ejecutar: async (args: Record<string, unknown>) => ({
        contenido: [
          {
            tipo: "texto",
            texto:
              args.tipo === "disco"
                ? "disco: 62%\nred: 12 ms"
                : "cpu: 10%\nmemoria: 50%",
          },
        ],
      }),
    },
    {
      nombre: "proponer",
      descripcion: "Proponer operación",
      esquema: { type: "object", properties: {} },
      ejecutar: async (args: Record<string, unknown>) => {
        const operacion = (args.operacion as Record<string, unknown>) || {};
        if (typeof operacion.tipo !== "string" || operacion.tipo.length === 0) {
          throw new Error("La operación necesita un tipo");
        }
        return {
          contenido: [
            { tipo: "texto", texto: "Operación propuesta:" },
            { tipo: "texto", texto: String(operacion.tipo) },
          ],
        };
      },
    },
    {
      nombre: "biblioteca_buscar",
      descripcion: "Buscar en biblioteca",
      esquema: { type: "object", properties: { query: { type: "string" }, limite: { type: "number" } } },
      ejecutar: async (args: Record<string, unknown>) => {
        const paquetes = ["starseed-os", "starseed-puente", "vocal-remotion"];
        const consulta = typeof args.query === "string" ? args.query.toLowerCase() : "";
        const coincidentes = consulta
          ? paquetes.filter((p) => p.toLowerCase().includes(consulta))
          : paquetes;
        const limite = typeof args.limite === "number" ? args.limite : 10;
        const visibles = coincidentes.slice(0, limite);
        return {
          contenido: [
            { tipo: "texto", texto: "Resultados de biblioteca" },
            ...visibles.map((p) => ({ tipo: "texto" as const, texto: p })),
          ],
        };
      },
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
          {
            tipo: "texto",
            texto: `Evento de chat registrado (${String(args.tipo ?? "mensaje")}):`,
          },
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

    const resultado = await resultadoLlamada(peticion, herramientas);
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

    const resultado = await resultadoLlamada(peticion, herramientas);
    expect(resultado.contenido).toHaveLength(4);
    expect(resultado.contenido[0].texto).toContain("Tareas encontradas:");
    expect(resultado.contenido[1].texto).toContain("tarea-1");
    expect(resultado.contenido[3].texto).toContain("tarea-3");
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

    const resultado = await resultadoLlamada(peticion, herramientas);
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

    const resultado = await resultadoLlamada(peticion, herramientas);
    expect(resultado.contenido).toHaveLength(3);
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

    const resultado = await resultadoLlamada(peticion, herramientas);
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

    const resultado = await resultadoLlamada(peticion, herramientas);
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

    const resultado = await resultadoLlamada(peticion, herramientas);
    expect(resultado.contenido).toHaveLength(3);
    expect(resultado.contenido[0].texto).toContain("Resultados de biblioteca");
    expect(resultado.contenido[1].texto).toContain("starseed-os");
    expect(resultado.contenido[2].texto).toContain("starseed-puente");
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

    const resultado = await resultadoLlamada(peticion, herramientas);
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

    const resultado = await resultadoLlamada(peticion, herramientas);
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Evento de chat registrado");
    expect(resultado.contenido[0].texto).toContain("hecho");
    expect(resultado.contenido[1].texto).toContain("Prueba de evento");
  });
  it("tareas_listar respeta el límite pedido", async () => {
    const resultado = await resultadoLlamada(
      { jsonrpc: "2.0", id: "10", method: "tools/call", params: { name: "tareas_listar", arguments: { limite: 1 } } },
      herramientas
    );
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[1].texto).toContain("tarea-1");
    expect(JSON.stringify(resultado.contenido)).not.toContain("tarea-2");
  });

  it("agentes_listar filtra por activo", async () => {
    const resultado = await resultadoLlamada(
      { jsonrpc: "2.0", id: "11", method: "tools/call", params: { name: "agentes_listar", arguments: { activo: true } } },
      herramientas
    );
    const nombres = JSON.stringify(resultado.contenido);
    expect(nombres).toContain("Claude");
    expect(nombres).toContain("Codex");
    expect(nombres).not.toContain("Hermes");
  });

  it("biblioteca_buscar filtra por la consulta recibida", async () => {
    const resultado = await resultadoLlamada(
      {
        jsonrpc: "2.0",
        id: "12",
        method: "tools/call",
        params: { name: "biblioteca_buscar", arguments: { query: "vocal", limite: 5 } },
      },
      herramientas
    );
    expect(JSON.stringify(resultado.contenido)).toContain("vocal-remotion");
    expect(JSON.stringify(resultado.contenido)).not.toContain("starseed-os");
  });

  it("medidores cambia de métricas según el tipo", async () => {
    const resultado = await resultadoLlamada(
      { jsonrpc: "2.0", id: "13", method: "tools/call", params: { name: "medidores", arguments: { tipo: "disco" } } },
      herramientas
    );
    expect(resultado.contenido[0].texto).toContain("disco");
    expect(resultado.contenido[0].texto).not.toContain("cpu");
  });

  it("proponer rechaza una operación sin tipo", async () => {
    const peticion = {
      jsonrpc: "2.0",
      id: "14",
      method: "tools/call",
      params: { name: "proponer", arguments: { operacion: { motivo: "sin tipo" } } },
    };
    const resultado = await resultadoLlamada(peticion, herramientas);
    expect(resultado.esError).toBe(true);
    expect(resultado.contenido[0].texto).toContain("tipo");
  });
});
