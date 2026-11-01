import { describe, it, expect } from "vitest";
import {
  METAHERRAMIENTAS,
  PERFILES_MEDIO,
  UMBRAL_PROGRESIVO,
  crearIndiceBm25,
  envolverProgresivo,
  tokenizar,
} from "../descubrimiento-progresivo";
import type { HerramientaMcp } from "../protocolo";

function herramientaFalsa(nombre: string, descripcion: string): HerramientaMcp {
  return {
    nombre,
    descripcion,
    esquema: { type: "object", properties: {} },
    ejecutar: async () => ({ contenido: [{ tipo: "texto", texto: `hecha: ${nombre}` }] }),
  };
}

const relleno: HerramientaMcp[] = Array.from({ length: 18 }, (_, i) =>
  herramientaFalsa(`extra_${i}`, `Herramienta de relleno ${i} con palabras clave`),
);

const muchasHerramientas: HerramientaMcp[] = [
  herramientaFalsa("tareas_listar", "Lista las tareas del sistema"),
  herramientaFalsa("tareas_crear", "Crea una tarea nueva"),
  herramientaFalsa("estado", "Obtiene el estado actual"),
  ...relleno,
];

describe("tokenizar", () => {
  it("separa camelCase ANTES de pasar a minúsculas", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("misHerramientas")).toEqual(["mis", "herramientas"]);
  });

  it("quita tildes (NFD), incluida la eñe", () => {
    expect(tokenizar("cañón")).toEqual(["canon"]);
    expect(tokenizar("español")).toEqual(["espanol"]);
    expect(tokenizar("año")).toEqual(["ano"]);
  });

  it("parte por todo lo que no sea [a-z0-9] (guion bajo, guion y punto)", () => {
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas-listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas.listar")).toEqual(["tareas", "listar"]);
  });

  it("descarta tokens de 1 carácter y las palabras vacías", () => {
    expect(tokenizar("a b c")).toEqual([]);
    expect(tokenizar("de la tareas el listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("the tasks for")).toEqual(["tasks"]);
  });

  it("consulta vacía devuelve []", () => {
    expect(tokenizar("")).toEqual([]);
    expect(tokenizar(" _ - . ")).toEqual([]);
  });
});

describe("crearIndiceBm25", () => {
  it("índice vacío o consulta sin tokens útiles devuelve []", () => {
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

  it("resuelve sobre 20 herramientas falsas sin agotarse", () => {
    const docs = relleno.map((h, i) => ({
      id: `tool_${i}`,
      texto: `Herramienta numero ${i} con palabras clave`,
    }));
    const indice = crearIndiceBm25(docs);
    const resultados = indice.buscar("herramienta clave", 10);
    expect(resultados.length).toBeGreaterThan(0);
  });

  it("el límite 0 o no finito devuelve []", () => {
    const indice = crearIndiceBm25([{ id: "a", texto: "alpha" }]);
    expect(indice.buscar("alpha", 0)).toEqual([]);
    expect(indice.buscar("alpha", Number.POSITIVE_INFINITY)).toEqual([]);
  });
});

describe("constantes del contrato", () => {
  it("el umbral progresivo es 12", () => {
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

  it("METAHERRAMIENTAS contiene exactamente las tres metaherramientas", () => {
    expect(METAHERRAMIENTAS).toEqual([
      "descubrir_herramientas",
      "detalle_herramienta",
      "ejecutar_herramienta",
    ]);
  });
});

describe("envolverProgresivo — listado", () => {
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

  it("permitida filtra herramientas: si el resultado sigue > umbral, metaherramientas", () => {
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
    const resultado = envolverProgresivo(
      [herramientaFalsa("a", "A"), herramientaFalsa("b", "B")],
      { umbral: 5 },
    );
    expect(resultado).toHaveLength(2);
  });
});

describe("descubrir_herramientas", () => {
  it("devuelve JSON con resultados y total", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas")!;
    const r = await descubrir.ejecutar({ consulta: "tareas" });
    const parsed = JSON.parse(r.contenido[0].texto) as {
      resultados: unknown[];
      total: number;
    };
    expect(parsed).toHaveProperty("resultados");
    expect(parsed).toHaveProperty("total");
    expect(parsed.resultados.length).toBeGreaterThan(0);
  });

  it("el perfil pequeño recorta descripciones a ficha corta, sin esquema", async () => {
    const resultado = envolverProgresivo(muchasHerramientas, { medio: "modelo-pequeno" });
    expect(resultado).toHaveLength(3);
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas")!;
    const r = await descubrir.ejecutar({ consulta: "tareas" });
    const parsed = JSON.parse(r.contenido[0].texto) as {
      resultados: Array<{ nombre: string; descripcion: string; esquema?: unknown }>;
    };
    expect(parsed.resultados.length).toBeGreaterThan(0);
    expect(parsed.resultados[0]).toHaveProperty("nombre");
    expect(typeof parsed.resultados[0].descripcion).toBe("string");
    expect(parsed.resultados[0].esquema).toBeUndefined();
  });

  it("el perfil grande incluye esquema", async () => {
    const resultado = envolverProgresivo(muchasHerramientas, { medio: "modelo-grande" });
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas")!;
    const r = await descubrir.ejecutar({ consulta: "tareas" });
    const parsed = JSON.parse(r.contenido[0].texto) as {
      resultados: Array<Record<string, unknown>>;
    };
    expect(parsed.resultados[0]).toHaveProperty("esquema");
  });

  it("se limita por el maxResultados del perfil mediano (5)", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas")!;
    const r = await descubrir.ejecutar({ consulta: "herramienta clave" });
    const parsed = JSON.parse(r.contenido[0].texto) as {
      resultados: unknown[];
      total: number;
    };
    expect(parsed.resultados).toHaveLength(5);
    expect(parsed.total).toBe(18);
  });

  it("cuando no hay resultados incluye sugerencia", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const descubrir = resultado.find((h) => h.nombre === "descubrir_herramientas")!;
    const r = await descubrir.ejecutar({ consulta: "xyzqq" });
    const parsed = JSON.parse(r.contenido[0].texto) as {
      resultados: unknown[];
      sugerencia?: string;
    };
    expect(parsed.resultados).toHaveLength(0);
    expect(parsed.sugerencia).toBeTruthy();
  });
});

describe("detalle_herramienta", () => {
  it("devuelve JSON completo de la herramienta (nombre, descripción y esquema)", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const detalle = resultado.find((h) => h.nombre === "detalle_herramienta")!;
    const r = await detalle.ejecutar({ nombre: "tareas_listar" });
    const parsed = JSON.parse(r.contenido[0].texto) as Record<string, unknown>;
    expect(parsed).toHaveProperty("nombre", "tareas_listar");
    expect(parsed).toHaveProperty("descripcion");
    expect(parsed).toHaveProperty("esquema");
  });

  it("devuelve error si la herramienta no existe", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const detalle = resultado.find((h) => h.nombre === "detalle_herramienta")!;
    const r = await detalle.ejecutar({ nombre: "herramienta_inexistente" });
    expect(r.esError).toBe(true);
    expect(r.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });
});

describe("ejecutar_herramienta", () => {
  it("no puede llamar a una metaherramienta", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const ejecutar = resultado.find((h) => h.nombre === "ejecutar_herramienta")!;
    const r = await ejecutar.ejecutar({ nombre: "descubrir_herramientas", argumentos: {} });
    expect(r.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });

  it("no puede llamar a una herramienta desconocida", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const ejecutar = resultado.find((h) => h.nombre === "ejecutar_herramienta")!;
    const r = await ejecutar.ejecutar({ nombre: "herramienta_inexistente", argumentos: {} });
    expect(r.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });

  it("ejecuta correctamente una herramienta visible", async () => {
    const resultado = envolverProgresivo(muchasHerramientas);
    const ejecutar = resultado.find((h) => h.nombre === "ejecutar_herramienta")!;
    const r = await ejecutar.ejecutar({ nombre: "tareas_listar", argumentos: {} });
    expect(r.esError).toBeUndefined();
    expect(r.contenido[0].texto).toBe("hecha: tareas_listar");
  });

  it("el ctx llega a la herramienta cuando hay > umbral", async () => {
    interface CtxPrueba {
      testCtx?: string;
    }
    const conCtx: HerramientaMcp = {
      nombre: "con_ctx",
      descripcion: "Con contexto",
      esquema: { type: "object", properties: {} },
      ejecutar: async (_args: Record<string, unknown>, ctx?: unknown) => {
        const c = ctx as CtxPrueba | undefined;
        return { contenido: [{ tipo: "texto", texto: c?.testCtx ?? "sin ctx" }] };
      },
    };
    const resultado = envolverProgresivo([...muchasHerramientas, conCtx]);
    const ejecutar = resultado.find((h) => h.nombre === "ejecutar_herramienta")!;
    const r = await ejecutar.ejecutar({ nombre: "con_ctx", argumentos: {} }, {
      testCtx: "valor",
    } satisfies CtxPrueba);
    expect(r.contenido[0].texto).toBe("valor");
  });

  it("una herramienta que lanza devuelve error sin pila", async () => {
    const explota: HerramientaMcp = {
      nombre: "explota",
      descripcion: "Lanza siempre",
      esquema: { type: "object", properties: {} },
      ejecutar: async () => {
        throw new Error("pum");
      },
    };
    const resultado = envolverProgresivo([...muchasHerramientas, explota]);
    const ejecutar = resultado.find((h) => h.nombre === "ejecutar_herramienta")!;
    const r = await ejecutar.ejecutar({ nombre: "explota", argumentos: {} });
    expect(r.esError).toBe(true);
    expect(r.contenido[0].texto).toContain("La herramienta falló");
  });
});
