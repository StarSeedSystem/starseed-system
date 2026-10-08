import { describe, it, expect, beforeEach } from "vitest";
import {
  construirPromptNeedle,
  construirPromptClasificacion,
  construirPromptExtraccion,
  normalizarRespuestaNeedle,
  interpretarClasificacion,
  interpretarExtraccion,
  entradaNeedleWeb,
  fuentesPesos,
  sha256Hex,
  cargarNeedleWasm,
  reiniciarNeedleWasm,
  decidirEnDispositivo,
  llamarHerramientas,
  clasificar,
  extraer,
  embeber,
  DEFAULT_URL_ENGINE,
  DEFAULT_URL_PESOS,
  type EntornoNeedleWasm,
  type KitMotor,
} from "../needle-wasm";
import { AlmacenCapas, almacenamientoEnMemoria } from "../capas/almacen";
import type { HerramientaNeedle } from "../needle3-client";

const PESOS_FALSOS = new TextEncoder().encode("pesos-needle3-falsos").buffer as ArrayBuffer;
const WASM_FALSO = new TextEncoder().encode("modulo-wasm-falso").buffer as ArrayBuffer;

const herramientasEjemplo: HerramientaNeedle[] = [
  {
    name: "apariencia",
    description: "Cambiar apariencia de UI",
    parameters: { type: "object", properties: { tema: { type: "string" } } },
  },
];

async function catalogoConSha(): Promise<unknown> {
  const sha = await sha256Hex(PESOS_FALSOS);
  const shaWasm = await sha256Hex(WASM_FALSO);
  return {
    esquema: 1,
    capas: [
      {
        id: "needle3-reflejo",
        familia: "Cactus-Compute/needle3",
        capa: "reflejo",
        modelo: "Cactus Needle 3",
        version: "3.1.2",
        formato: "cact",
        runtime: "needle-wasm",
        parametros: "121 M",
        disco_mb: 29,
        ram_min_mb: 256,
        sha256: sha,
        fuente_oficial: "https://huggingface.co/Cactus-Compute/needle3",
        espejos: [],
        estado: "recomendado",
        medios: ["web", "pwa"],
        archivos: { "needle.wasm": shaWasm },
      },
    ],
  };
}

function entornoFalso(catalogo: unknown, sobreescribe?: Partial<EntornoNeedleWasm>): EntornoNeedleWasm {
  return {
    catalogo,
    buscar: async (url: string) => (url === DEFAULT_URL_PESOS ? PESOS_FALSOS : WASM_FALSO),
    fabrica: async (kit: KitMotor) => ({
      generar: async () =>
        JSON.stringify({
          function_calls: [{ name: "apariencia", args: { tema: "oscuro" } }],
          confidence: 0.9,
          reasoning: `profundidad ${kit.profundidad}`,
        }),
      embeber: async () => [0.1, 0.2, 0.3],
    }),
    ...sobreescribe,
  };
}

describe("needle-wasm", () => {
  beforeEach(() => reiniciarNeedleWasm());

  it("construirPromptNeedle genera el prompt con sistema y herramientas", () => {
    const prompt = construirPromptNeedle("poner modo oscuro", herramientasEjemplo, "Sistema OS");
    expect(prompt).toContain("Sistema OS");
    expect(prompt).toContain("Herramientas:");
    expect(prompt).toContain("apariencia");
    expect(prompt).toContain("Consulta: poner modo oscuro");
  });

  it("normalizarRespuestaNeedle maneja respuestas vacías o inválidas", () => {
    expect(normalizarRespuestaNeedle("").error).toContain("Respuesta vacía");
    expect(normalizarRespuestaNeedle("no json").error).toContain("Error de parseo");
  });

  it("normalizarRespuestaNeedle procesa respuestas JSON estructuradas", () => {
    const res = normalizarRespuestaNeedle(
      JSON.stringify({
        function_calls: [{ name: "apariencia", args: { tema: "oscuro" } }],
        confidence: 0.92,
        reasoning: "El usuario solicitó cambiar a modo oscuro",
      }),
      42,
    );
    expect(res.ok).toBe(true);
    expect(res.motor).toBe("needle3-wasm");
    expect(res.confianza).toBe(0.92);
    expect(res.ms).toBe(42);
    expect(res.llamadas?.[0].nombre).toBe("apariencia");
  });

  it("entradaNeedleWeb localiza la entrada del reflejo para web", async () => {
    const entrada = entradaNeedleWeb(await catalogoConSha());
    expect(entrada?.id).toBe("needle3-reflejo");
    expect(fuentesPesos(entrada!)).toContain(DEFAULT_URL_PESOS);
  });

  it("carga un módulo WASM falso con el SHA del catálogo", async () => {
    const engine = await cargarNeedleWasm(entornoFalso(await catalogoConSha()));
    expect(engine.cargado).toBe(true);
    expect(engine.disponible).toBe(true);
    expect(engine.origenPesos).toBe(DEFAULT_URL_PESOS);
    expect(engine.origenEngine).toBe(DEFAULT_URL_ENGINE);
    expect(engine.ejecutar).toBeTypeOf("function");
  });

  it("elige la profundidad según el presupuesto (profundidadNeedle)", async () => {
    const engine = await cargarNeedleWasm(
      entornoFalso(await catalogoConSha(), { presupuestoMb: 20 }),
    );
    expect(engine.profundidad).toBe(12);
  });

  it("con un SHA que no casa devuelve no-disponible", async () => {
    const catalogo = await catalogoConSha();
    const engine = await cargarNeedleWasm(
      entornoFalso(catalogo, {
        buscar: async () => new TextEncoder().encode("otra-cosa").buffer as ArrayBuffer,
      }),
    );
    expect(engine.disponible).toBe(false);
    expect(engine.motivo).toBe("sha-no-coincide");
  });

  it("sin catálogo verificado devuelve no-disponible", async () => {
    const engine = await cargarNeedleWasm(entornoFalso({ esquema: 1, capas: [] }));
    expect(engine.disponible).toBe(false);
    expect(engine.motivo).toBe("no-en-catalogo");
  });

  it("sin WebAssembly devuelve no-disponible sin tocar la red", async () => {
    let buscado = 0;
    const engine = await cargarNeedleWasm(
      entornoFalso(await catalogoConSha(), {
        soportaWasm: () => false,
        buscar: async () => {
          buscado += 1;
          return null;
        },
      }),
    );
    expect(engine.disponible).toBe(false);
    expect(engine.motivo).toBe("sin-webassembly");
    expect(buscado).toBe(0);
  });

  it("prefiere el almacén de capas a la red", async () => {
    const almacen = almacenamientoEnMemoria();
    const sha = await sha256Hex(PESOS_FALSOS);
    const entrada = entradaNeedleWeb(await catalogoConSha())!;
    await new AlmacenCapas(almacen).guardarCapa({ ...entrada, sha256: sha }, [
      { indice: 0, sha256: sha, datos: PESOS_FALSOS },
    ]);
    let buscado = 0;
    const engine = await cargarNeedleWasm(
      entornoFalso(await catalogoConSha(), {
        almacen,
        buscar: async (url) => {
          buscado += 1;
          return url === DEFAULT_URL_ENGINE ? WASM_FALSO : null;
        },
      }),
    );
    expect(engine.disponible).toBe(true);
    expect(engine.origenPesos).toBe("almacen:needle3-reflejo");
    expect(buscado).toBe(1); // solo el engine; los pesos vienen del almacén
  });

  it("decidirEnDispositivo con motor falso devuelve llamadas normalizadas", async () => {
    const dec = await decidirEnDispositivo("activar modo oscuro", herramientasEjemplo, {
      entorno: entornoFalso(await catalogoConSha()),
    });
    expect(dec.ok).toBe(true);
    expect(dec.motor).toBe("needle3-wasm");
    expect(dec.llamadas?.[0].nombre).toBe("apariencia");
  });

  it("llamarHerramientas es el mismo contrato que decidirEnDispositivo", () => {
    expect(llamarHerramientas).toBe(decidirEnDispositivo);
  });

  it("sin motor disponible devuelve no-disponible y el cliente cae al servidor", async () => {
    const dec = await decidirEnDispositivo("hola", herramientasEjemplo, {
      entorno: entornoFalso({ esquema: 1, capas: [] }),
    });
    expect(dec.ok).toBe(false);
    expect(dec.error).toContain("no-disponible: no-en-catalogo");
  });

  it("clasificar interpreta la etiqueta devuelta por el motor", async () => {
    const entorno = entornoFalso(await catalogoConSha(), {
      fabrica: async () => ({
        generar: async () => JSON.stringify({ label: "positivo", confidence: 0.8 }),
        embeber: async () => [],
      }),
    });
    const res = await clasificar("me encanta", ["positivo", "negativo"], { entorno });
    expect(res.ok).toBe(true);
    expect(res.etiqueta).toBe("positivo");
    expect(res.confianza).toBe(0.8);
  });

  it("extraer devuelve solo los campos pedidos", async () => {
    const entorno = entornoFalso(await catalogoConSha(), {
      fabrica: async () => ({
        generar: async () => JSON.stringify({ ciudad: "Valencia", pais: "ES", ruido: true }),
        embeber: async () => [],
      }),
    });
    const res = await extraer("vivo en Valencia", ["ciudad", "pais"], { entorno });
    expect(res.ok).toBe(true);
    expect(res.datos).toEqual({ ciudad: "Valencia", pais: "ES" });
  });

  it("embeber devuelve el vector del motor", async () => {
    const res = await embeber("texto", { entorno: entornoFalso(await catalogoConSha()) });
    expect(res.ok).toBe(true);
    expect(res.vector).toEqual([0.1, 0.2, 0.3]);
  });

  it("interpretarClasificacion solo acepta etiquetas de la lista", () => {
    expect(interpretarClasificacion('{"label":"raro"}', ["a", "b"]).etiqueta).toBeNull();
    expect(interpretarClasificacion("no json", ["a"]).etiqueta).toBeNull();
  });

  it("interpretarExtraccion ante salida rota devuelve objeto vacío", () => {
    expect(interpretarExtraccion("no json", ["a"])).toEqual({});
    expect(construirPromptExtraccion("t", ["a"])).toContain("Campos:");
    expect(construirPromptClasificacion("t", ["a"])).toContain("Etiquetas:");
  });
});
