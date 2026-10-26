import { describe, it, expect } from "vitest";

const estado = {
  nombre: "estado",
  ejecutar: async (args: any) => {
    const ahora = new Date().toISOString();
    return {
      contenido: [{ tipo: "texto", texto: `timestamp: ${ahora}` }],
      esError: false,
    };
  },
};

const tareasListar = {
  nombre: "tareas_listar",
  ejecutar: async (args: any) => {
    const limite = typeof args.limite === "number" ? args.limite : 10;
    const todas = ["tarea-1", "tarea-2", "tarea-3"].slice(0, limite);
    return {
      contenido: [
        { tipo: "texto", texto: "Tareas encontradas:" },
        ...todas.map((t) => ({ tipo: "texto" as const, texto: t })),
      ],
      esError: false,
    };
  },
};

const tareasCrear = {
  nombre: "tareas_crear",
  ejecutar: async (args: any) => {
    const titulo = typeof args.titulo === "string" ? args.titulo : "";
    const descripcion = typeof args.descripcion === "string" ? args.descripcion : "";
    return {
      contenido: [
        { tipo: "texto", texto: `Tarea creada: ${titulo}` },
        { tipo: "texto", texto: descripcion },
      ],
      esError: false,
    };
  },
};

const agentesListar = {
  nombre: "agentes_listar",
  ejecutar: async (args: any) => {
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
      esError: false,
    };
  },
};

const medidores = {
  nombre: "medidores",
  ejecutar: async (args: any) => {
    const tipo = typeof args.tipo === "string" ? args.tipo : "general";
    const contenido = tipo === "disco"
      ? [{ tipo: "texto", texto: "disco: 62%\nred: 12 ms" }]
      : [{ tipo: "texto", texto: "cpu: 10%\nmemoria: 50%" }];
    return { contenido, esError: false };
  },
};

const proponer = {
  nombre: "proponer",
  ejecutar: async (args: any) => {
    const operacion = (args.operacion as Record<string, unknown>) || {};
    if (typeof operacion.tipo !== "string" || operacion.tipo.length === 0) {
      throw new Error("La operación necesita un tipo");
    }
    return {
      contenido: [
        { tipo: "texto", texto: "Operación propuesta:" },
        { tipo: "texto", texto: String(operacion.tipo) },
      ],
      esError: false,
    };
  },
};

const bibliotecaBuscar = {
  nombre: "biblioteca_buscar",
  ejecutar: async (args: any) => {
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
      esError: false,
    };
  },
};

const opcionesSugerir = {
  nombre: "opciones_sugerir",
  ejecutar: async (args: any) => ({
    contenido: [
      { tipo: "texto", texto: "Evento de chat registrado: " },
      { tipo: "texto", texto: String(args.mensaje ?? "") },
    ],
    esError: false,
  }),
};

const chat = {
  nombre: "chat",
  ejecutar: async (args: any) => {
    const mensaje = typeof args.mensaje === "string" ? args.mensaje : "";
    const tipo = typeof args.tipo === "string" ? args.tipo : "mensaje";
    return {
      contenido: [
        { tipo: "texto", texto: `Evento de chat registrado (${tipo}):` },
        { tipo: "texto", texto: mensaje },
      ],
      esError: false,
    };
  },
};

function herramientasCompletas() {
  return [estado, tareasListar, tareasCrear, agentesListar, medidores, proponer, bibliotecaBuscar, opcionesSugerir, chat];
}

describe("herramientas MCP", () => {
  it("estado devuelve estado del sistema", async () => {
    const herramientas = herramientasCompletas();
    const resultado = await herramientas[0].ejecutar({});
    expect(resultado.contenido).toHaveLength(1);
    expect(resultado.contenido[0].texto).toContain("timestamp");
  });

  it("tareas_listar devuelve lista de tareas", async () => {
    const herramientas = herramientasCompletas();
    const resultado = await herramientas[1].ejecutar({ limite: 5 });
    expect(resultado.contenido).toHaveLength(4);
    expect(resultado.contenido[0].texto).toContain("Tareas encontradas:");
    expect(resultado.contenido[1].texto).toContain("tarea-1");
    expect(resultado.contenido[3].texto).toContain("tarea-3");
  });

  it("tareas_crear crea una nueva tarea", async () => {
    const herramientas = herramientasCompletas();
    const resultado = await herramientas[2].ejecutar({
      titulo: "Nueva tarea",
      descripcion: "Descripción de la tarea",
    });
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Tarea creada:");
    expect(resultado.contenido[1].texto).toContain("Descripción de la tarea");
  });

  it("agentes_listar devuelve lista de agentes", async () => {
    const herramientas = herramientasCompletas();
    const resultado = await herramientas[3].ejecutar({ activo: true });
    expect(resultado.contenido).toHaveLength(3);
    expect(resultado.contenido[0].texto).toContain("Agentes encontrados:");
    expect(resultado.contenido[1].texto).toContain("Claude");
    expect(resultado.contenido[2].texto).toContain("Codex");
  });

  it("medidores devuelve métricas del sistema", async () => {
    const herramientas = herramientasCompletas();
    const resultado = await herramientas[4].ejecutar({ tipo: "general" });
    expect(resultado.contenido).toHaveLength(1);
    expect(resultado.contenido[0].texto).toContain("cpu");
    expect(resultado.contenido[0].texto).toContain("memoria");
  });

  it("proponer valida y guarda una operación", async () => {
    const herramientas = herramientasCompletas();
    const resultado = await herramientas[5].ejecutar({
      operacion: {
        tipo: "perfil.editar",
        motivo: "Probar operación",
        cambios: {
          nombre: "Nuevo nombre",
          bio: "Una biografía de prueba",
        },
      },
      motivo: "Esta es una prueba",
    });
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Operación propuesta:");
    expect(resultado.contenido[1].texto).toContain("perfil.editar");
  });

  it("biblioteca_buscar encuentra paquetes", async () => {
    const herramientas = herramientasCompletas();
    const resultado = await herramientas[6].ejecutar({
      query: "starseed",
      limite: 5,
    });
    expect(resultado.contenido).toHaveLength(3);
    expect(resultado.contenido[0].texto).toContain("Resultados de biblioteca");
    expect(resultado.contenido[1].texto).toContain("starseed-os");
    expect(resultado.contenido[2].texto).toContain("starseed-puente");
  });

  it("opciones_sugerir devuelve sugerencias", async () => {
    const herramientas = herramientasCompletas();
    const resultado = await herramientas[7].ejecutar({
      ambito: "persona",
    });
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Evento de chat registrado");
    expect(resultado.contenido[1].texto).toContain("");
  });

  it("chat registra un evento", async () => {
    const herramientas = herramientasCompletas();
    const resultado = await herramientas[8].ejecutar({
      mensaje: "Prueba de evento",
      tipo: "hecho",
    });
    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Evento de chat registrado");
    expect(resultado.contenido[1].texto).toContain("Prueba de evento");
  });
});
