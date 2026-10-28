/**
 * Pruebas de las herramientas MCP de Genesis (Ola 1019G · GCA1019R).
 * Cubre: esquemas válidos (las nueve del §7, permisos de las doce, required ⊆ properties),
 * baremos del validador y manejadores llamados SOLO con lo validado. Sin red ni disco.
 */
import { describe, it, expect } from "vitest";
import { atenderMcp, type HerramientaMcp, type RespuestaExitoJsonRpc } from "../protocolo";
import { construirHerramientasGenesis, HERRAMIENTAS_GENESIS, validarContraEsquema, type ManejadoresGenesis, type NombreHerramientaGenesis } from "../herramientas";
import { CAPACIDADES_AMBITO } from "@/lib/mando/ambito";

const NOMBRES: NombreHerramientaGenesis[] = [
  "estado", "tareas_listar", "tareas_crear", "agentes_listar", "medidores",
  "proponer", "biblioteca_buscar", "opciones_sugerir", "chat",
];

type Llamada = { nombre: string; args: Record<string, unknown>; ctx: unknown };

/** Arma herramientas con manejadores de espía y recoge lo que les llega. */
function armar(conectadas: NombreHerramientaGenesis[]) {
  const llamadas: Llamada[] = [];
  const espia = (nombre: NombreHerramientaGenesis) => async (args: Record<string, unknown>, ctx: unknown) => {
    llamadas.push({ nombre, args, ctx });
    return { manejado: nombre };
  };
  const manejadores: ManejadoresGenesis = {};
  for (const n of conectadas) manejadores[n] = espia(n);
  return { herramientas: construirHerramientasGenesis(manejadores), llamadas };
}

async function llamar(herramientas: HerramientaMcp[], nombre: string, args: Record<string, unknown>, ctx?: unknown) {
  const respuesta = await atenderMcp(
    { jsonrpc: "2.0", id: "t", method: "tools/call", params: { name: nombre, arguments: args } },
    { herramientas, contexto: ctx },
  );
  return (respuesta as RespuestaExitoJsonRpc).result as { contenido: Array<{ texto: string }>; esError?: boolean };
}

describe("esquemas de las herramientas", () => {
  it("nueve del contrato, cada una con un permiso de las doce", () => {
    expect(HERRAMIENTAS_GENESIS.map((d) => d.nombre)).toEqual(NOMBRES);
    for (const def of HERRAMIENTAS_GENESIS) {
      expect(def.descripcion.length).toBeGreaterThan(8);
      expect((CAPACIDADES_AMBITO as readonly string[]).includes(def.permiso)).toBe(true);
      expect(def.esquema.type).toBe("object");
      const props = (def.esquema.properties ?? {}) as Record<string, unknown>;
      for (const req of (def.esquema.required as readonly string[] | undefined) ?? []) {
        expect(Object.prototype.hasOwnProperty.call(props, req), `required «${req}» debe estar en properties de ${def.nombre}`).toBe(true);
      }
    }
  });

  it("el validador aplica tipos, baremos y no admite campos de más", () => {
    const esquema = {
      type: "object",
      properties: { n: { type: "integer", minimum: 1, maximum: 5 }, s: { type: "string", maxLength: 3 }, l: { type: "array", items: { type: "string" } } },
      required: ["n"],
    };
    expect(validarContraEsquema({}, esquema).ok).toBe(false);
    expect(validarContraEsquema({ n: 0 }, esquema).ok).toBe(false);
    expect(validarContraEsquema({ n: 2.5 }, esquema).ok).toBe(false);
    expect(validarContraEsquema({ n: 3, s: "abcd" }, esquema).ok).toBe(false);
    expect(validarContraEsquema({ n: 3, l: [2] }, esquema).ok).toBe(false);
    expect(validarContraEsquema({ n: 3, otra: true }, esquema).ok).toBe(false);
    expect(validarContraEsquema("no", esquema).ok).toBe(false);
    const bien = validarContraEsquema({ n: 3, s: "ab", l: ["a"] }, esquema);
    expect(bien.ok).toBe(true);
  });
});

describe("manejadores llamados con lo validado", () => {
  it("tools/list anuncia las nueve con su inputSchema", async () => {
    const { herramientas } = armar(NOMBRES);
    const respuesta = await atenderMcp({ jsonrpc: "2.0", id: 7, method: "tools/list" }, { herramientas });
    const { tools } = (respuesta as RespuestaExitoJsonRpc).result as { tools: Array<{ name: string; inputSchema: { type: string } }> };
    expect(tools.map((t) => t.name)).toEqual(NOMBRES);
    expect(tools.every((t) => t.inputSchema.type === "object")).toBe(true);
  });

  it("args válidos llegan tal cual al manejador y su salida vuelve como texto", async () => {
    const { herramientas, llamadas } = armar(["tareas_listar", "chat", "estado"]);
    const salida = await llamar(herramientas, "tareas_listar", { limite: 5 });
    expect(salida.esError).toBeUndefined();
    expect(salida.contenido[0].texto).toContain("tareas_listar");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].args).toEqual({ limite: 5 });
    expect(typeof llamadas[0].args.limite).toBe("number");
    expect(llamadas[0].ctx).toBeUndefined();
  });

  it("args inválidos: esquema detiene y nada llama al manejador", async () => {
    const { herramientas, llamadas } = armar(["tareas_listar", "chat", "estado"]);
    expect((await llamar(herramientas, "tareas_listar", { limite: 500 })).esError).toBe(true);
    expect((await llamar(herramientas, "estado", { extra: true })).esError).toBe(true);
    expect((await llamar(herramientas, "chat", {})).esError).toBe(true);
    expect(llamadas).toHaveLength(0);
  });

  it("proponer llega como lote validado (validas y rechazadas)", async () => {
    const { herramientas, llamadas } = armar(["proponer"]);
    const op = { tipo: "perfil.editar", motivo: "Mi nombre real", cambios: { nombre: "Ana María" } };
    const salida = await llamar(herramientas, "proponer", { operaciones: [op] });
    expect(salida.esError).toBeUndefined();
    const lote = llamadas[0].args as { validas: Array<{ op: { tipo: string; cambios: { nombre: string } } }>; rechazadas: unknown[] };
    expect(lote.validas).toHaveLength(1);
    expect(lote.rechazadas).toHaveLength(0);
    expect(lote.validas[0].op.tipo).toBe("perfil.editar");
    expect(lote.validas[0].op.cambios.nombre).toBe("Ana María");
  });

  it("proponer con operaciones que el registro no admite salen como rechazadas", async () => {
    const { herramientas, llamadas } = armar(["proponer"]);
    const salida = await llamar(herramientas, "proponer", { operaciones: [{ tipo: "dock.quitar", id: "settings" }] });
    expect(salida.esError).toBeUndefined();
    const lote = llamadas[0].args as { validas: unknown[]; rechazadas: Array<{ indice: number; problemas: string[] }> };
    expect(lote.validas).toHaveLength(0);
    expect(lote.rechazadas).toHaveLength(1);
    expect(lote.rechazadas[0].indice).toBe(0);
    expect(lote.rechazadas[0].problemas.length).toBeGreaterThan(0);
  });

  it("sin manejador conectado: esError honesto, sin inventar datos", async () => {
    const { herramientas, llamadas } = armar([]);
    const salida = await llamar(herramientas, "medidores", {});
    expect(salida.esError).toBe(true);
    expect(salida.contenido[0].texto).toContain("medidores");
    expect(salida.contenido[0].texto).toContain("manejador");
    expect(llamadas).toHaveLength(0);
  });
});
