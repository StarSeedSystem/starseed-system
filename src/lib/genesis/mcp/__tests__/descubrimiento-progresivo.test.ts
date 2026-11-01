/**
 * Rescate RTAGT1025Bb de la rama nube/a1-20261101-153627-AGT1025B (AGT1025B):
 * pruebas del módulo puro del descubrimiento progresivo de herramientas MCP
 * (patrón Strata de Klavis, BM25 propio), tal como vive hoy en main.
 * Solo funciones puras: sin red, sin disco, sin `vi.mock` y sin rutas de API.
 */
import { describe, expect, it } from "vitest";
import type { HerramientaMcp } from "../protocolo";
import { crearIndiceBm25, envolverProgresivo, PERFILES_MEDIO, tokenizar, UMBRAL_PROGRESIVO } from "../descubrimiento-progresivo";

const herramientaFalsa = (nombre: string, descripcion: string, propiedades: string[]): HerramientaMcp => ({
  nombre,
  descripcion,
  esquema: {
    type: "object",
    properties: Object.fromEntries(propiedades.map((p) => [p, { type: "string" }])),
  },
  ejecutar: async () => ({ contenido: [{ tipo: "texto", texto: "vale" }] }),
});

const herramientasFalsas: HerramientaMcp[] = [
  herramientaFalsa("tareas_listar", "Lista las tareas de la persona en el OS", ["estado"]),
  herramientaFalsa("tareas_crear", "Crea una tarea nueva con título y prioridad", ["titulo"]),
  herramientaFalsa("notas_buscar", "Busca notas por palabras clave", ["consulta"]),
  herramientaFalsa("calendario_hoy", "Muestra los eventos del calendario de hoy", ["dia"]),
  herramientaFalsa("audio_transcribir", "Transcribe un audio grabado en la neurona", ["audio"]),
];

const laMetaherramienta = (lista: HerramientaMcp[], nombre: string): HerramientaMcp => {
  const meta = lista.find((h) => h.nombre === nombre);
  if (!meta) throw new Error(`falta la metaherramienta ${nombre}`);
  return meta;
};

const textoDe = (resultado: { contenido: Array<{ tipo: "texto"; texto: string }> }): string =>
  resultado.contenido[0]?.texto ?? "";

describe("tokenizar", () => {
  it("separa camelCase antes de pasar a minúsculas", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
  });
  it("separa varias palabras en camelCase", () => {
    expect(tokenizar("crearTareaPrioritaria")).toEqual(["crear", "tarea", "prioritaria"]);
  });
  it("trata el guion bajo como separador", () => {
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
  });
  it("quita las tildes con NFD y descarta la palabra vacía que quede", () => {
    // «un» es palabra vacía, así que solo queda «tarea».
    expect(tokenizar("tarea_ún")).toEqual(["tarea"]);
  });
  it("convierte a minúsculas", () => {
    expect(tokenizar("Tareas Listar")).toEqual(["tareas", "listar"]);
  });
  it("descarta los tokens de un solo carácter", () => {
    expect(tokenizar("a la")).toEqual([]);
  });
  it("descarta las palabras vacías mínimas", () => {
    expect(tokenizar("de las tareas")).toEqual(["tareas"]);
  });
  it("maneja texto con acentos", () => {
    expect(tokenizar("crearLamina")).toEqual(["crear", "lamina"]);
  });
  it("parte por caracteres no alfanuméricos", () => {
    expect(tokenizar("hola.mundo!")).toEqual(["hola", "mundo"]);
  });
});

describe("crearIndiceBm25", () => {
  it("una consulta vacía devuelve vacío, con o sin documentos", () => {
    expect(crearIndiceBm25([]).buscar("", 10)).toEqual([]);
    expect(crearIndiceBm25([{ id: "1", texto: "tareas_listar" }]).buscar("", 10)).toEqual([]);
  });
  it("ordena por puntuación descendente y por id ascendente en el empate", () => {
    const indice = crearIndiceBm25([
      { id: "z", texto: "tareas" },
      { id: "a", texto: "tareas" },
    ]);
    expect(indice.buscar("tareas", 10).map((r) => r.id)).toEqual(["a", "z"]);
  });
  it("solo devuelve resultados con puntuación mayor que cero", () => {
    const indice = crearIndiceBm25([
      { id: "1", texto: "tareas" },
      { id: "2", texto: "otro" },
    ]);
    expect(indice.buscar("tareas", 10).map((r) => r.id)).toEqual(["1"]);
  });
  it("busca en varios documentos y resuelve el empate por id", () => {
    const indice = crearIndiceBm25([
      { id: "1", texto: "tareas por hacer" },
      { id: "2", texto: "listar tareas pendientes" },
      { id: "3", texto: "estado del sistema" },
    ]);
    expect(indice.buscar("tareas", 10).map((r) => r.id)).toEqual(["1", "2"]);
  });
});

describe("constantes del módulo", () => {
  it("el umbral progresivo es 12", () => {
    expect(UMBRAL_PROGRESIVO).toBe(12);
  });
  it("los perfiles de medio tienen los límites esperados", () => {
    expect(PERFILES_MEDIO["modelo-pequeno"]).toEqual({ maxResultados: 3, maxDescripcion: 80, conEsquema: false });
    expect(PERFILES_MEDIO["modelo-mediano"]).toEqual({ maxResultados: 5, maxDescripcion: 160, conEsquema: false });
    expect(PERFILES_MEDIO["modelo-grande"]).toEqual({ maxResultados: 8, maxDescripcion: 400, conEsquema: true });
  });
});

describe("envolverProgresivo · umbral y perfiles", () => {
  it("con pocas herramientas (≤ umbral) las devuelve tal cual", () => {
    const resultado = envolverProgresivo(herramientasFalsas, { umbral: 10 });
    expect(resultado).toHaveLength(5);
  });
  it("con muchas (> umbral) devuelve solo las tres metaherramientas, en orden", () => {
    const resultado = envolverProgresivo(herramientasFalsas, { umbral: 3 });
    expect(resultado).toHaveLength(3);
    expect(resultado[0].nombre).toBe("descubrir_herramientas");
    expect(resultado[1].nombre).toBe("detalle_herramienta");
    expect(resultado[2].nombre).toBe("ejecutar_herramienta");
  });
  it("el medio pequeño no cambia el listado cuando hay pocas herramientas", () => {
    expect(envolverProgresivo(herramientasFalsas, { medio: "modelo-pequeno" })).toHaveLength(5);
  });
  it("el medio grande tampoco las cambia (el perfil solo afecta al modo progresivo)", () => {
    expect(envolverProgresivo(herramientasFalsas, { medio: "modelo-grande" })).toHaveLength(5);
  });
});

describe("envolverProgresivo · permitida y metaherramientas", () => {
  // En main `permitida` se aplica ANTES de contar: para que salgan las metas,
  // las visibles tienen que quedar por encima del umbral (aquí, 3).
  const sinCrear = (h: HerramientaMcp) => h.nombre !== "tareas_crear";

  it("permitida filtra el listado antes de contar", () => {
    expect(envolverProgresivo(herramientasFalsas, { permitida: sinCrear })).toHaveLength(4);
  });
  it("permitida oculta la herramienta en detalle_herramienta", async () => {
    const resultado = envolverProgresivo(herramientasFalsas, { umbral: 3, permitida: sinCrear });
    const detalle = await laMetaherramienta(resultado, "detalle_herramienta").ejecutar({ nombre: "tareas_crear" });
    expect(textoDe(detalle)).toContain("desconocida");
  });
  it("permitida oculta la herramienta en ejecutar_herramienta", async () => {
    const resultado = envolverProgresivo(herramientasFalsas, { umbral: 3, permitida: sinCrear });
    const ejecutar = await laMetaherramienta(resultado, "ejecutar_herramienta").ejecutar({ nombre: "tareas_crear" });
    expect(textoDe(ejecutar)).toContain("desconocida");
  });
  it("ejecutar no puede llamar a una metaherramienta", async () => {
    const resultado = envolverProgresivo(herramientasFalsas, { umbral: 3 });
    const ejecutar = await laMetaherramienta(resultado, "ejecutar_herramienta").ejecutar({ nombre: "descubrir_herramientas" });
    expect(textoDe(ejecutar)).toContain("desconocida");
  });
  it("ejecutar da «desconocida» ante una herramienta que no existe", async () => {
    const resultado = envolverProgresivo(herramientasFalsas, { umbral: 3 });
    const ejecutar = await laMetaherramienta(resultado, "ejecutar_herramienta").ejecutar({ nombre: "herramienta_inexistente" });
    expect(textoDe(ejecutar)).toContain("desconocida");
  });
  it("el contexto llega tal cual a la herramienta ejecutada", async () => {
    const ctx = { usuario: "test" };
    const herramientaMock: HerramientaMcp = {
      nombre: "test_tool",
      descripcion: "Herramienta de prueba",
      esquema: { type: "object", properties: {} },
      ejecutar: async (_args, recibido) => {
        expect(recibido).toEqual({ usuario: "test" });
        return { contenido: [{ tipo: "texto", texto: "ok" }] };
      },
    };
    const resultado = envolverProgresivo([...herramientasFalsas, herramientaMock], { umbral: 3 });
    const ejecutar = await laMetaherramienta(resultado, "ejecutar_herramienta").ejecutar(
      { nombre: "test_tool", argumentos: {} },
      ctx,
    );
    expect(textoDe(ejecutar)).toBe("ok");
  });
  it("una herramienta que lanza devuelve un error que no filtra su mensaje", async () => {
    const herramientaLanza: HerramientaMcp = {
      nombre: "error_tool",
      descripcion: "Herramienta que falla",
      esquema: { type: "object", properties: {} },
      ejecutar: async () => {
        throw new Error("Error específico de la herramienta");
      },
    };
    const resultado = envolverProgresivo([...herramientasFalsas, herramientaLanza], { umbral: 3 });
    const ejecutar = await laMetaherramienta(resultado, "ejecutar_herramienta").ejecutar({ nombre: "error_tool" });
    expect(textoDe(ejecutar)).toBe("La herramienta falló.");
    expect(textoDe(ejecutar)).not.toContain("específico");
  });
});
