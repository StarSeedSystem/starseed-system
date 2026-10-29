import { describe, it, expect } from "vitest";
import {
  PERFILES_MEDIO,
  UMBRAL_PROGRESIVO,
  METAHERRAMIENTAS,
  tokenizar,
  crearIndiceBm25,
  envolverProgresivo,
  type MedioIa,
} from "../descubrimiento-progresivo";
import type { HerramientaMcp } from "../protocolo";

/** Herramienta para pruebas: guarda el ctx recibido para comprobar el relevo. */
const ctxGuardado: { valor: unknown } = { valor: undefined };

function herramientaFalsa(
  nombre: string,
  descripcion: string,
  opciones: { esquema?: Record<string, unknown>; responde?: (args: Record<string, unknown>, ctx?: unknown) => string } = {}
): HerramientaMcp {
  return {
    nombre,
    descripcion,
    esquema: opciones.esquema ?? {},
    ejecutar: async (args, ctx) => {
      ctxGuardado.valor = ctx;
      if (opciones.responde) return { contenido: [{ tipo: "texto", texto: opciones.responde(args, ctx) }] };
      return { contenido: [{ tipo: "texto", texto: JSON.stringify({ nombre, args }) }] };
    },
  };
}

const DESCRIPCION_LARGA = "Herramienta de prueba para el descubrimiento progresivo del servidor MCP de Genesis";
/** Veinte herramientas falsas con materias distintas para mantener f refining el BM25. */
const MATERIAS = [
  "tareas", "notas", "agenda", "correos", "usuario", "sesiones", "biblioteca", "canales",
  "votos", "invento", "cohetes", "sedimento", "tango", "rasgos", "uniones", "constantes",
];

function herramientasDeMaterias(cantidad: number): HerramientaMcp[] {
  const nombres: string[] = [];
  for (let i = 0; i < cantidad; i += 1) {
    const materia = MATERIAS[i % MATERIAS.length];
    const accion = ["listar", "crear", "borrar"][i % 3];
    nombres.push(`${materia}_${accion}`);
  }
  return nombres.map((nombre) => herramientaFalsa(nombre, `${DESCRIPCION_LARGA} sobre ${nombre}`));
}

describe("tokenizar", () => {
  it("separa camelCase y obtiene los mismos tokens que con guion bajo", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("usuarioListarTareas")).toEqual(["usuario", "listar", "tareas"]);
  });

  it("quita tildes con NFD antes de partir", () => {
    expect(tokenizar("Canción NúmeroDos")).toEqual(["cancion", "numero", "dos"]);
    expect(tokenizar("Árbol de notas únicas")).toEqual(["arbol", "notas", "unicas"]);
  });

  it("descarta palabras vacías y tokens de un carácter", () => {
    expect(tokenizar("el análisis de la red")).toEqual(["analisis", "red"]);
    expect(tokenizar("a y o de the to")).toEqual([]);
  });

  it("parte por cualquier signo que no sea letra o número", () => {
    expect(tokenizar("creación.doc (lista_final) v2")).toEqual(["creacion", "doc", "lista", "final", "v2"]);
  });
});

describe("crearIndiceBm25", () => {
  it("con 20 herramientas falsas, «listar tareas» devuelve tareas_listar primero", () => {
    const indice = crearIndiceBm25(
      herramientasDeMaterias(20).map((h) => ({ id: h.nombre, texto: `${h.nombre} ${h.descripcion}` }))
    );
    const resultados = indice.buscar("listar tareas", 5);
    expect(resultados.length).toBeGreaterThan(0);
    expect(resultados[0].id).toBe("tareas_listar");
    expect(resultados[0].puntuacion).toBeGreaterThan(resultados[1].puntuacion);
  });

  it("consulta vacía devuelve una lista vacía", () => {
    const indice = crearIndiceBm25([{ id: "uno", texto: "tareas listar" }]);
    expect(indice.buscar("", 5)).toEqual([]);
  });

  it("empate de puntuación se resuelve por id ascendente", () => {
    const indice = crearIndiceBm25([
      { id: "c", texto: "mazo unificado" },
      { id: "a", texto: "mazo unificado" },
      { id: "b", texto: "mazo unificado" },
    ]);
    expect(indice.buscar("mazo", 10).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

async function resultadoMeta(
  herramientas: HerramientaMcp[],
  meta: string,
  argumentos: Record<string, unknown>
): Promise<{ texto: string; esError?: boolean }> {
  const [meta3] = envolverProgresivo(herramientas).filter((h) => h.nombre === meta);
  if (!meta3) throw new Error(`meta ausente: ${meta}`);
  const sal = await meta3.ejecutar(argumentos, undefined);
  return { texto: sal.contenido[0].texto, esError: sal.esError };
}

describe("envolverProgresivo", () => {
  it(`con ${UMBRAL_PROGRESIVO} herramientas o menos devuelve la lista sin cambios`, () => {
    const base = herramientasDeMaterias(UMBRAL_PROGRESIVO);
    expect(envolverProgresivo(base)).toEqual(base);
  });

  it("con más del umbral devuelve exactamente las tres metaherramientas", () => {
    const resultado = envolverProgresivo(herramientasDeMaterias(20));
    expect(resultado.map((h) => h.nombre)).toEqual([...METAHERRAMIENTAS]);
    expect(new Set(resultado.map((h) => h.nombre))).not.toContain("tareas_listar");
  });

  it("el perfil pequeño da como mucho 3 resultados, descripciones recortadas y sin esquema", async () => {
    const [meta] = envolverProgresivo(herramientasDeMaterias(20), { medio: "modelo-pequeno" as MedioIa });
    expect(PERFILES_MEDIO["modelo-pequeno"].maxResultados).toBe(3);
    const hola = await meta.ejecutar({ consulta: "listar tareas" }, undefined);
    const datos = JSON.parse(hola.contenido[0].texto) as {
      resultados: Array<{ nombre: string; descripcion: string; esquema?: unknown }>;
      total: number;
    };
    expect(datos.resultados.length).toBeLessThanOrEqual(3);
    expect(datos.resultados[0].nombre).toBe("tareas_listar");
    for (const fila of datos.resultados) {
      expect(fila.descripcion.length).toBeLessThanOrEqual(80);
      expect(fila.esquema).toBeUndefined();
    }
    expect(datos.total).toBeGreaterThan(3);
  });

  it("el perfil grande incluye el esquema de cada resultado", async () => {
    const esquemaCon = { type: "object", properties: { limite: { type: "number" } } };
    const herramienta = herramientaFalsa("tareas_listar", DESCRIPCION_LARGA, { esquema: esquemaCon });
    const resto: HerramientaMcp[] = herramientasDeMaterias(19); resto.push(herramienta);
    const [meta] = envolverProgresivo(resto, { medio: "modelo-grande" });
    const sal = await meta.ejecutar({ consulta: "tareas" }, undefined);
    const datos = JSON.parse(sal.contenido[0].texto) as { resultados: Array<{ nombre: string; esquema?: unknown }> };
    const fila = datos.resultados.find((r) => r.nombre === "tareas_listar");
    expect(fila?.esquema).toEqual(esquemaCon);
  });

  it("consulta sin resultados devuelve sugerencia", async () => {
    const { texto } = await resultadoMeta(herramientasDeMaterias(20), "descubrir_herramientas", { consulta: "zzz" });
    const datos = JSON.parse(texto) as { resultados: unknown[]; sugerencia?: string };
    expect(datos.resultados).toEqual([]);
    expect(datos.sugerencia).toBe("prueba con otras palabras");
  });

  it("el pedido de límite nunca pasa de maxResultados del medio", async () => {
    const [meta] = envolverProgresivo(herramientasDeMaterias(20), { medio: "modelo-pequeno" });
    const sal = await meta.ejecutar({ consulta: "listar", limite: 100 }, undefined);
    const datos = JSON.parse(sal.contenido[0].texto) as { resultados: unknown[] };
    expect(datos.resultados.length).toBeLessThanOrEqual(3);
  });

  it("detalle_herramienta devuelve nombre, descripción y esquema completos", async () => {
    const esquema = { type: "object", properties: { limite: { type: "number" } } };
    const herramienta = herramientaFalsa("tareas_listar", DESCRIPCION_LARGA, { esquema });
    const resto = herramientasDeMaterias(19); resto.push(herramienta);
    const { texto, esError } = await resultadoMeta(resto, "detalle_herramienta", { nombre: "tareas_listar" });
    expect(esError).toBeUndefined();
    const datos = JSON.parse(texto) as { nombre: string; descripcion: string; esquema: unknown };
    expect(datos.nombre).toBe("tareas_listar");
    expect(datos.descripcion).toBe(DESCRIPCION_LARGA);
    expect(datos.esquema).toEqual(esquema);
  });

  it("detalle_herramienta falla con nombre desconocido", async () => {
    const { texto, esError } = await resultadoMeta(herramientasDeMaterias(20), "detalle_herramienta", { nombre: "secreta" });
    expect(esError).toBe(true);
    expect(texto).toBe("Herramienta desconocida o no permitida: secreta");
  });

  it("permitida oculta herramientas del descubrimiento y del detalle", async () => {
    const opciones = { medio: "modelo-grande" as MedioIa, permitida: (h: HerramientaMcp) => !h.nombre.startsWith("tareas_") };
    const herramientas = herramientasDeMaterias(20);
    const [meta] = envolverProgresivo(herramientas, opciones);
    const sal = await meta.ejecutar({ consulta: "tareas listar" }, undefined);
    const datos = JSON.parse(sal.contenido[0].texto) as { resultados: Array<{ nombre: string }>, total: number };
    expect(datos.resultados.find((r) => r.nombre === "tareas_listar")).toBeUndefined();
  });

  it("permitida también bloquea el detalle de una herramienta oculta", async () => {
    const opciones = { permitida: (h: HerramientaMcp) => !h.nombre.startsWith("tareas_") };
    const metas = envolverProgresivo(herramientasDeMaterias(20), opciones);
    const detalle = metas.find((m) => m.nombre === "detalle_herramienta");
    if (!detalle) throw new Error("detalle ausente");
    const sal = await detalle.ejecutar({ nombre: "tareas_listar" }, undefined);
    expect(sal.esError).toBe(true);
    expect(sal.contenido[0].texto).toBe("Herramienta desconocida o no permitida: tareas_listar");
  });

  it("ejecutar_herramienta no puede llamar a una metaherramienta ni a desconocidas", async () => {
    for (const nombre of [...METAHERRAMIENTAS, "totally_inexistente"]) {
      const { texto, esError } = await resultadoMeta(herramientasDeMaterias(20), "ejecutar_herramienta", { nombre });
      expect(esError).toBe(true);
      expect(texto).toBe(`Herramienta desconocida o no permitida: ${nombre}`);
    }
  });

  it("permitida también bloquea la ejecución de una herramienta oculta", async () => {
    const opciones = { permitida: (h: HerramientaMcp) => !h.nombre.startsWith("tareas_") };
    const metas = envolverProgresivo(herramientasDeMaterias(20), opciones);
    const ejecutar = metas.find((m) => m.nombre === "ejecutar_herramienta");
    if (!ejecutar) throw new Error("ejecutar ausente");
    const sal = await ejecutar.ejecutar({ nombre: "tareas_listar", argumentos: { limite: 2 } }, undefined);
    expect(sal.esError).toBe(true);
    expect(sal.contenido[0].texto).toBe("Herramienta desconocida o no permitida: tareas_listar");
  });

  it("el ctx recibido llega a la herramienta ejecutada", async () => {
    const respuesta = (args: Record<string, unknown>, ctx?: unknown) => `ctx:${JSON.stringify(ctx)}`;
    const herramienta = herramientaFalsa("tareas_listar", DESCRIPCION_LARGA, { responde: respuesta });
    const resto = herramientasDeMaterias(19); resto.push(herramienta);
    const metas = envolverProgresivo(resto);
    const ejecutar = metas.find((m) => m.nombre === "ejecutar_herramienta");
    if (!ejecutar) throw new Error("ejecutar ausente");
    const sal = await ejecutar.ejecutar({ nombre: "tareas_listar" }, { cuenta: "x" });
    expect(sal.contenido[0].texto).toBe(`ctx:${JSON.stringify({ cuenta: "x" })}`);
  });

  it("si la herramienta lanza, la meta responde esError sin revelar el mensaje", async () => {
    const letal = herramientaFalsa("tareas_listar", DESCRIPCION_LARGA);
    letal.ejecutar = async () => {
      throw new Error(["mensaje", "secreto"].join(" "));
    };
    const resto = herramientasDeMaterias(19); resto.push(letal);
    const metas = envolverProgresivo(resto);
    const ejecutar = metas.find((m) => m.nombre === "ejecutar_herramienta");
    if (!ejecutar) throw new Error("ejecutar ausente");
    const sal = await ejecutar.ejecutar({ nombre: "tareas_listar" }, undefined);
    expect(sal.esError).toBe(true);
    expect(sal.contenido[0].texto).toBe("La herramienta falló.");
    expect(sal.contenido[0].texto).not.toContain("secreto");
  });
});
