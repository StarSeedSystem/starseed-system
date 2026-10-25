import { describe, it, expect } from "vitest";
import { crearIndiceBm25, envolverProgresivo, tokenizar, PERFILES_MEDIO, UMBRAL_PROGRESIVO, METAHERRAMIENTAS } from "../descubrimiento-progresivo";
import type { HerramientaMcp } from "../protocolo";

function falsa(nombre: string, descripcion: string): HerramientaMcp {
  return {
    nombre, descripcion,
    esquema: { type: "object", properties: { dato: { type: "string" } } },
    ejecutar: async (args, ctx) => ({ contenido: [{ tipo: "texto", texto: `eco ${JSON.stringify(args)} ctx ${JSON.stringify(ctx)}` }] }),
  };
}

const falsas = (): HerramientaMcp[] => {
  const lista = [falsa("tareas_listar", "Lista todas las tareas del sistema")];
  for (let i = 2; i <= 20; i++) lista.push(falsa(`tema${i}_casa`, "asunto distinto"));
  return lista;
};

describe("descubrimiento progresivo", () => {
  it("tokenizar: camelCase, guion bajo, tildes y palabras vacías", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("Café Chai-Late")).toEqual(["cafe", "chai", "late"]);
    expect(tokenizar("la lista de la casa")).toEqual(["lista", "casa"]);
    expect(tokenizar("e a")).toEqual([]);
  });

  it("BM25: «listar tareas» destaca tareas_listar; consulta vacía nada; empate estable por id", () => {
    const indice = crearIndiceBm25(falsas().map((h) => ({ id: h.nombre, texto: `${h.nombre} ${h.descripcion}` })));
    expect(indice.buscar("listar tareas", 5)[0].id).toBe("tareas_listar");
    expect(indice.buscar("", 5)).toEqual([]);
    const gemelos = crearIndiceBm25([{ id: "c_hermana", texto: "gemelo igual" }, { id: "a_hermana", texto: "gemelo igual" }, { id: "b_distinta", texto: "otra cosa" }]);
    expect(gemelos.buscar("gemelo igual", 10).map((r) => r.id)).toEqual(["a_hermana", "c_hermana"]);
  });

  it("por debajo del umbral devuelve la misma lista; por encima, las tres metaherramientas", () => {
    const pocas = falsas().slice(0, UMBRAL_PROGRESIVO);
    expect(envolverProgresivo(pocas)).toEqual(pocas);
    expect(envolverProgresivo(falsas()).map((h) => h.nombre)).toEqual([...METAHERRAMIENTAS]);
  });

  it("perfil pequeño: ≤ 3 resultados, descripciones ≤ 80 y sin esquema; sin consulta es error", async () => {
    const [descubrir] = envolverProgresivo(falsas(), { medio: "modelo-pequeno" });
    const res = await descubrir.ejecutar({ consulta: "listar tareas", limite: 99 }, undefined);
    const cuerpo = JSON.parse(res.contenido[0].texto) as { resultados: Array<{ nombre: string; descripcion: string; esquema?: unknown }>; total: number };
    expect(cuerpo.resultados.length).toBeLessThanOrEqual(PERFILES_MEDIO["modelo-pequeno"].maxResultados);
    expect(cuerpo.resultados[0].nombre).toBe("tareas_listar");
    for (const r of cuerpo.resultados) {
      expect(r.descripcion.length).toBeLessThanOrEqual(80);
      expect("esquema" in r).toBe(false);
    }
    expect(cuerpo.total).toBe(20);
    expect((await descubrir.ejecutar({}, undefined)).esError).toBe(true);
  });

  it("perfil grande: resultado con esquema; consulta sin hallazgos da sugerencia", async () => {
    const [descubrir] = envolverProgresivo(falsas(), { medio: "modelo-grande" });
    const cuerpo = JSON.parse((await descubrir.ejecutar({ consulta: "tareas" }, undefined)).contenido[0].texto) as { resultados: Array<{ nombre: string; esquema: unknown }> };
    expect(cuerpo.resultados[0].nombre).toBe("tareas_listar");
    expect(cuerpo.resultados[0].esquema).toBeDefined();
    const vacia = JSON.parse((await descubrir.ejecutar({ consulta: "zzzz inexplicable" }, undefined)).contenido[0].texto) as { resultados: unknown[]; sugerencia: string };
    expect(vacia.resultados).toEqual([]);
    expect(vacia.sugerencia.length).toBeGreaterThan(0);
  });

  it("permitida oculta herramientas del descubrimiento, del detalle y de la ejecución", async () => {
    const [descubrir, detalle, ejecutar] = envolverProgresivo(falsas(), { permitida: (h) => h.nombre !== "tareas_listar" });
    const corpo = JSON.parse((await descubrir.ejecutar({ consulta: "listar tareas" }, undefined)).contenido[0].texto) as { resultados: Array<{ nombre: string }> };
    expect(corpo.resultados.some((r) => r.nombre === "tareas_listar")).toBe(false);
    const det = await detalle.ejecutar({ nombre: "tareas_listar" }, undefined);
    expect(det.esError).toBe(true);
    expect(det.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
    const ej = await ejecutar.ejecutar({ nombre: "tareas_listar", argumentos: {} }, undefined);
    expect(ej.esError).toBe(true);
  });

  it("ejecutar/metedura: ni metaherramientas ni desconocidas; el ctx llega; el fallo no filtra la excepción", async () => {
    const h = falsas();
    h[0].ejecutar = async (_args, ctx) => ({ contenido: [{ tipo: "texto", texto: `marcado:${JSON.stringify(ctx)}` }] });
    h[1].ejecutar = async () => {
      throw new Error("secreto-rojo");
    };
    const [, detalle, ejecutor] = envolverProgresivo(h);
    const respuesta = await ejecutor.ejecutar({ nombre: "tareas_listar", argumentos: { modo: "rapido" } }, { trazo: "portal" });
    expect(respuesta.contenido[0].texto).toContain("portal");
    const ficha = JSON.parse((await detalle.ejecutar({ nombre: "tareas_listar" }, undefined)).contenido[0].texto) as { nombre: string; descripcion: string; esquema: unknown };
    expect(ficha.nombre).toBe("tareas_listar");
    expect(ficha.descripcion).toBe("Lista todas las tareas del sistema");
    const fallo = await ejecutor.ejecutar({ nombre: "tema2_casa" }, undefined);
    expect(fallo.esError).toBe(true);
    expect(fallo.contenido[0].texto).toContain("La herramienta falló.");
    expect(fallo.contenido[0].texto).not.toContain("secreto-rojo");
    for (const nombre of [...METAHERRAMIENTAS, "no_existe"]) {
      const res = await ejecutor.ejecutar({ nombre, argumentos: {} }, undefined);
      expect(res.esError).toBe(true);
      expect(res.contenido[0].texto).toContain("Herramienta desconocida o no permitida");
    }
  });
});
