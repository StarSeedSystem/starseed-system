/**
 * Pruebas del descubrimiento progresivo MCP (patrón Strata, BM25 propio).
 * Rescate RTAGT1025B de la rama archivada nube/a1-20261101-124710-AGT1025B.
 * Solo funciones puras: sin red, sin disco, sin procesos.
 */
import { describe, it, expect } from "vitest";
import {
  crearIndiceBm25,
  envolverProgresivo,
  METAHERRAMIENTAS,
  PERFILES_MEDIO,
  tokenizar,
  UMBRAL_PROGRESIVO,
  type DocumentoBm25,
  type OpcionesProgresivo,
} from "../descubrimiento-progresivo";
import type { HerramientaMcp } from "../protocolo";

const DESCRIPCION_TAREAS =
  "Lista las tareas del sistema y devuelve columnas y registro completo de cada tarea guardada";

function herramientaFalsa(nombre: string, descripcion: string): HerramientaMcp {
  return {
    nombre,
    descripcion,
    esquema: {},
    ejecutar: async () => ({ contenido: [{ tipo: "texto", texto: JSON.stringify({ nombre }) }] }),
  };
}

function construirMuchas(): HerramientaMcp[] {
  const base = [
    herramientaFalsa("tareas_listar", DESCRIPCION_TAREAS),
    herramientaFalsa("estado", "Obtiene el estado actual del sistema"),
  ];
  const resto: HerramientaMcp[] = [];
  for (let i = 0; i < 18; i++) {
    resto.push(herramientaFalsa(`tool_${i}`, `Herramienta numero ${i} con palabras clave`));
  }
  return [...base, ...resto];
}

const MUCHAS: HerramientaMcp[] = construirMuchas();

function metasDe(
  herramientas: HerramientaMcp[],
  opciones: OpcionesProgresivo = {},
): Map<string, HerramientaMcp> {
  return new Map(envolverProgresivo(herramientas, opciones).map((h) => [h.nombre, h]));
}

describe("tokenizar", () => {
  it("separa camelCase antes de pasar a minúsculas", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("misHerramientas")).toEqual(["mis", "herramientas"]);
  });

  it("quita tildes (NFD)", () => {
    expect(tokenizar("cañón")).toEqual(["canon"]);
    expect(tokenizar("español")).toEqual(["espanol"]);
    expect(tokenizar("año")).toEqual(["ano"]);
  });

  it("parte por todo lo que no sea [a-z0-9] (incluye guion bajo y punto)", () => {
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas-listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas.listar")).toEqual(["tareas", "listar"]);
  });

  it("descarta tokens de 1 carácter y las palabras vacías", () => {
    expect(tokenizar("a b c")).toEqual([]);
    expect(tokenizar("de la tareas el listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("the tasks for")).toEqual(["tasks"]);
  });
});

describe("crearIndiceBm25", () => {
  it("consulta vacía devuelve []", () => {
    const indice = crearIndiceBm25([]);
    expect(indice.buscar("", 10)).toEqual([]);
  });

  it("'tareas listar' devuelve resultados con puntuación", () => {
    const docs: DocumentoBm25[] = [
      { id: "tareas_listar", texto: "Lista las tareas del sistema" },
      { id: "estado", texto: "Obtiene el estado actual" },
      { id: "otro", texto: "algo diferente" },
    ];
    const indice = crearIndiceBm25(docs);
    const resultados = indice.buscar("lista tareas", 5);
    expect(resultados.length).toBeGreaterThanOrEqual(1);
    expect(resultados[0].puntuacion).toBeGreaterThan(0);
    expect(resultados[0].id).toBe("tareas_listar");
  });

  it("empate estable por id (ascendente)", () => {
    const docsEmpate: DocumentoBm25[] = [
      { id: "b", texto: "alpha beta" },
      { id: "a", texto: "alpha beta" },
    ];
    const indice = crearIndiceBm25(docsEmpate);
    const resultados = indice.buscar("alpha", 10);
    expect(resultados[0].id).toBe("a");
    expect(resultados[1].id).toBe("b");
  });

  it("usa 20 herramientas falsas", () => {
    const docs: DocumentoBm25[] = [];
    for (let i = 0; i < 20; i++) {
      docs.push({ id: `tool_${i}`, texto: `Herramienta numero ${i} con palabras clave` });
    }
    const indice = crearIndiceBm25(docs);
    const resultados = indice.buscar("herramienta clave", 10);
    expect(resultados.length).toBeGreaterThan(0);
  });
});

describe("constantes", () => {
  it("umbral progresivo tiene valor 12", () => {
    expect(UMBRAL_PROGRESIVO).toBe(12);
  });

  it("perfil pequeño: maxResultados 3, maxDescripcion 80, sin esquema", () => {
    expect(PERFILES_MEDIO["modelo-pequeno"]).toEqual({
      maxResultados: 3,
      maxDescripcion: 80,
      conEsquema: false,
    });
  });

  it("perfil mediano: maxResultados 5, maxDescripcion 160, sin esquema", () => {
    expect(PERFILES_MEDIO["modelo-mediano"]).toEqual({
      maxResultados: 5,
      maxDescripcion: 160,
      conEsquema: false,
    });
  });

  it("perfil grande: maxResultados 8, maxDescripcion 400, con esquema", () => {
    expect(PERFILES_MEDIO["modelo-grande"]).toEqual({
      maxResultados: 8,
      maxDescripcion: 400,
      conEsquema: true,
    });
  });

  it("contiene exactamente las tres metaherramientas", () => {
    expect([...METAHERRAMIENTAS]).toEqual([
      "descubrir_herramientas",
      "detalle_herramienta",
      "ejecutar_herramienta",
    ]);
  });
});

describe("envolverProgresivo · forma", () => {
  it("≤ umbral devuelve las mismas herramientas sin metaherramientas", () => {
    const resultado = envolverProgresivo([
      herramientaFalsa("a", "A"),
      herramientaFalsa("b", "B"),
      herramientaFalsa("c", "C"),
    ]);
    expect(resultado).toHaveLength(3);
    const nombres = resultado.map((h) => h.nombre);
    expect(nombres).toEqual(["a", "b", "c"]);
    expect(nombres).not.toContain("descubrir_herramientas");
  });

  it("> umbral devuelve exactamente las tres metaherramientas", () => {
    const resultado = envolverProgresivo(MUCHAS);
    expect(resultado).toHaveLength(3);
    expect(resultado.map((h) => h.nombre)).toEqual([...METAHERRAMIENTAS]);
  });

  it("permite personalizar el umbral", () => {
    const pocas = [herramientaFalsa("a", "A"), herramientaFalsa("b", "B")];
    const resultado = envolverProgresivo(pocas, { umbral: 5 });
    expect(resultado).toHaveLength(2);
  });

  it("permitida filtra herramientas; si lo filtrado > umbral, metaherramientas", () => {
    const resultado = envolverProgresivo(MUCHAS, {
      permitida: (h: HerramientaMcp) => h.nombre !== "tareas_listar" && h.nombre !== "estado",
    });
    expect(resultado).toHaveLength(3);
    expect(resultado.map((h) => h.nombre)).toEqual([...METAHERRAMIENTAS]);
  });
});

async function extraer(resultado: { contenido: Array<{ tipo: "texto"; texto: string }> }) {
  return JSON.parse(resultado.contenido[0].texto) as Record<string, unknown>;
}

describe("envolverProgresivo · descubrir_herramientas", () => {
  it("devuelve JSON con resultados y total", async () => {
    const mapa = metasDe(MUCHAS);
    const r = await mapa.get("descubrir_herramientas")!.ejecutar({ consulta: "tarea" });
    const parsed = await extraer(r);
    expect(parsed).toHaveProperty("resultados");
    expect(parsed).toHaveProperty("total");
    expect((parsed.resultados as unknown[]).length).toBeGreaterThan(0);
  });

  it("el perfil pequeño recorta descripciones a 80 caracteres", async () => {
    const mapa = metasDe(MUCHAS, { medio: "modelo-pequeno" });
    const r = await mapa.get("descubrir_herramientas")!.ejecutar({ consulta: "tareas" });
    const parsed = await extraer(r);
    const primeros = parsed.resultados as Array<{ nombre: string; descripcion: string }>;
    expect(primeros.length).toBeGreaterThan(0);
    expect(primeros[0]).toHaveProperty("nombre");
    expect(typeof primeros[0].descripcion).toBe("string");
    expect(primeros[0].descripcion!.length).toBeLessThanOrEqual(80);
  });

  it("el perfil grande incluye esquema", async () => {
    const mapa = metasDe(MUCHAS, { medio: "modelo-grande" });
    const r = await mapa.get("descubrir_herramientas")!.ejecutar({ consulta: "tareas" });
    const parsed = await extraer(r);
    expect((parsed.resultados as Array<Record<string, unknown>>)[0]).toHaveProperty("esquema");
  });

  it("se limita por maxResultados del perfil mediano (5)", async () => {
    const mapa = metasDe(MUCHAS);
    const r = await mapa.get("descubrir_herramientas")!.ejecutar({ consulta: "herramienta" });
    const parsed = await extraer(r);
    expect((parsed.resultados as unknown[]).length).toBe(5);
  });

  it("cuando no hay resultados, incluye sugerencia", async () => {
    const mapa = metasDe(MUCHAS);
    const r = await mapa.get("descubrir_herramientas")!.ejecutar({ consulta: "cipollino" });
    const parsed = await extraer(r);
    expect((parsed.resultados as unknown[]).length).toBe(0);
    expect(parsed).toHaveProperty("sugerencia");
  });
});

describe("envolverProgresivo · detalle_herramienta", () => {
  it("devuelve JSON completo de la herramienta", async () => {
    const mapa = metasDe(MUCHAS);
    const r = await mapa.get("detalle_herramienta")!.ejecutar({ nombre: "tareas_listar" });
    const parsed = await extraer(r);
    expect(parsed).toHaveProperty("nombre", "tareas_listar");
    expect(parsed).toHaveProperty("descripcion");
    expect(parsed).toHaveProperty("esquema");
  });

  it("devuelve error si la herramienta no existe", async () => {
    const mapa = metasDe(MUCHAS);
    const r = await mapa.get("detalle_herramienta")!.ejecutar({ nombre: "herramienta_inexistente" });
    expect(r.esError).toBe(true);
    expect(r.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });
});

describe("envolverProgresivo · ejecutar_herramienta", () => {
  it("ejecuta correctamente una herramienta visible", async () => {
    const mapa = metasDe(MUCHAS);
    const r = await mapa.get("ejecutar_herramienta")!.ejecutar({ nombre: "tareas_listar" });
    const parsed = await extraer(r);
    expect(parsed).toHaveProperty("nombre", "tareas_listar");
  });

  it("no puede llamar a una metaherramienta", async () => {
    const mapa = metasDe(MUCHAS);
    const r = await mapa
      .get("ejecutar_herramienta")!
      .ejecutar({ nombre: "descubrir_herramientas", argumentos: {} });
    expect(r.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });

  it("no puede llamar a una herramienta desconocida", async () => {
    const mapa = metasDe(MUCHAS);
    const r = await mapa
      .get("ejecutar_herramienta")!
      .ejecutar({ nombre: "herramienta_inexistente", argumentos: {} });
    expect(r.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });

  it("el ctx llega a la herramienta cuando hay > umbral", async () => {
    const conCtx: HerramientaMcp = {
      nombre: "con_ctx",
      descripcion: "Con contexto",
      esquema: {},
      ejecutar: async (_args: Record<string, unknown>, ctx?: unknown) => ({
        contenido: [
          { tipo: "texto", texto: (ctx as { testCtx?: string } | undefined)?.testCtx ?? "sin ctx" },
        ],
      }),
    };
    const mapa = metasDe([...MUCHAS.slice(1), conCtx], { umbral: 12 });
    const r = await mapa
      .get("ejecutar_herramienta")!
      .ejecutar({ nombre: "con_ctx", argumentos: {} }, { testCtx: "valor" });
    expect(r.contenido[0].texto).toBe("valor");
  });

  it("una herramienta que lanza devuelve error sin pila", async () => {
    const laQueFalla: HerramientaMcp = {
      nombre: "la_que_falla",
      descripcion: "Siempre se rompe",
      esquema: {},
      ejecutar: async () => {
        throw new Error("fallo interno");
      },
    };
    const mapa = metasDe([...MUCHAS, laQueFalla], { umbral: 12 });
    const r = await mapa.get("ejecutar_herramienta")!.ejecutar({ nombre: "la_que_falla" });
    expect(r.esError).toBe(true);
    expect(r.contenido[0].texto).toBe("La herramienta falló.");
  });
});
