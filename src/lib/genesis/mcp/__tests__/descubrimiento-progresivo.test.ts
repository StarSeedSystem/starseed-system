import { describe, it, expect } from "vitest";
import type { HerramientaMcp } from "../protocolo";
import {
  crearIndiceBm25,
  envolverProgresivo,
  METAHERRAMIENTAS,
  PERFILES_MEDIO,
  tokenizar,
  UMBRAL_PROGRESIVO,
} from "../descubrimiento-progresivo";

function herramientaFalsa(nombre: string, descripcion: string): HerramientaMcp {
  return {
    nombre,
    descripcion,
    esquema: { type: "object", properties: {} },
    ejecutar: async () => ({
      contenido: [{ tipo: "texto", texto: `ok ${nombre}` }],
    }),
  };
}

const muchasHerramientas: HerramientaMcp[] = [
  herramientaFalsa(
    "tareas_listar",
    "Lista las tareas del sistema con su estado, responsable, etiquetas y comentarios completos",
  ),
  herramientaFalsa("estado", "Obtiene el estado del sistema"),
  ...Array.from({ length: 13 }, (_, i) =>
    herramientaFalsa(`tool_${i}`, `Herramienta numero ${i} con palabras clave`),
  ),
];

describe("tokenizar", () => {
  it("separa camelCase ANTES de pasar a minúsculas", () => {
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

describe("índice BM25", () => {
  it("consulta vacía devuelve []", () => {
    const indice = crearIndiceBm25([]);
    expect(indice.buscar("", 10)).toEqual([]);
  });

  it("'tareas listar' devuelve resultados con puntuación", () => {
    const docs = [
      { id: "tareas_listar", texto: "Lista las tareas del sistema" },
      { id: "estado", texto: "Obtiene el estado actual" },
      { id: "otro", texto: "algo diferente" },
    ];
    const indice = crearIndiceBm25(docs);
    const resultados = indice.buscar("lista tareas", 5);
    expect(resultados.length).toBeGreaterThanOrEqual(1);
    expect(resultados[0].puntuacion).toBeGreaterThan(0);
  });

  it("empate estable por id (ascendente)", () => {
    const docsEmpate = [
      { id: "b", texto: "alpha beta" },
      { id: "a", texto: "alpha beta" },
    ];
    const indice = crearIndiceBm25(docsEmpate);
    const resultados = indice.buscar("alpha", 10);
    expect(resultados[0].id).toBe("a");
    expect(resultados[1].id).toBe("b");
  });

  it("usa 20 herramientas falsas", () => {
    const indices: { id: string; texto: string }[] = [];
    for (let i = 0; i < 20; i++) {
      indices.push({ id: `tool_${i}`, texto: `Herramienta numero ${i} con palabras clave` });
    }
    const indice = crearIndiceBm25(indices);
    const resultados = indice.buscar("herramienta clave", 10);
    expect(resultados.length).toBeGreaterThan(0);
  });
});

describe("constantes del patrón", () => {
  it("tiene valor 12", () => {
    expect(UMBRAL_PROGRESIVO).toBe(12);
  });

  it("pequeño: maxResultados 3, maxDescripcion 80, sin esquema", () => {
    expect(PERFILES_MEDIO["modelo-pequeno"]).toEqual({
      maxResultados: 3,
      maxDescripcion: 80,
      conEsquema: false,
    });
  });

  it("mediano: maxResultados 5, maxDescripcion 160, sin esquema", () => {
    expect(PERFILES_MEDIO["modelo-mediano"]).toEqual({
      maxResultados: 5,
      maxDescripcion: 160,
      conEsquema: false,
    });
  });

  it("grande: maxResultados 8, maxDescripcion 400, con esquema", () => {
    expect(PERFILES_MEDIO["modelo-grande"]).toEqual({
      maxResultados: 8,
      maxDescripcion: 400,
      conEsquema: true,
    });
  });

  it("contiene exactamente las tres metaherramientas", () => {
    expect(METAHERRAMIENTAS).toEqual([
      "descubrir_herramientas",
      "detalle_herramienta",
      "ejecutar_herramienta",
    ]);
  });
});

describe("envolverProgresivo", () => {
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
    const resultado = envolverProgresivo(muchasHerramientas);
    expect(resultado).toHaveLength(3);
    const nombres = resultado.map((h) => h.nombre);
    expect(nombres).toEqual([
      "descubrir_herramientas",
      "detalle_herramienta",
      "ejecutar_herramienta",
    ]);
  });

  it("permitida filtra herramientas, y si resultado filtrado > umbral, devuelve metaherramientas", () => {
    const resultado = envolverProgresivo(muchasHerramientas, {
      permitida: (h) => h.nombre !== "tareas_listar" && h.nombre !== "estado",
    });
    const nombres = resultado.map((h) => h.nombre);
    expect(resultado).toHaveLength(3);
    expect(nombres).toEqual([
      "descubrir_herramientas",
      "detalle_herramienta",
      "ejecutar_herramienta",
    ]);
  });

  it("permite personalizar el umbral", () => {
    const pocasHerramientas = [herramientaFalsa("a", "A"), herramientaFalsa("b", "B")];
    const resultado = envolverProgresivo(pocasHerramientas, { umbral: 5 });
    expect(resultado).toHaveLength(2);
  });

  it("el ctx llega a la herramienta cuando hay > umbral", async () => {
    const indexConCtx = [...muchasHerramientas];
    indexConCtx[0] = {
      nombre: "con_ctx",
      descripcion: "Con contexto",
      esquema: {},
      ejecutar: async (_args: Record<string, unknown>, ctx?: unknown) => {
        const c = ctx as { testCtx?: string } | undefined;
        return { contenido: [{ tipo: "texto", texto: c?.testCtx ?? "sin ctx" }] };
      },
    };
    const r = envolverProgresivo(indexConCtx);
    const ejecutar = r.find((h) => h.nombre === "ejecutar_herramienta");
    const jsonResult = await ejecutar!.ejecutar({ nombre: "con_ctx", argumentos: {} }, {
      testCtx: "valor",
    });
    expect(jsonResult.contenido[0].texto).toBe("valor");
  });
});

type FichaDescubierta = {
  nombre: string;
  descripcion: string;
  esquema?: unknown;
  [clave: string]: unknown;
};

type CuerpoDescubrimiento = {
  resultados: FichaDescubierta[];
  total: number;
  sugerencia?: string;
};

const resultado = envolverProgresivo(muchasHerramientas);

function parseDescubrir(cuerpo: string): CuerpoDescubrimiento {
  return JSON.parse(cuerpo) as CuerpoDescubrimiento;
}

describe("metaherramientas", () => {
  it("el perfil pequeño recorta descripciones a 80 caracteres", async () => {
    const conPerfil = envolverProgresivo(muchasHerramientas, { medio: "modelo-pequeno" });
    const descubrir = conPerfil.find((h) => h.nombre === "descubrir_herramientas");
    const respuesta = await descubrir!.ejecutar({ consulta: "tareas" });
    const parsed = parseDescubrir(respuesta.contenido[0].texto);
    expect(parsed.resultados.length).toBeGreaterThan(0);
    expect(parsed.resultados[0]).toHaveProperty("nombre");
    expect(parsed.resultados[0]).toHaveProperty("descripcion");
    expect(typeof parsed.resultados[0].descripcion).toBe("string");
    expect(parsed.resultados[0].descripcion.length).toBeLessThanOrEqual(80);
  });

  it("el perfil grande incluye esquema", async () => {
    const conPerfil = envolverProgresivo(muchasHerramientas, { medio: "modelo-grande" });
    const descubrir = conPerfil.find((h) => h.nombre === "descubrir_herramientas");
    const respuesta = await descubrir!.ejecutar({ consulta: "tareas" });
    const parsed = parseDescubrir(respuesta.contenido[0].texto);
    expect(parsed.resultados[0]).toHaveProperty("esquema");
  });

  it("descubrir devuelve JSON con resultados y total", async () => {
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas");
    const respuesta = await descubrir!.ejecutar({ consulta: "tareas" });
    const parsed = parseDescubrir(respuesta.contenido[0].texto);
    expect(parsed).toHaveProperty("resultados");
    expect(parsed).toHaveProperty("total");
    expect(parsed.resultados.length).toBeGreaterThan(0);
  });

  it("cuando no hay resultados, incluye sugerencia", async () => {
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas");
    const respuesta = await descubrir!.ejecutar({ consulta: "zzzz" });
    const parsed = parseDescubrir(respuesta.contenido[0].texto);
    expect(parsed.resultados).toEqual([]);
    expect(parsed.sugerencia).toBeDefined();
  });

  it("se limita por maxResultados del perfil mediano (5)", async () => {
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas");
    const respuesta = await descubrir!.ejecutar({ consulta: "herramienta" });
    const parsed = parseDescubrir(respuesta.contenido[0].texto);
    expect(parsed.resultados).toHaveLength(5);
    expect(parsed.total).toBeGreaterThan(5);
  });

  it("detalle devuelve JSON completo de la herramienta", async () => {
    const detalle = resultado.find((h) => h.nombre === "detalle_herramienta");
    const respuesta = await detalle!.ejecutar({ nombre: "tareas_listar" });
    const parsed = JSON.parse(respuesta.contenido[0].texto) as Record<string, unknown>;
    expect(parsed).toHaveProperty("nombre", "tareas_listar");
    expect(parsed).toHaveProperty("descripcion");
    expect(parsed).toHaveProperty("esquema");
  });

  it("detalle devuelve error si la herramienta no existe", async () => {
    const detalle = resultado.find((h) => h.nombre === "detalle_herramienta");
    const respuesta = await detalle!.ejecutar({ nombre: "herramienta_inexistente" });
    expect(respuesta.esError).toBe(true);
    expect(respuesta.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });

  it("ejecuta correctamente una herramienta visible", async () => {
    const ejecutar = resultado.find((h) => h.nombre === "ejecutar_herramienta");
    const respuesta = await ejecutar!.ejecutar({ nombre: "tareas_listar", argumentos: {} });
    expect(respuesta.esError).toBeUndefined();
    expect(respuesta.contenido[0].texto).toBe("ok tareas_listar");
  });

  it("no puede llamar a una metaherramienta", async () => {
    const ejecutar = resultado.find((h) => h.nombre === "ejecutar_herramienta");
    const respuesta = await ejecutar!.ejecutar({
      nombre: "descubrir_herramientas",
      argumentos: {},
    });
    expect(respuesta.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });

  it("no puede llamar a una herramienta desconocida", async () => {
    const ejecutar = resultado.find((h) => h.nombre === "ejecutar_herramienta");
    const respuesta = await ejecutar!.ejecutar({
      nombre: "herramienta_inexistente",
      argumentos: {},
    });
    expect(respuesta.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });

  it("una herramienta que lanza devuelve error sin pila", async () => {
    const conFalla = [...muchasHerramientas];
    conFalla[0] = {
      nombre: "falla",
      descripcion: "Falla de verdad",
      esquema: {},
      ejecutar: async () => {
        throw new Error("boom");
      },
    };
    const envuelta = envolverProgresivo(conFalla);
    const ejecutar = envuelta.find((h) => h.nombre === "ejecutar_herramienta");
    const respuesta = await ejecutar!.ejecutar({ nombre: "falla", argumentos: {} });
    expect(respuesta.esError).toBe(true);
    expect(respuesta.contenido[0].texto).toContain("La herramienta falló");
    expect(respuesta.contenido[0].texto).not.toContain("boom");
  });
});
