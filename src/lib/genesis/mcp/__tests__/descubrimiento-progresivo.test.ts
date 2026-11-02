import { describe, it, expect } from "vitest";
import {
<<<<<<< HEAD
  tokenizar,
  crearIndiceBm25,
  UMBRAL_PROGRESIVO,
  PERFILES_MEDIO,
  METAHERRAMIENTAS,
=======
  PERFILES_MEDIO,
  UMBRAL_PROGRESIVO,
  METAHERRAMIENTAS,
  tokenizar,
  crearIndiceBm25,
>>>>>>> 4831464d8 (salvavidas · AGT1025B-d2c: trabajo del agente antes de las puertas (tsc / vitest))
  envolverProgresivo,
} from "../descubrimiento-progresivo";
import type { HerramientaMcp } from "../protocolo";

<<<<<<< HEAD
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
=======
type ResultadoMcp = Awaited<ReturnType<HerramientaMcp["ejecutar"]>>;

function herramientaFalsa(
  nombre: string,
  descripcion: string,
): HerramientaMcp {
  return {
    nombre,
    descripcion,
    esquema: { type: "object", properties: { limite: { type: "number" } } },
    ejecutar: async () => ({
      contenido: [{ tipo: "texto", texto: `hecho:${nombre}` }],
    }),
  };
}

function loteFalso(cuantas: number): HerramientaMcp[] {
  const lote: HerramientaMcp[] = [];
  for (let i = 0; i < cuantas; i += 1) {
    lote.push(herramientaFalsa(`accion_${i}`, `Acción de prueba número ${i} sobre datos`));
  }
  return lote;
}

function textoDe(resultado: ResultadoMcp): string {
  return resultado.contenido[0]?.texto ?? "";
}

function fichasDe(resultado: ResultadoMcp): Array<Record<string, unknown>> {
  const cuerpo = JSON.parse(textoDe(resultado)) as Record<string, unknown>;
  return cuerpo.resultados as Array<Record<string, unknown>>;
}

describe("tokenizar", () => {
  it("separa camelCase antes de pasar a minúsculas", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("listaTareasPendientesAPI")).toEqual([
      "lista", "tareas", "pendientes", "api",
    ]);
  });

  it("quita tildes y parte por el guion bajo y otros símbolos", () => {
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("créación-dócumento·áé")).toEqual([
      "creacion", "documento", "ae",
    ]);
  });

  it("descarta tokens de un carácter y palabras vacías", () => {
    expect(tokenizar("a el y de la the un x 42")).toEqual(["42"]);
    expect(tokenizar("tareas de la lista")).toEqual(["tareas", "lista"]);
  });

  it("devuelve vacío para texto sin contenido útil", () => {
    expect(tokenizar("")).toEqual([]);
    expect(tokenizar("el la y a the")).toEqual([]);
>>>>>>> 4831464d8 (salvavidas · AGT1025B-d2c: trabajo del agente antes de las puertas (tsc / vitest))
  });
});

describe("crearIndiceBm25", () => {
<<<<<<< HEAD
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
=======
  const docs = loteFalso(20).map((h) => ({
    id: h.nombre,
    texto: `${h.nombre} ${h.descripcion}`,
  }));
  docs.push({ id: "tareas_listar", texto: "tareas_listar Lista las tareas pendientes" });
  const indice = crearIndiceBm25(docs);

  it("«listar tareas» devuelve tareas_listar primero", () => {
    const resultados = indice.buscar("listar tareas", 5);
    expect(resultados[0]?.id).toBe("tareas_listar");
  });

  it("una consulta vacía devuelve vacío", () => {
    expect(indice.buscar("", 5)).toEqual([]);
    expect(indice.buscar("el la y the", 5)).toEqual([]);
  });

  it("el empate se resuelve por id ascendente (estable)", () => {
    const empate = crearIndiceBm25([
      { id: "bbb", texto: "cosa" },
      { id: "aaa", texto: "cosa" },
      { id: "ccc", texto: "cosa" },
    ]);
    expect(empate.buscar("cosa", 10).map((r) => r.id)).toEqual(["aaa", "bbb", "ccc"]);
  });
});

describe("PERFILES_MEDIO y constantes", () => {
  it("valores acordados por medio", () => {
    expect(PERFILES_MEDIO["modelo-pequeno"]).toEqual({
      maxResultados: 3, maxDescripcion: 80, conEsquema: false,
    });
    expect(PERFILES_MEDIO["modelo-mediano"]).toEqual({
      maxResultados: 5, maxDescripcion: 160, conEsquema: false,
    });
    expect(PERFILES_MEDIO["modelo-grande"]).toEqual({
      maxResultados: 8, maxDescripcion: 400, conEsquema: true,
    });
    expect(UMBRAL_PROGRESIVO).toBe(12);
    expect(METAHERRAMIENTAS).toEqual([
      "descubrir_herramientas", "detalle_herramienta", "ejecutar_herramienta",
    ]);
  });
});

describe("envolverProgresivo · umbral", () => {
  it("con pocas herramientas (≤ umbral) devuelve la misma lista", () => {
    const lote = loteFalso(5);
    const envueltas = envolverProgresivo(lote);
    expect(envueltas).toBe(lote);
  });

  it("con muchas (> umbral) devuelve exactamente las tres metaherramientas", () => {
    const envueltas = envolverProgresivo(loteFalso(15));
    expect(envueltas.map((h) => h.nombre)).toEqual([...METAHERRAMIENTAS]);
  });
});

describe("envolverProgresivo · descubrir por perfil", () => {
  const lote = [
    ...loteFalso(13),
    herramientaFalsa("tareas_listar", "Lista las tareas pendientes del día"),
  ];

  async function descubrir(medio: "modelo-pequeno" | "modelo-grande") {
    const [meta] = envolverProgresivo(lote, { medio });
    const resultado = await meta.ejecutar({ consulta: "datos" });
    const fichas = fichasDe(resultado);
    return { meta, fichas };
  }

  it("el perfil pequeño da como mucho 3 resultados", async () => {
    const { fichas } = await descubrir("modelo-pequeno");
    expect(fichas.length).toBe(3);
    expect(fichas.length).toBeLessThanOrEqual(PERFILES_MEDIO["modelo-pequeno"].maxResultados);
  });

  it("el perfil pequeño recorta descripciones a 80 y no da esquema", async () => {
    const { fichas } = await descubrir("modelo-pequeno");
    expect(fichas.length).toBeGreaterThan(0);
    const maxDescripcion = PERFILES_MEDIO["modelo-pequeno"].maxDescripcion;
    for (const ficha of fichas) {
      expect(String(ficha.descripcion).length).toBeLessThanOrEqual(maxDescripcion);
      expect(ficha.esquema).toBeUndefined();
    }
  });

  it("el perfil grande respeta su tope y da el esquema de cada resultado", async () => {
    const { fichas } = await descubrir("modelo-grande");
    expect(fichas.length).toBe(PERFILES_MEDIO["modelo-grande"].maxResultados);
    for (const ficha of fichas) {
      expect(ficha.esquema).toEqual(lote[0].esquema);
    }
  });

  it("sin resultados devuelve sugerencia", async () => {
    const [meta] = envolverProgresivo(lote);
    const resultado = await meta.ejecutar({ consulta: "zzzqqq" });
    const cuerpo = JSON.parse(textoDe(resultado)) as Record<string, unknown>;
    expect(cuerpo.resultados).toEqual([]);
    expect(cuerpo.sugerencia).toBe("prueba con otras palabras");
  });
});

describe("envolverProgresivo · detalle_herramienta", () => {
  const lote = [
    ...loteFalso(13),
    herramientaFalsa("tareas_listar", "Lista las tareas pendientes del día"),
  ];

  it("devuelve nombre, descripción y esquema completos", async () => {
    const [, detalle] = envolverProgresivo(lote);
    const resultado = await detalle.ejecutar({ nombre: "tareas_listar" });
    const ficha = JSON.parse(textoDe(resultado)) as Record<string, unknown>;
    expect(ficha.nombre).toBe("tareas_listar");
    expect(ficha.descripcion).toBe("Lista las tareas pendientes del día");
    expect(ficha.esquema).toEqual(lote[lote.length - 1].esquema);
  });

  it("una herramienta desconocida da esError con su nombre", async () => {
    const [, detalle] = envolverProgresivo(lote);
    const resultado = await detalle.ejecutar({ nombre: "inexistente" });
    expect(resultado.esError).toBe(true);
    expect(textoDe(resultado)).toBe("Herramienta desconocida o no permitida: inexistente");
  });
});

describe("envolverProgresivo · ejecutar_herramienta", () => {
  const lote = loteFalso(13);

  function metaDe(loteLocal: HerramientaMcp[]) {
    return envolverProgresivo(loteLocal)[2];
  }

  it("ejecuta una herramienta visible y devuelve su resultado tal cual", async () => {
    const meta = metaDe(lote);
    const resultado = await meta.ejecutar({
      nombre: "accion_4",
      argumentos: { limite: 7 },
    });
    expect(resultado.esError).toBeUndefined();
    expect(textoDe(resultado)).toBe("hecho:accion_4");
  });

  it("no puede ejecutar una metaherramienta ni una desconocida", async () => {
    const meta = metaDe(lote);
    for (const nombre of ["descubrir_herramientas", "detalle_herramienta", "enige"]) {
      const resultado = await meta.ejecutar({ nombre });
      expect(resultado.esError).toBe(true);
      expect(textoDe(resultado)).toBe(`Herramienta desconocida o no permitida: ${nombre}`);
    }
  });

  it("una herramienta que lanza da esError sin filtrar el mensaje", async () => {
    const rota: HerramientaMcp = {
      nombre: "accion_rota",
      descripcion: "Acción que lanza siempre al ejecutarse",
      esquema: { type: "object", properties: {} },
      ejecutar: async () => {
        throw new Error("fallo interno secreto");
      },
    };
    const meta = metaDe([...lote, rota]);
    const resultado = await meta.ejecutar({ nombre: "accion_rota" });
    expect(resultado.esError).toBe(true);
    expect(textoDe(resultado)).toBe("La herramienta falló.");
    expect(textoDe(resultado)).not.toContain("fallo interno secreto");
  });

  it("el ctx recibido llega a la herramienta", async () => {
    let visto: unknown = null;
    const conCtx: HerramientaMcp[] = [
      ...lote,
      {
        nombre: "accion_con_ctx",
        descripcion: "Acción que guarda el contexto que recibe",
        esquema: { type: "object", properties: {} },
        ejecutar: async (_args, ctx) => {
          visto = ctx;
          return { contenido: [{ tipo: "texto", texto: "con ctx" }] };
        },
      },
    ];
    const meta = metaDe(conCtx);
    const senal = { cuenta: "prueba" };
    await meta.ejecutar({ nombre: "accion_con_ctx" }, senal);
    expect(visto).toBe(senal);
  });
});

describe("envolverProgresivo · permitida", () => {
  const oculta = herramientaFalsa("tareas_borrar", "Borra tareas de la papelera");
  const lote = [oculta, ...loteFalso(13)];
  const opciones = { permitida: (h: HerramientaMcp) => h.nombre !== "tareas_borrar" };

  it("oculta la herramienta no permitida del descubrimiento", async () => {
    const [meta] = envolverProgresivo(lote, opciones);
    const resultado = await meta.ejecutar({ consulta: "borra papelera" });
    const fichas = fichasDe(resultado);
    expect(fichas.some((f) => f.nombre === "tareas_borrar")).toBe(false);
  });

  it("oculta la herramienta no permitida del detalle", async () => {
    const [, detalle] = envolverProgresivo(lote, opciones);
    const resultado = await detalle.ejecutar({ nombre: "tareas_borrar" });
    expect(resultado.esError).toBe(true);
    expect(textoDe(resultado)).toBe("Herramienta desconocida o no permitida: tareas_borrar");
  });

  it("oculta la herramienta no permitida de la ejecución", async () => {
    const meta = envolverProgresivo(lote, opciones)[2];
    const resultado = await meta.ejecutar({
      nombre: "tareas_borrar",
      argumentos: {},
    });
    expect(resultado.esError).toBe(true);
    expect(textoDe(resultado)).toBe("Herramienta desconocida o no permitida: tareas_borrar");
  });

  it("una permitida sí aparece y se ejecuta", async () => {
    const [meta] = envolverProgresivo(lote, opciones);
    const resultado = await meta.ejecutar({ consulta: "datos accion" });
    expect(fichasDe(resultado).some((f) => f.nombre === "accion_0")).toBe(true);
    const metaEjecutar = envolverProgresivo(lote, opciones)[2];
    const hecho = await metaEjecutar.ejecutar({ nombre: "accion_0" });
    expect(textoDe(hecho)).toBe("hecho:accion_0");
  });
});

>>>>>>> 4831464d8 (salvavidas · AGT1025B-d2c: trabajo del agente antes de las puertas (tsc / vitest))
