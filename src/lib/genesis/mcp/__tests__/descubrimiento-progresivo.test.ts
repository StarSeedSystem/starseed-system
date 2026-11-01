import { describe, it, expect } from "vitest";
import {
  tokenizar,
  crearIndiceBm25,
  UMBRAL_PROGRESIVO,
  PERFILES_MEDIO,
  METAHERRAMIENTAS,
  envolverProgresivo,
} from "../descubrimiento-progresivo";
import type { HerramientaMcp } from "../protocolo";

function herramientaFalsa(nombre: string, descripcion: string): HerramientaMcp {
  return {
    nombre,
    descripcion,
    esquema: { type: "object" },
    ejecutar: async () => ({ contenido: [{ tipo: "texto", texto: `ok:${nombre}` }] }),
  };
}

const muchasHerramientas: HerramientaMcp[] = [
  herramientaFalsa("tareas_listar", "Lista las tareas del sistema"),
  herramientaFalsa("estado", "Obtiene el estado actual"),
];
for (let i = 3; i <= 15; i += 1) {
  muchasHerramientas.push(
    herramientaFalsa(`tool_${i}`, `Herramienta numero ${i} con palabras clave`),
  );
}

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

describe("crearIndiceBm25", () => {
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
    for (let i = 0; i < 20; i += 1) {
      indices.push({ id: `tool_${i}`, texto: `Herramienta numero ${i} con palabras clave` });
    }
    const indice = crearIndiceBm25(indices);
    const resultados = indice.buscar("herramienta clave", 10);
    expect(resultados.length).toBeGreaterThan(0);
  });
});
describe("constantes del módulo", () => {
  it("UMBRAL_PROGRESIVO tiene valor 12", () => {
    expect(UMBRAL_PROGRESIVO).toBe(12);
  });

  it("perfiles: pequeño mediano grande", () => {
    expect(PERFILES_MEDIO["modelo-pequeno"]).toEqual({
      maxResultados: 3,
      maxDescripcion: 80,
      conEsquema: false,
    });
    expect(PERFILES_MEDIO["modelo-mediano"]).toEqual({
      maxResultados: 5,
      maxDescripcion: 160,
      conEsquema: false,
    });
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
describe("envolverProgresivo · umbral", () => {
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

  it("permite personalizar el umbral", () => {
    const pocasHerramientas = [herramientaFalsa("a", "A"), herramientaFalsa("b", "B")];
    const resultado = envolverProgresivo(pocasHerramientas, { umbral: 5 });
    expect(resultado).toHaveLength(2);
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
});
describe("envolverProgresivo · metaherramientas", () => {
  it("descubrir con perfil pequeño devuelve resultados con nombre y descripción", async () => {
    const resultado = envolverProgresivo(muchasHerramientas, { medio: "modelo-pequeno" });
    expect(resultado).toHaveLength(3);
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas");
    expect(descubrir).toBeDefined();
    const resultadoJson = await descubrir!.ejecutar({ consulta: "tareas" });
    const parsed = JSON.parse(resultadoJson.contenido[0].texto);
    expect(parsed.resultados.length).toBeGreaterThan(0);
    expect(parsed.resultados[0]).toHaveProperty("nombre");
    expect(parsed.resultados[0]).toHaveProperty("descripcion");
    expect(typeof parsed.resultados[0].descripcion).toBe("string");
    expect(parsed.resultados[0].descripcion.length).toBeLessThanOrEqual(80);
  });

  it("descubrir con perfil grande incluye esquema", async () => {
    const resultado = envolverProgresivo(muchasHerramientas, { medio: "modelo-grande" });
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas");
    const resultadoJson = await descubrir!.ejecutar({ consulta: "tareas" });
    const parsed = JSON.parse(resultadoJson.contenido[0].texto);
    expect(parsed.resultados[0]).toHaveProperty("esquema");
  });

  it("descubrir se limita por maxResultados del perfil mediano (5)", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas");
    const r = await descubrir!.ejecutar({ consulta: "herramienta clave" });
    const parsed = JSON.parse(r.contenido[0].texto);
    expect(parsed.resultados.length).toBe(5);
  });

  it("cuando no hay resultados, incluye sugerencia", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas");
    const r = await descubrir!.ejecutar({ consulta: "zzzqqq" });
    const parsed = JSON.parse(r.contenido[0].texto);
    expect(parsed.resultados).toHaveLength(0);
    expect(parsed.sugerencia).toBeDefined();
  });

  it("descubrir devuelve JSON con resultados y total", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas");
    const r = await descubrir!.ejecutar({ consulta: "tareas" });
    const parsed = JSON.parse(r.contenido[0].texto);
    expect(parsed).toHaveProperty("resultados");
    expect(parsed).toHaveProperty("total");
    expect(parsed.resultados.length).toBeGreaterThan(0);
  });

  it("detalle devuelve JSON completo de la herramienta", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const detalle = resultado.find((h) => h.nombre === "detalle_herramienta");
    const r = await detalle!.ejecutar({ nombre: "tareas_listar" });
    const parsed = JSON.parse(r.contenido[0].texto);
    expect(parsed).toHaveProperty("nombre", "tareas_listar");
    expect(parsed).toHaveProperty("descripcion");
    expect(parsed).toHaveProperty("esquema");
  });

  it("detalle devuelve error si la herramienta no existe", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const detalle = resultado.find((h) => h.nombre === "detalle_herramienta");
    const r = await detalle!.ejecutar({ nombre: "herramienta_inexistente" });
    expect(r.esError).toBe(true);
    expect(r.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });

  it("ejecutar no puede llamar a una metaherramienta", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const ejecutar = resultado.find((h) => h.nombre === "ejecutar_herramienta");
    const r = await ejecutar!.ejecutar({ nombre: "descubrir_herramientas", argumentos: {} });
    expect(r.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });

  it("ejecutar no puede llamar a una herramienta desconocida", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const ejecutar = resultado.find((h) => h.nombre === "ejecutar_herramienta");
    const r = await ejecutar!.ejecutar({ nombre: "herramienta_inexistente", argumentos: {} });
    expect(r.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });

  it("ejecuta correctamente una herramienta visible", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const ejecutar = resultado.find((h) => h.nombre === "ejecutar_herramienta");
    const r = await ejecutar!.ejecutar({ nombre: "tareas_listar", argumentos: {} });
    expect(r.contenido[0].texto).toBe("ok:tareas_listar");
    expect(r.esError).toBeUndefined();
  });

  it("una herramienta que lanza devuelve error sin pila", async () => {
    const herramientas: HerramientaMcp[] = muchasHerramientas.slice();
    herramientas[0] = {
      nombre: "que_lanza",
      descripcion: "Explota",
      esquema: {},
      ejecutar: async () => {
        throw new Error("explosión interna");
      },
    };
    const resultado = envolverProgresivo(herramientas);
    const ejecutar = resultado.find((h) => h.nombre === "ejecutar_herramienta");
    const r = await ejecutar!.ejecutar({ nombre: "que_lanza", argumentos: {} });
    expect(r.esError).toBe(true);
    expect(r.contenido[0].texto).toBe("La herramienta falló.");
  });

  it("el ctx llega a la herramienta cuando hay > umbral", async () => {
    const conCtx = [...muchasHerramientas];
    conCtx[0] = {
      nombre: "con_ctx",
      descripcion: "Con contexto",
      esquema: {},
      ejecutar: async (_args: Record<string, unknown>, ctx?: unknown) => {
        const c = ctx as { testCtx?: string } | undefined;
        return {
          contenido: [{ tipo: "texto", texto: c?.testCtx ?? "sin ctx" }],
        };
      },
    };
    const r = envolverProgresivo(conCtx);
    const ejecutar = r.find((h) => h.nombre === "ejecutar_herramienta");
    const jsonResult = await ejecutar!.ejecutar(
      { nombre: "con_ctx", argumentos: {} },
      { testCtx: "valor" } as { testCtx: string },
    );
    expect(jsonResult.contenido[0].texto).toBe("valor");
  });
});
