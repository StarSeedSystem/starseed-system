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
    const estado = herramientaDePrueba("estado", async (args) => ({
      contenido: [
        { tipo: "texto", texto: `timestamp: ${String(args.ts ?? "")}` },
        { tipo: "texto", texto: `activo: ${String(args.activo ?? true)}` },
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
});
