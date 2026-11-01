/**
 * Descubrimiento progresivo de herramientas MCP (patrón Strata, BM25 propio).
 * Rescate de las pruebas de la rama nube AGT1025B, adaptadas a la API de hoy:
 * para llegar a las metaherramientas hay que bajar el umbral (main devuelve
 * las herramientas tal cual cuando caben todas).
 * Módulo puro: sin red, sin disco, sin procesos.
 */
import { describe, expect, it } from "vitest";
import {
  METAHERRAMIENTAS, PERFILES_MEDIO, UMBRAL_PROGRESIVO, crearIndiceBm25, envolverProgresivo, tokenizar,
} from "../descubrimiento-progresivo";
import type { HerramientaMcp } from "../protocolo";

const METAS = [...METAHERRAMIENTAS];

type ResultadoMcp = Awaited<ReturnType<HerramientaMcp["ejecutar"]>>;

const ficha = (nombre: string, descripcion = `Acción de ${nombre}`): HerramientaMcp => ({
  nombre,
  descripcion,
  esquema: { type: "object", properties: {} },
  ejecutar: async () => ({ contenido: [{ tipo: "texto", texto: `hecho: ${nombre}` }] }),
});

const herramientasFalsas: HerramientaMcp[] = [
  ficha("tareas_listar", "Lista las tareas por hacer."),
  ficha("tareas_crear", "Crea una tarea nueva."),
  ficha("tareas_marcar", "Marca una tarea como hecha."),
  ficha("notas_buscar", "Busca en tus notas."),
  ficha("estado_resumen", "Resumen del estado del sistema."),
];

const primerTexto = (resultado: ResultadoMcp): string => resultado.contenido[0]?.texto ?? "";

describe("tokenizar · separación, tildes y palabras vacías", () => {
  it("separa camelCase antes de minúsculas", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
  });
  it("maneja múltiples palabras en camelCase", () => {
    expect(tokenizar("crearTareaPrioritaria")).toEqual(["crear", "tarea", "prioritaria"]);
  });
  it("trata guiones bajos como separador", () => {
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
  });
  it("quita tildes usando NFD", () => {
    // "un" es palabra vacía, así que solo queda "tarea"
    expect(tokenizar("tarea_ún")).toEqual(["tarea"]);
  });
  it("convierte a minúsculas", () => {
    expect(tokenizar("Tareas Listar")).toEqual(["tareas", "listar"]);
  });
  it("descarta tokens de un carácter", () => {
    expect(tokenizar("a la")).toEqual([]);
  });
  it("descarta palabras vacías mínimas", () => {
    expect(tokenizar("de las tareas")).toEqual(["tareas"]);
  });
  it("maneja texto con acentos", () => {
    expect(tokenizar("crearLamina")).toEqual(["crear", "lamina"]);
  });
  it("parte por caracteres no alfanuméricos", () => {
    expect(tokenizar("hola.mundo!")).toEqual(["hola", "mundo"]);
  });
});

describe("crearIndiceBm25 · consultas vacías, orden y frontera de puntuación", () => {
  it("búsqueda vacía devuelve vacío", () => {
    const indice = crearIndiceBm25([]);
    expect(indice.buscar("", 10)).toEqual([]);
  });
  it("busca con consulta vacía y documentos", () => {
    const indice = crearIndiceBm25([{ id: "1", texto: "tareas_listar" }]);
    expect(indice.buscar("", 10)).toEqual([]);
  });
  it("ordena por puntuación descendente y id ascendente en empate", () => {
    const indice = crearIndiceBm25([
      { id: "z", texto: "tareas" },
      { id: "a", texto: "tareas" },
    ]);
    const resultados = indice.buscar("tareas", 10);
    expect(resultados[0].id).toBe("a");
    expect(resultados[1].id).toBe("z");
  });
  it("solo devuelve resultados con puntuación > 0", () => {
    const indice = crearIndiceBm25([
      { id: "1", texto: "tareas" },
      { id: "2", texto: "otro" },
    ]);
    const resultados = indice.buscar("tareas", 10);
    expect(resultados).toHaveLength(1);
    expect(resultados[0].id).toBe("1");
  });
  it("busca en múltiples documentos", () => {
    const indice = crearIndiceBm25([
      { id: "1", texto: "tareas por hacer" },
      { id: "2", texto: "listar tareas pendientes" },
      { id: "3", texto: "estado del sistema" },
    ]);
    const resultados = indice.buscar("tareas", 10);
    expect(resultados).toHaveLength(2);
    // Mismo puntaje: empate resuelto por id ascendente ("1" < "2")
    expect(resultados[0].id).toBe("1");
    expect(resultados[1].id).toBe("2");
  });
});

describe("constantes exportadas", () => {
  it("UMBRAL_PROGRESIVO es 12", () => {
    expect(UMBRAL_PROGRESIVO).toBe(12);
  });
  it("PERFILES_MEDIO tiene los perfiles esperados", () => {
    expect(PERFILES_MEDIO["modelo-pequeno"]).toEqual({ maxResultados: 3, maxDescripcion: 80, conEsquema: false });
    expect(PERFILES_MEDIO["modelo-mediano"]).toEqual({ maxResultados: 5, maxDescripcion: 160, conEsquema: false });
    expect(PERFILES_MEDIO["modelo-grande"]).toEqual({ maxResultados: 8, maxDescripcion: 400, conEsquema: true });
  });
});

describe("envolverProgresivo · pocas herramientas se devuelven tal cual", () => {
  it("<= umbral devuelve las mismas herramientas", () => {
    const resultado = envolverProgresivo(herramientasFalsas, { umbral: 10 });
    expect(resultado).toHaveLength(5);
  });
  it("> umbral devuelve solo las tres metaherramientas", () => {
    const resultado = envolverProgresivo(herramientasFalsas, { umbral: 3 });
    expect(resultado).toHaveLength(3);
    expect(resultado[0].nombre).toBe("descubrir_herramientas");
    expect(resultado[1].nombre).toBe("detalle_herramienta");
    expect(resultado[2].nombre).toBe("ejecutar_herramienta");
  });
  it("perfil pequeño limita a 3 resultados sin esquema, pero bajo el umbral siguen todas", () => {
    const resultado = envolverProgresivo(herramientasFalsas, { medio: "modelo-pequeno" });
    expect(resultado).toHaveLength(5);
  });
  it("perfil grande incluye esquema, pero bajo el umbral siguen todas", () => {
    const resultado = envolverProgresivo(herramientasFalsas, { medio: "modelo-grande" });
    expect(resultado).toHaveLength(5);
  });
});

describe("envolverProgresivo · permitida filtra ANTES de contar y descubrir", () => {
  const permitida = (h: HerramientaMcp) => h.nombre !== "tareas_crear";

  it("quitadas las herramientas del filtro, con umbral 3 quedan las metas (4 > 3)", () => {
    const resultado = envolverProgresivo(herramientasFalsas, { permitida, umbral: 3 });
    expect(resultado).toHaveLength(3);
    expect(resultado.map((h) => h.nombre)).toEqual(METAS);
  });

  it("sin el filtro y con umbral 4, las 5 herramientas envuelven en metas (5 > 4)", () => {
    expect(envolverProgresivo(herramientasFalsas, { umbral: 4 })).toHaveLength(3);
  });

  it("permitida oculta herramientas del detalle", async () => {
    const resultado = envolverProgresivo(herramientasFalsas, { permitida, umbral: 3 });
    const detalle = await resultado[1].ejecutar({ nombre: "tareas_crear" });
    expect(primerTexto(detalle)).toContain("desconocida");
  });

  it("permitida oculta herramientas de la ejecución", async () => {
    const resultado = envolverProgresivo(herramientasFalsas, { permitida, umbral: 3 });
    const ejecutar = await resultado[2].ejecutar({ nombre: "tareas_crear" });
    expect(primerTexto(ejecutar)).toContain("desconocida");
  });
});

describe("ejecutar_herramienta · guardas y paso de contexto", () => {
  const metasDe = (extras: HerramientaMcp[] = []) =>
    envolverProgresivo([...herramientasFalsas, ...extras], { umbral: 3 });
  const metaEjecutar = (extras: HerramientaMcp[] = []): HerramientaMcp => {
    const meta = metasDe(extras).find((h) => h.nombre === "ejecutar_herramienta");
    if (!meta) throw new Error("No apareció la metaherramienta ejecutar");
    return meta;
  };

  it("no puede llamar a una metaherramienta", async () => {
    expect(primerTexto(await metaEjecutar().ejecutar({ nombre: "descubrir_herramientas" }))).toContain("desconocida");
  });

  it("no llama a una herramienta desconocida", async () => {
    expect(primerTexto(await metaEjecutar().ejecutar({ nombre: "herramienta_inexistente" }))).toContain("desconocida");
  });

  it("el ctx llega a la herramienta ejecutada", async () => {
    const ctx = { usuario: "test" };
    let recibido: unknown;
    const prueba: HerramientaMcp = {
      ...ficha("test_tool", "Herramienta de prueba"),
      ejecutar: async (_args, contexto) => {
        recibido = contexto;
        return { contenido: [{ tipo: "texto", texto: "ok" }] };
      },
    };
    const r = await metaEjecutar([prueba]).ejecutar({ nombre: "test_tool", argumentos: {} }, ctx);
    expect(recibido).toEqual(ctx);
    expect(primerTexto(r)).toBe("ok");
  });

  it("una herramienta que lanza devuelve error con mensaje fijo", async () => {
    const lanza: HerramientaMcp = {
      ...ficha("error_tool", "Herramienta que falla"),
      ejecutar: async () => {
        throw new Error("Error específico de la herramienta");
      },
    };
    const r = await metaEjecutar([lanza]).ejecutar({ nombre: "error_tool" });
    expect(primerTexto(r)).toBe("La herramienta falló.");
    expect(r.esError).toBe(true);
  });
});
