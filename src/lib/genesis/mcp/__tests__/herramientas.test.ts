import { describe, it, expect } from "vitest";
import {
  atenderMcp,
  type HerramientaMcp,
  type RespuestaJsonRpc,
  type RespuestaExitoJsonRpc,
} from "../protocolo";
import {
  estado,
  tareas_listar,
  tareas_crear,
  agentes_listar,
  medidores,
  proposer,
  biblioteca_buscar,
  opciones_sugerir,
  chat,
  HERRAMIENTAS_MCP,
  type FichaHerramientaMcp,
} from "../herramientas";

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

function validarEsquema(herramienta: FichaHerramientaMcp): void {
  const esquema = herramienta.esquema as Record<string, unknown>;
  expect(esquema).toBeDefined();
  expect(typeof esquema.type).toBe("string");
  if (esquema.properties) {
    expect(esquema.properties).toBeDefined();
    expect(typeof esquema.properties).toBe("object");
  }
  if (esquema.required) {
    expect(Array.isArray(esquema.required)).toBe(true);
  }
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

describe("herramientas MCP · esquemas válidos", () => {
  it("todas las herramientas tienen nombre, descripción y esquema válidos", () => {
    for (const herramienta of HERRAMIENTAS_MCP) {
      expect(herramienta.nombre).toBeDefined();
      expect(typeof herramienta.nombre).toBe("string");
      expect(herramienta.descripcion).toBeDefined();
      expect(typeof herramienta.descripcion).toBe("string");
      validarEsquema(herramienta);
    }
  });

  it("estado tiene esquema válido y nombre correcto", () => {
    expect(estado.nombre).toBe("estado");
    expect(estado.descripcion).toContain("estado");
    validarEsquema(estado);
    expect(estado.permiso).toBe("estado:leer");
  });

  it("tareas_listar tiene esquema con propiedad limite", () => {
    expect(tareas_listar.nombre).toBe("tareas_listar");
    const esquema = tareas_listar.esquema as Record<string, unknown>;
    expect(esquema.properties).toBeDefined();
    const props = esquema.properties as Record<string, unknown>;
    expect(props.limite).toBeDefined();
  });

  it("tareas_crear requiere titulo y descripcion", () => {
    expect(tareas_crear.nombre).toBe("tareas_crear");
    const esquema = tareas_crear.esquema as Record<string, unknown>;
    expect(esquema.required).toEqual(["titulo", "descripcion"]);
    validarEsquema(tareas_crear);
  });

  it("proponer requiere tipo, motivo y cambios", () => {
    expect(proposer.nombre).toBe("proponer");
    const esquema = proposer.esquema as Record<string, unknown>;
    expect(esquema.required).toEqual(["tipo", "motivo", "cambios"]);
    validarEsquema(proposer);
  });

  it("chat requiere destino y contenido", () => {
    expect(chat.nombre).toBe("chat");
    const esquema = chat.esquema as Record<string, unknown>;
    expect(esquema.required).toEqual(["destino", "contenido"]);
    validarEsquema(chat);
  });
});

describe("herramientas MCP · manejadores", () => {
  it("estado devuelve información del sistema", async () => {
    const respuesta = await llamarHerramienta([estado], "estado", {});
    const resultado = resultadoDe(respuesta);
    expect(resultado.contenido.length).toBeGreaterThan(0);
    expect(resultado.contenido[0].texto).toContain("StarSeed OS");
  });

  it("tareas_listar respeta el límite", async () => {
    const respuesta = await llamarHerramienta([tareas_listar], "tareas_listar", { limite: 3 });
    const resultado = resultadoDe(respuesta);
    expect(resultado.contenido).toHaveLength(3);
    expect(resultado.contenido[0].texto).toContain("Tarea 1");
  });

  it("tareas_crear crea tarea con título y descripción", async () => {
    const respuesta = await llamarHerramienta([tareas_crear], "tareas_crear", {
      titulo: "Tarea de prueba",
      descripcion: "Descripción de prueba",
      prioridad: 2,
    });
    const resultado = resultadoDe(respuesta);
    expect(resultado.contenido.some((b) => b.texto.includes("Tarea de prueba"))).toBe(true);
    expect(resultado.contenido.some((b) => b.texto.includes("Descripción de prueba"))).toBe(true);
  });

  it("agentes_listar filtra por filtro", async () => {
    const respuesta = await llamarHerramienta([agentes_listar], "agentes_listar", { filtro: "test" });
    const resultado = resultadoDe(respuesta);
    expect(resultado.contenido[0].texto).toContain("test");
  });

  it("biblioteca_buscar devuelve resultados con query", async () => {
    const respuesta = await llamarHerramienta([biblioteca_buscar], "biblioteca_buscar", {
      query: "react",
      tipo: "app",
    });
    const resultado = resultadoDe(respuesta);
    expect(resultado.contenido[0].texto).toContain("react");
  });

  it("opciones_sugerir propone opciones locales", async () => {
    const respuesta = await llamarHerramienta([opciones_sugerir], "opciones_sugerir", {
      area: "persona",
      papel: "escritor",
    });
    const resultado = resultadoDe(respuesta);
    expect(resultado.contenido.some((b) => b.texto.includes("persona"))).toBe(true);
  });

  it("chat envía mensaje con destino y contenido", async () => {
    const respuesta = await llamarHerramienta([chat], "chat", {
      destino: "persona",
      contenido: "Hola mundo",
      formato: "texto",
    });
    const resultado = resultadoDe(respuesta);
    expect(resultado.contenido.some((b) => b.texto.includes("persona"))).toBe(true);
    expect(resultado.contenido.some((b) => b.texto.includes("Hola mundo"))).toBe(true);
  });
});
