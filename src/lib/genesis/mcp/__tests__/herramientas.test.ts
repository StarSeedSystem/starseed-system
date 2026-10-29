import { describe, expect, it } from "vitest";
import { CAPACIDADES_AMBITO } from "@/lib/mando/ambito";
import { atenderMcp, type RespuestaJsonRpc } from "../protocolo";
import {
  DEFINICIONES,
  crearHerramientasGenesis,
  validarArgumentos,
  type ManejadoresGenesis,
  type NombreHerramienta,
} from "../herramientas";
const NOMBRES: NombreHerramienta[] = [
  "estado", "tareas_listar", "tareas_crear", "agentes_listar", "medidores",
  "proponer", "biblioteca_buscar", "opciones_sugerir", "chat",
];

const EJEMPLOS: Record<NombreHerramienta, Record<string, unknown>> = {
  estado: {},
  tareas_listar: { limite: 5 },
  tareas_crear: { titulo: "Arreglar el puente", prioridad: "alta" },
  agentes_listar: {},
  medidores: { clave: "listas" },
  proponer: { operacion: { tipo: "perfil.editar", motivo: "Mejorar", cambios: { nombre: "Ana" } } },
  biblioteca_buscar: { texto: "voz" },
  opciones_sugerir: { papel: "chat" },
  chat: { mensaje: "¿Cómo va la ola?" },
};
type SalidaMcp = { contenido: Array<{ tipo: string; texto: string }>; esError?: boolean };

async function llamar(
  nombre: string,
  argumentos: Record<string, unknown>,
  manejadores: ManejadoresGenesis = {},
): Promise<SalidaMcp> {
  const respuesta: RespuestaJsonRpc = await atenderMcp(
    { jsonrpc: "2.0", id: "1", method: "tools/call", params: { name: nombre, arguments: argumentos } },
    { herramientas: crearHerramientasGenesis({ manejadores }) },
  );
  if (!("result" in respuesta)) throw new Error("Se esperaba un resultado");
  return respuesta.result as SalidaMcp;
}

describe("herramientas MCP de Genesis", () => {
  it("declara exactamente las nueve herramientas del contrato", () => {
    expect(DEFINICIONES.map((d) => d.nombre).sort()).toEqual([...NOMBRES].sort());
  });

  it("cada definición tiene descripción, permiso conocido y un JSON Schema válido", () => {
    for (const d of DEFINICIONES) {
      expect(d.descripcion.trim().length).toBeGreaterThan(10);
      expect(CAPACIDADES_AMBITO).toContain(d.permiso);
      expect(d.esquema.type).toBe("object");
      expect(d.esquema.additionalProperties).toBe(false);
      expect(Array.isArray(d.esquema.required)).toBe(true);
      for (const requerido of d.esquema.required) {
        expect(d.esquema.properties).toHaveProperty(requerido);
      }
      for (const propiedad of Object.values(d.esquema.properties)) {
        expect(["object", "string", "integer", "number", "boolean", "array"]).toContain(propiedad.type);
      }
    }
  });

  it("valida argumentos: aplica el valor por defecto y descarta lo no declarado", () => {
    const esquema = DEFINICIONES.find((d) => d.nombre === "tareas_listar")!.esquema;
    expect(validarArgumentos(esquema, { intruso: "x" })).toEqual({ limite: 20 });
    expect(validarArgumentos(esquema, { limite: 7, intruso: "x" })).toEqual({ limite: 7 });
  });

  it("rechaza lo obligatorio ausente, los tipos falsos y los límites pasados", () => {
    const crear = DEFINICIONES.find((d) => d.nombre === "tareas_crear")!.esquema;
    const chat = DEFINICIONES.find((d) => d.nombre === "chat")!.esquema;
    expect(() => validarArgumentos(crear, {})).toThrow(/Falta «titulo»/);
    expect(() => validarArgumentos(crear, { titulo: "x", prioridad: "urgente" })).toThrow(/no es un valor permitido/);
    expect(() => validarArgumentos(crear, { titulo: "x", prioridad: "normal", extra: true })).not.toThrow();
    expect(() => validarArgumentos(chat, { mensaje: "x".repeat(8001) })).toThrow(/supera 8000/);
    expect(() => validarArgumentos(chat, { mensaje: 42 })).toThrow(/debe ser texto/);
  });

  it("llama al manejador con lo ya validado y le pasa el contexto", async () => {
    const recibidos: Record<string, unknown>[] = [];
    const manejadores: ManejadoresGenesis = {
      tareas_listar: async (args: Record<string, unknown>) => {
        recibidos.push(args);
        return { tareas: [] };
      },
    };
    const salida = await llamar("tareas_listar", { limite: 3, intruso: "no" }, manejadores);
    expect(recibidos).toEqual([{ limite: 3 }]);
    expect(salida.esError).toBeUndefined();
    expect(salida.contenido[0].texto).toContain('"tareas"');
  });

  it("cada herramienta con manejador inyectado recibe sus argumentos válidos", async () => {
    for (const definicion of DEFINICIONES) {
      const vistos: Record<string, unknown>[] = [];
      const manejadores: ManejadoresGenesis = {
        [definicion.nombre]: async (args: Record<string, unknown>) => {
          vistos.push(args);
          return "ok";
        },
      };
      const salida = await llamar(definicion.nombre, EJEMPLOS[definicion.nombre], manejadores);
      expect(salida.esError).toBeUndefined();
      expect(vistos).toEqual([validarArgumentos(definicion.esquema, EJEMPLOS[definicion.nombre])]);
    }
  });

  it("sin manejador responde con error explícito y no inventa datos", async () => {
    const salida = await llamar("estado", {});
    expect(salida.esError).toBe(true);
    expect(salida.contenido[0].texto).toContain("no tiene manejador inyectado");
  });

  it("respeta los permisos del ámbito al construir el catálogo", () => {
    const soloLectura = crearHerramientasGenesis({ permitidas: new Set(["ver-resumen"]) });
    expect(soloLectura.map((h) => h.nombre)).toContain("estado");
    expect(soloLectura.map((h) => h.nombre)).not.toContain("chat");
    expect(soloLectura.map((h) => h.nombre)).not.toContain("tareas_crear");
  });
});
