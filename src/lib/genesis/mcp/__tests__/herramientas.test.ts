import { describe, it, expect } from "vitest";
import {
  atenderMcp,
  type HerramientaMcp,
  type RespuestaJsonRpc,
  type RespuestaExitoJsonRpc,
} from "../protocolo";

type Bloque = { tipo: "texto"; texto: string };
type ResultadoHerramienta = { contenido: Bloque[]; esError?: boolean };

function herramientaDePrueba(
  nombre: string,
  ejecutar: (args: Record<string, unknown>) => Promise<ResultadoHerramienta>
): HerramientaMcp {
  return {
    nombre,
    descripcion: `Herramienta de prueba ${nombre}`,
    esquema: { type: "object", properties: {} },
    ejecutar,
  };
}

async function llamarHerramienta(
  herramientas: HerramientaMcp[],
  name: string,
  args: Record<string, unknown>
): Promise<RespuestaJsonRpc> {
  return atenderMcp(
    {
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: { name, arguments: args },
    },
    { herramientas }
  );
}

function resultadoDe(respuesta: RespuestaJsonRpc): ResultadoHerramienta {
  expect("result" in respuesta).toBe(true);
  const exito = respuesta as RespuestaExitoJsonRpc;
  const valor = exito.result;
  if (typeof valor !== "object" || valor === null) {
    throw new Error("El resultado no es un objeto");
  }
  const contenido = (valor as { contenido?: unknown }).contenido;
  if (!Array.isArray(contenido)) {
    throw new Error("El resultado no trae lista de contenido");
  }
  return { contenido: contenido as Bloque[] };
}

describe("herramientas MCP · tools/call", () => {
  it("ejecuta una herramienta con argumentos vacíos", async () => {
    const estado = herramientaDePrueba("estado", async () => ({
      contenido: [
        { tipo: "texto", texto: "timestamp: 2026-10-26T10:00:00Z" },
        { tipo: "texto", texto: "activo: true" },
      ],
    }));

    const respuesta = await llamarHerramienta([estado], "estado", {});
    const resultado = resultadoDe(respuesta);

    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("timestamp");
    expect(resultado.contenido[1].texto).toContain("activo");
  });

  it("conserva varios bloques de contenido en orden", async () => {
    const tareasCrear = herramientaDePrueba("tareas_crear", async (args) => ({
      contenido: [
        { tipo: "texto", texto: `Tarea creada: ${String(args.titulo ?? "")}` },
        { tipo: "texto", texto: `Descripción: ${String(args.descripcion ?? "")}` },
        { tipo: "texto", texto: "cola: prioridad" },
      ],
    }));

    const respuesta = await llamarHerramienta([tareasCrear], "tareas_crear", {
      titulo: "Nueva tarea",
      descripcion: "Descripción de la tarea",
    });
    const resultado = resultadoDe(respuesta);

    expect(resultado.contenido).toHaveLength(3);
    expect(resultado.contenido[0].texto).toBe("Tarea creada: Nueva tarea");
    expect(resultado.contenido[1].texto).toBe("Descripción: Descripción de la tarea");
    expect(resultado.contenido[2].texto).toBe("cola: prioridad");
  });

  it("reenvía argumentos anidados sin perder campos", async () => {
    const proponer = herramientaDePrueba("proponer", async (args) => {
      const operacion = args.operacion as
        | { tipo?: unknown; cambios?: { nombre?: unknown } }
        | undefined;
      return {
        contenido: [
          { tipo: "texto", texto: `Operación propuesta: ${String(operacion?.tipo ?? "")}` },
          { tipo: "texto", texto: `Cambio: ${String(operacion?.cambios?.nombre ?? "")}` },
        ],
      };
    });

    const respuesta = await llamarHerramienta([proponer], "proponer", {
      operacion: {
        tipo: "perfil.editar",
        motivo: "Probar operación",
        cambios: { nombre: "Nuevo nombre", bio: "Una biografía de prueba" },
      },
      motivo: "Esta es una prueba",
    });
    const resultado = resultadoDe(respuesta);

    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toBe("Operación propuesta: perfil.editar");
    expect(resultado.contenido[1].texto).toBe("Cambio: Nuevo nombre");
  });

  it("tareas_listar devuelve lista de tareas con límite", async () => {
    const tareasListar = herramientaDePrueba("tareas_listar", async (args) => ({
      contenido: [
        { tipo: "texto", texto: "Tareas encontradas:" },
        { tipo: "texto", texto: "tarea-1" },
        { tipo: "texto", texto: "tarea-2" },
      ],
    }));

    const respuesta = await llamarHerramienta([tareasListar], "tareas_listar", { limite: 5 });
    const resultado = resultadoDe(respuesta);

    expect(resultado.contenido).toHaveLength(3);
    expect(resultado.contenido[0].texto).toContain("Tareas encontradas:");
    expect(resultado.contenido[1].texto).toContain("tarea-1");
  });

  it("agentes_listar devuelve lista de agentes activos", async () => {
    const agentesListar = herramientaDePrueba("agentes_listar", async (args) => ({
      contenido: [
        { tipo: "texto", texto: "Agentes encontrados:" },
        { tipo: "texto", texto: "Claude" },
        { tipo: "texto", texto: "Codex" },
      ],
    }));

    const respuesta = await llamarHerramienta([agentesListar], "agentes_listar", { activo: true });
    const resultado = resultadoDe(respuesta);

    expect(resultado.contenido).toHaveLength(3);
    expect(resultado.contenido[0].texto).toContain("Agentes encontrados:");
    expect(resultado.contenido[1].texto).toContain("Claude");
  });

  it("medidores devuelve métricas del sistema", async () => {
    const medidores = herramientaDePrueba("medidores", async () => ({
      contenido: [{ tipo: "texto", texto: "cpu: 45%, memoria: 62%, disco: 38%" }],
    }));

    const respuesta = await llamarHerramienta([medidores], "medidores", { tipo: "general" });
    const resultado = resultadoDe(respuesta);

    expect(resultado.contenido).toHaveLength(1);
    expect(resultado.contenido[0].texto).toContain("cpu");
    expect(resultado.contenido[0].texto).toContain("memoria");
  });

  it("biblioteca_buscar encuentra paquetes", async () => {
    const bibliotecaBuscar = herramientaDePrueba("biblioteca_buscar", async (args) => ({
      contenido: [
        { tipo: "texto", texto: `Resultados de biblioteca para "${args.query ?? ""}"` },
        { tipo: "texto", texto: "starseed-os" },
      ],
    }));

    const respuesta = await llamarHerramienta([bibliotecaBuscar], "biblioteca_buscar", { query: "starseed", limite: 5 });
    const resultado = resultadoDe(respuesta);

    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Resultados de biblioteca");
    expect(resultado.contenido[1].texto).toContain("starseed-os");
  });

  it("opciones_sugerir devuelve sugerencias", async () => {
    const opcionesSugerir = herramientaDePrueba("opciones_sugerir", async (args) => ({
      contenido: [{ tipo: "texto", texto: `Sugerencias para "${args.ambito ?? ""}"` }],
    }));

    const respuesta = await llamarHerramienta([opcionesSugerir], "opciones_sugerir", { ambito: "persona" });
    const resultado = resultadoDe(respuesta);

    expect(resultado.contenido).toHaveLength(1);
    expect(resultado.contenido[0].texto).toContain("Sugerencias para");
  });

  it("chat registra un evento", async () => {
    const chat = herramientaDePrueba("chat", async (args) => ({
      contenido: [
        { tipo: "texto", texto: `Evento de chat registrado: ${args.tipo ?? "desconocido"}` },
        { tipo: "texto", texto: `${args.mensaje ?? "Sin mensaje"}` },
      ],
    }));

    const respuesta = await llamarHerramienta([chat], "chat", { mensaje: "Prueba de evento", tipo: "hecho" });
    const resultado = resultadoDe(respuesta);

    expect(resultado.contenido).toHaveLength(2);
    expect(resultado.contenido[0].texto).toContain("Evento de chat registrado:");
    expect(resultado.contenido[1].texto).toContain("Prueba de evento");
  });
});
