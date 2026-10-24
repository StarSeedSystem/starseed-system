import { describe, it, expect } from "vitest";
import { HERRAMIENTAS_GENESIS } from "../herramientas";

describe("herramientas MCP de Genesis", () => {
  const estado = HERRAMIENTAS_GENESIS.find(h => h.nombre === "estado")!;
  const tareasListar = HERRAMIENTAS_GENESIS.find(h => h.nombre === "tareas_listar")!;
  const tareasCrear = HERRAMIENTAS_GENESIS.find(h => h.nombre === "tareas_crear")!;
  const agentesListar = HERRAMIENTAS_GENESIS.find(h => h.nombre === "agentes_listar")!;
  const medidores = HERRAMIENTAS_GENESIS.find(h => h.nombre === "medidores")!;
  const proponer = HERRAMIENTAS_GENESIS.find(h => h.nombre === "proponer")!;
  const bibliotecaBuscar = HERRAMIENTAS_GENESIS.find(h => h.nombre === "biblioteca_buscar")!;
  const opcionesSugerir = HERRAMIENTAS_GENESIS.find(h => h.nombre === "opciones_sugerir")!;
  const chat = HERRAMIENTAS_GENESIS.find(h => h.nombre === "chat")!;

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

    const resultado = await estado.ejecutar(peticion.params.arguments);

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

    const resultado = await tareasListar.ejecutar(peticion.params.arguments);

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

    const resultado = await tareasCrear.ejecutar(peticion.params.arguments);

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

    const resultado = await agentesListar.ejecutar(peticion.params.arguments);

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

    const resultado = await medidores.ejecutar(peticion.params.arguments);

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

    const resultado = await proponer.ejecutar(peticion.params.arguments);

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

    const resultado = await bibliotecaBuscar.ejecutar(peticion.params.arguments);

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

    const resultado = await opcionesSugerir.ejecutar(peticion.params.arguments);

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

    const resultado = await chat.ejecutar(peticion.params.arguments);

    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Evento de chat registrado:");
    expect(resultado.contenido[1].texto).toContain("Prueba de evento");
  });
});