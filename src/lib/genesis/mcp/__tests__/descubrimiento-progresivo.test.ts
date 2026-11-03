import { describe, it, expect } from "vitest";
import {
  PERFILES_MEDIO,
  UMBRAL_PROGRESIVO,
  METAHERRAMIENTAS,
  tokenizar,
  crearIndiceBm25,
  envolverProgresivo,
} from "../descubrimiento-progresivo";
import type { HerramientaMcp } from "../protocolo";

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
    expect(tokenizar("crearTareaPrioritaria")).toEqual(["crear", "tarea", "prioritaria"]);
    expect(tokenizar("Tareas Listar")).toEqual(["tareas", "listar"]);
  });

  it("quita tildes (NFD) y parte por el guion bajo y otros símbolos", () => {
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas-listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas.listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("cañón")).toEqual(["canon"]);
    expect(tokenizar("créación-dócumento·áé")).toEqual([
      "creacion", "documento", "ae",
    ]);
  });

  it("descarta tokens de un carácter y palabras vacías", () => {
    expect(tokenizar("a el y de la the un x 42")).toEqual(["42"]);
    expect(tokenizar("tareas de la lista")).toEqual(["tareas", "lista"]);
    expect(tokenizar("the tasks for")).toEqual(["tasks"]);
  });

  it("al quitar la tilde puede quedar una palabra vacía y se descarta", () => {
    // "ún" se vuelve "un" (NFD + minúsculas) y "un" es palabra vacía.
    expect(tokenizar("tarea_ún")).toEqual(["tarea"]);
  });

  it("devuelve vacío para texto sin contenido útil", () => {
    expect(tokenizar("")).toEqual([]);
    expect(tokenizar("el la y a the")).toEqual([]);
  });
});

describe("crearIndiceBm25", () => {
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
    expect(crearIndiceBm25([]).buscar("", 10)).toEqual([]);
  });

  it("solo se devuelven los documentos con puntuación > 0", () => {
    const pequeño = crearIndiceBm25([
      { id: "1", texto: "tareas" },
      { id: "2", texto: "otro" },
    ]);
    expect(pequeño.buscar("tareas", 10).map((r) => r.id)).toEqual(["1"]);
  });

  it("varios documentos coinciden y el empate se resuelve por id", () => {
    const varios = crearIndiceBm25([
      { id: "1", texto: "tareas por hacer" },
      { id: "2", texto: "listar tareas pendientes" },
      { id: "3", texto: "estado del sistema" },
    ]);
    expect(varios.buscar("tareas", 10).map((r) => r.id)).toEqual(["1", "2"]);
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

  it("permite personalizar el umbral", () => {
    expect(envolverProgresivo(loteFalso(4), { umbral: 3 })).toHaveLength(3);
    expect(envolverProgresivo(loteFalso(2), { umbral: 5 })).toHaveLength(2);
  });

  it("el filtro permitida se aplica ANTES de contar el umbral", () => {
    const herramientas: HerramientaMcp[] = [
      herramientaFalsa("tareas_listar", "Lista las tareas del sistema"),
      herramientaFalsa("tareas_crear", "Crea una tarea nueva"),
      ...loteFalso(13),
    ];
    const permitida = (h: HerramientaMcp) =>
      h.nombre !== "tareas_crear" && h.nombre !== "tareas_listar";
    // 13 visibles > umbral: metaherramientas aunque el lote bruto traiga 15.
    expect(envolverProgresivo(herramientas, { permitida })).toHaveLength(3);
    // 4 visibles ≤ umbral: se devuelve el filtrado tal cual.
    const pocas = envolverProgresivo(herramientas.slice(0, 5), { permitida });
    expect(pocas).toHaveLength(3);
    expect(pocas.map((h) => h.nombre)).not.toContain("tareas_crear");
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
