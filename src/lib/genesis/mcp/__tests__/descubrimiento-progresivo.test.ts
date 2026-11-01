/**
 * Pruebas del descubrimiento progresivo de herramientas MCP (patrón Strata).
 * Casos rescatados de la rama archivada nube/a1-20261101-124710-AGT1025B,
 * adaptados a la API actual del módulo.
 */
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
    ejecutar: async () => ({
      contenido: [{ tipo: "texto", texto: `ok: ${nombre}` }],
    }),
  };
}

function encontrar(lista: HerramientaMcp[], nombre: string): HerramientaMcp {
  const hallada = lista.find((h) => h.nombre === nombre);
  if (!hallada) throw new Error(`No está la herramienta: ${nombre}`);
  return hallada;
}

/** 13 relleno + tareas_listar + estado: 15 > 12, y filtradas quedan 13 (> 12 igual). */
const muchasHerramientas: HerramientaMcp[] = [
  herramientaFalsa("tareas_listar", "Lista las tareas del sistema"),
  herramientaFalsa("estado", "Obtiene el estado actual"),
];
for (let i = 0; i < 13; i++) {
  muchasHerramientas.push(
    herramientaFalsa(`tool_${i}`, `Herramienta numero ${i} con palabras clave`),
  );
}

const resultadoEnvelope = envolverProgresivo(muchasHerramientas);

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
    const indice = crearIndiceBm25([
      { id: "b", texto: "alpha beta" },
      { id: "a", texto: "alpha beta" },
    ]);
    const resultados = indice.buscar("alpha", 10);
    expect(resultados[0].id).toBe("a");
    expect(resultados[1].id).toBe("b");
  });

  it("no se ahorra escala con 20 documentos falsos", () => {
    const docs = [];
    for (let i = 0; i < 20; i++) {
      docs.push({ id: `tool_${i}`, texto: `Herramienta numero ${i} con palabras clave` });
    }
    const indice = crearIndiceBm25(docs);
    const resultados = indice.buscar("herramienta clave", 10);
    expect(resultados.length).toBeGreaterThan(0);
  });
});

describe("constantes del presupuesto progresivo", () => {
  it("el umbral es 12", () => {
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
    expect([...METAHERRAMIENTAS]).toEqual([
      "descubrir_herramientas",
      "detalle_herramienta",
      "ejecutar_herramienta",
    ]);
  });
});

describe("envolverProgresivo", () => {
  it("≤ umbral devuelve las mismas herramientas sin metaherramientas", () => {
    const pocas = [
      herramientaFalsa("a", "A"),
      herramientaFalsa("b", "B"),
      herramientaFalsa("c", "C"),
    ];
    const devueltas = envolverProgresivo(pocas);
    expect(devueltas).toHaveLength(3);
    const nombres = devueltas.map((h) => h.nombre);
    expect(nombres).toEqual(["a", "b", "c"]);
    expect(nombres).not.toContain("descubrir_herramientas");
  });

  it("> umbral devuelve exactamente las tres metaherramientas", () => {
    expect(resultadoEnvelope).toHaveLength(3);
    const nombres = resultadoEnvelope.map((h) => h.nombre);
    expect(nombres).toEqual([
      "descubrir_herramientas",
      "detalle_herramienta",
      "ejecutar_herramienta",
    ]);
  });

  it("permite personalizar el umbral", () => {
    const pocas = [herramientaFalsa("a", "A"), herramientaFalsa("b", "B")];
    expect(envolverProgresivo(pocas, { umbral: 5 })).toHaveLength(2);
    expect(envolverProgresivo(pocas, { umbral: 1 })).toHaveLength(3);
  });

  it("el perfil pequeño recorta descripciones a 80 caracteres", async () => {
    const conLarga = [
      herramientaFalsa("larga", "X".repeat(120) + " palabras clave"),
      ...muchasHerramientas,
    ];
    const devueltas = envolverProgresivo(conLarga, { medio: "modelo-pequeno" });
    expect(devueltas).toHaveLength(3);
    const descubrir = encontrar(devueltas, "descubrir_herramientas");
    const bruto = await descubrir.ejecutar({ consulta: "larga" });
    const ficha = JSON.parse(bruto.contenido[0].texto);
    expect(ficha.resultados).toHaveLength(1);
    expect(typeof ficha.resultados[0].descripcion).toBe("string");
    expect(ficha.resultados[0].descripcion.length).toBe(80);
  });

  it("el perfil grande incluye el esquema en cada ficha", async () => {
    const devueltas = envolverProgresivo(muchasHerramientas, { medio: "modelo-grande" });
    const descubrir = encontrar(devueltas, "descubrir_herramientas");
    const bruto = await descubrir.ejecutar({ consulta: "tareas" });
    const ficha = JSON.parse(bruto.contenido[0].texto);
    expect(ficha.resultados[0]).toHaveProperty("esquema");
  });

  it("permitida filtra antes de contar: si sigue habiendo muchas, metaherramientas", () => {
    const devueltas = envolverProgresivo(muchasHerramientas, {
      permitida: (h) => h.nombre !== "tareas_listar" && h.nombre !== "estado",
    });
    const nombres = devueltas.map((h) => h.nombre);
    expect(devueltas).toHaveLength(3);
    expect(nombres).toEqual([
      "descubrir_herramientas",
      "detalle_herramienta",
      "ejecutar_herramienta",
    ]);
  });

  it("permitida filtra por debajo del umbral: quedan las visibles tal cual", () => {
    const pocas = [herramientaFalsa("a", "A"), herramientaFalsa("b", "B")];
    const devueltas = envolverProgresivo([...pocas], {
      umbral: 1,
      permitida: (h) => h.nombre === "a",
    });
    expect(devueltas).toHaveLength(1);
    expect(devueltas[0].nombre).toBe("a");
  });
});

describe("descubrir_herramientas", () => {
  it("devuelve JSON con resultados y total", async () => {
    const descubrir = encontrar(resultadoEnvelope, "descubrir_herramientas");
    const bruto = await descubrir.ejecutar({ consulta: "tareas" });
    const ficha = JSON.parse(bruto.contenido[0].texto);
    expect(ficha).toHaveProperty("resultados");
    expect(ficha).toHaveProperty("total");
    expect(ficha.resultados.length).toBeGreaterThan(0);
  });

  it("cuando no hay resultados, incluye sugerencia", async () => {
    const descubrir = encontrar(resultadoEnvelope, "descubrir_herramientas");
    const bruto = await descubrir.ejecutar({ consulta: "zzqqxy" });
    const ficha = JSON.parse(bruto.contenido[0].texto);
    expect(ficha.resultados).toEqual([]);
    expect(String(ficha.sugerencia)).toContain("otras palabras");
  });

  it("se limita por maxResultados del perfil mediano (5)", async () => {
    const descubrir = encontrar(resultadoEnvelope, "descubrir_herramientas");
    const bruto = await descubrir.ejecutar({ consulta: "herramienta clave" });
    const ficha = JSON.parse(bruto.contenido[0].texto);
    expect(ficha.total).toBeGreaterThan(5);
    expect(ficha.resultados).toHaveLength(5);
  });
});

describe("detalle_herramienta", () => {
  it("devuelve JSON completo de la herramienta", async () => {
    const detalle = encontrar(resultadoEnvelope, "detalle_herramienta");
    const bruto = await detalle.ejecutar({ nombre: "tareas_listar" });
    const ficha = JSON.parse(bruto.contenido[0].texto);
    expect(ficha).toHaveProperty("nombre", "tareas_listar");
    expect(ficha).toHaveProperty("descripcion");
    expect(ficha).toHaveProperty("esquema");
  });

  it("devuelve error si la herramienta no existe", async () => {
    const detalle = encontrar(resultadoEnvelope, "detalle_herramienta");
    const bruto = await detalle.ejecutar({ nombre: "herramienta_inexistente" });
    expect(bruto.esError).toBe(true);
    expect(bruto.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });
});

describe("ejecutar_herramienta", () => {
  it("ejecuta correctamente una herramienta visible", async () => {
    const ejecutar = encontrar(resultadoEnvelope, "ejecutar_herramienta");
    const bruto = await ejecutar.ejecutar({ nombre: "tareas_listar", argumentos: {} });
    expect(bruto.esError).toBeUndefined();
    expect(bruto.contenido[0].texto).toBe("ok: tareas_listar");
  });

  it("no puede llamar a una metaherramienta", async () => {
    const ejecutar = encontrar(resultadoEnvelope, "ejecutar_herramienta");
    const bruto = await ejecutar.ejecutar({ nombre: "descubrir_herramientas", argumentos: {} });
    expect(bruto.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });

  it("no puede llamar a una herramienta desconocida", async () => {
    const ejecutar = encontrar(resultadoEnvelope, "ejecutar_herramienta");
    const bruto = await ejecutar.ejecutar({ nombre: "herramienta_inexistente", argumentos: {} });
    expect(bruto.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
  });

  it("el ctx llega a la herramienta cuando hay > umbral", async () => {
    interface CtxDePrueba {
      testCtx?: string;
    }
    const copia: HerramientaMcp[] = [...muchasHerramientas];
    copia[0] = {
      nombre: "con_ctx",
      descripcion: "Con contexto",
      esquema: {},
      ejecutar: async (_args: Record<string, unknown>, ctx?: unknown) => ({
        contenido: [
          { tipo: "texto", texto: (ctx as CtxDePrueba | undefined)?.testCtx ?? "sin ctx" },
        ],
      }),
    };
    const ejecutar = encontrar(envolverProgresivo(copia), "ejecutar_herramienta");
    const bruto = await ejecutar.ejecutar(
      { nombre: "con_ctx", argumentos: {} },
      { testCtx: "valor" } as CtxDePrueba,
    );
    expect(bruto.contenido[0].texto).toBe("valor");
  });

  it("una herramienta que lanza devuelve error sin pila", async () => {
    const chasquea: HerramientaMcp = {
      nombre: "chasquea",
      descripcion: "Explota siempre con pila larga",
      esquema: {},
      ejecutar: async () => {
        throw new Error("boom con pila");
      },
    };
    const ejecutar = encontrar(
      envolverProgresivo([...muchasHerramientas, chasquea]),
      "ejecutar_herramienta",
    );
    const bruto = await ejecutar.ejecutar({ nombre: "chasquea", argumentos: {} });
    expect(bruto.esError).toBe(true);
    expect(bruto.contenido[0].texto).toBe("La herramienta falló.");
  });
});
