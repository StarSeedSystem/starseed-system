import { describe, it, expect } from "vitest";
import { CAPACIDADES_AMBITO } from "@/lib/mando/ambito";
import {
  crearHerramientasMcp,
  type DependenciasGenesis,
  type EntradaProponerValidada,
} from "../herramientas";

const AMBITO = { tipo: "persona" as const };
const NOMBRES = ["estado", "tareas_listar", "tareas_crear", "agentes_listar", "medidores", "proponer", "biblioteca_buscar", "opciones_sugerir", "chat"];

function armar(registro: Record<string, unknown> = {}): DependenciasGenesis {
  const guardar = (clave: string) => (a: unknown) => { registro[clave] = a; return { ok: true }; };
  return {
    contexto: { ambito: AMBITO },
    estado: () => { registro.estado = true; return { estado: "verde" }; },
    tareasListar: guardar("tareas_listar"),
    tareasCrear: guardar("tareas_crear"),
    agentesListar: guardar("agentes_listar"),
    medidores: () => { registro.medidores = true; return { puertas: "verde" }; },
    proponer: guardar("proponer"),
    bibliotecaBuscar: guardar("biblioteca_buscar"),
    opcionesSugerir: guardar("opciones_sugerir"),
    chat: guardar("chat"),
  };
}

function abrir(nombre: string, registro: Record<string, unknown> = {}) {
  const h = crearHerramientasMcp(armar(registro)).find((x) => x.nombre === nombre);
  if (!h) throw new Error(`No existe la herramienta ${nombre}`);
  return h;
}

const textoDe = (r: { contenido: { texto: string }[] }) => r.contenido[0]!.texto;

describe("herramientas MCP de Genesis", () => {
  it("declara las nueve herramientas con JSON Schema válido y permiso de ámbito", () => {
    const herramientas = crearHerramientasMcp(armar());
    expect(herramientas.map((h) => h.nombre).sort()).toEqual([...NOMBRES].sort());
    for (const h of herramientas) {
      expect(h.descripcion.length).toBeGreaterThan(15);
      expect(h.esquema.type).toBe("object");
      expect(typeof h.esquema.properties).toBe("object");
      expect(h.esquema.additionalProperties).toBe(false);
      expect(CAPACIDADES_AMBITO).toContain(h.permiso);
      for (const req of h.esquema.required as string[]) expect(h.esquema.properties).toHaveProperty(req);
    }
  });

  it("valida y normaliza los argumentos antes de llamar al manejador", async () => {
    const registro: Record<string, unknown> = {};
    const r = await abrir("tareas_listar", registro).ejecutar({ limite: "5", estado: "en-curso", cola: "  ola-1  ", sobra: 1 });
    expect(r.esError).toBeUndefined();
    expect(registro.tareas_listar).toEqual({ limite: 5, estado: "en-curso", cola: "ola-1" });
    expect(JSON.parse(textoDe(r))).toEqual({ ok: true });
  });

  it("aplica los valores por defecto del esquema", async () => {
    const registro: Record<string, unknown> = {};
    await abrir("agentes_listar", registro).ejecutar({});
    expect(registro.agentes_listar).toEqual({ limite: 50, soloActivos: true });
  });

  it("rechaza argumentos no válidos sin llamar al manejador", async () => {
    const registro: Record<string, unknown> = {};
    const r = await abrir("tareas_crear", registro).ejecutar({});
    expect(r.esError).toBe(true);
    expect(textoDe(r)).toContain("Falta «titulo»");
    expect(registro.tareas_crear).toBeUndefined();
  });

  it("proponer entrega al manejador solo las operaciones validadas", async () => {
    const registro: Record<string, unknown> = {};
    const r = await abrir("proponer", registro).ejecutar({
      operaciones: [
        { tipo: "perfil.editar", motivo: "Actualizar mi nombre", cambios: { nombre: "Ana", sobra: "x" }, extra: 1 },
        { tipo: "inventada" },
      ],
    });
    expect(r.esError).toBeUndefined();
    const entrada = registro.proponer as EntradaProponerValidada;
    expect(entrada.operaciones).toHaveLength(1);
    expect(entrada.operaciones[0]).toMatchObject({ tipo: "perfil.editar", cambios: { nombre: "Ana" } });
    expect((entrada.operaciones[0] as unknown as { cambios: Record<string, unknown> }).cambios).not.toHaveProperty("sobra");
    expect(entrada.rechazadas).toHaveLength(1);
    expect(entrada.rechazadas[0]!.indice).toBe(1);
  });

  it("redacta los valores de claves y conserva los nombres de variables", async () => {
    const registro: Record<string, unknown> = {};
    const deps = armar(registro);
    const h = crearHerramientasMcp({ ...deps, estado: () => ({ apiKey: "secreto", token: "abc", variables: ["OPENAI_API_KEY"] }) })
      .find((x) => x.nombre === "estado")!;
    const salida = JSON.parse(textoDe(await h.ejecutar({})));
    expect(salida).toEqual({ apiKey: "[redactado]", token: "[redactado]", variables: ["OPENAI_API_KEY"] });
  });
});
