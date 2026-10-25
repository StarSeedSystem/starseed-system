import { describe, it, expect } from "vitest";
import { METAHERRAMIENTAS, PERFILES_MEDIO, UMBRAL_PROGRESIVO, crearIndiceBm25, envolverProgresivo, tokenizar } from "../descubrimiento-progresivo";
import type { HerramientaMcp } from "../protocolo";

const falsa = (nombre: string, descripcion: string): HerramientaMcp => ({
  nombre, descripcion, esquema: { type: "object", properties: { id: { type: "string" } } },
  ejecutar: async () => ({ contenido: [{ tipo: "texto", texto: `ok ${nombre}` }] }),
});

const lote = (cuantas: number): HerramientaMcp[] =>
  Array.from({ length: cuantas }, (_, i) => falsa(`accion_${i}`, `Herramienta de prueba número ${i} para el índice`));
const meta = (hs: HerramientaMcp[], nombre: string): HerramientaMcp => hs.find((h) => h.nombre === nombre)!;
const textoDe = (r: { contenido: Array<{ texto: string }> }): string => r.contenido[0]!.texto;

describe("tokenizar", () => {
  it("separa camelCase y guion bajo, quita tildes, palabras vacías y de un carácter", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("Listación de Diálogo")).toEqual(["listacion", "dialogo"]);
    expect(tokenizar("the a de la el")).toEqual([]);
  });
});

describe("índice BM25", () => {
  const indice = crearIndiceBm25(
    Array.from({ length: 20 }, (_, i) =>
      i === 0
        ? { id: "tareas_listar", texto: "tareas_listar lista todas las tareas del sistema" }
        : { id: `otros_${i}`, texto: `otros_${i} asignatura de prueba número ${i}` }
    )
  );

  it("«listar tareas» devuelve tareas_listar primero; vacía y sin términos útiles → []", () => {
    expect(indice.buscar("listar tareas", 5)[0]!.id).toBe("tareas_listar");
    expect(indice.buscar("", 5)).toEqual([]);
    expect(indice.buscar("de the a", 5)).toEqual([]);
  });

  it("empate estable: orden por id ascendente", () => {
    const par = crearIndiceBm25([
      { id: "b_copa", texto: "misma descripcion igual en ambos" },
      { id: "a_copa", texto: "misma descripcion igual en ambos" },
    ]);
    expect(par.buscar("misma descripcion", 2).map((r) => r.id)).toEqual(["a_copa", "b_copa"]);
  });
});

describe("envolverProgresivo", () => {
  it("con menos o igual al umbral devuelve las mismas herramientas sin cambios", () => {
    const pocas = lote(10);
    expect(pocas.length).toBeLessThan(UMBRAL_PROGRESIVO);
    expect(envolverProgresivo(pocas)).toBe(pocas);
  });

  it("con más del umbral devuelve solo las tres metaherramientas", () => {
    expect(envolverProgresivo(lote(UMBRAL_PROGRESIVO + 1)).map((m) => m.nombre)).toEqual([...METAHERRAMIENTAS]);
  });

  type Halo = { resultados: Array<{ nombre: string; descripcion: string; esquema?: unknown }>; total?: number; sugerencia?: string };

  it("perfiles: pequeño ≤3 sin esquema; grande tope 8 con esquema; detalle entrega datos completos", async () => {
    const pequeno = JSON.parse(textoDe(await meta(envolverProgresivo(lote(15), { medio: "modelo-pequeno" }), "descubrir_herramientas").ejecutar({ consulta: "herramienta" }))) as Halo;
    expect(pequeno.resultados.length).toBe(PERFILES_MEDIO["modelo-pequeno"].maxResultados);
    expect(pequeno.total).toBe(15);
    for (const r of pequeno.resultados) {
      expect(r.descripcion.length).toBeLessThanOrEqual(80);
      expect("esquema" in r).toBe(false);
    }
    const grande = JSON.parse(textoDe(await meta(envolverProgresivo(lote(15), { medio: "modelo-grande" }), "descubrir_herramientas").ejecutar({ consulta: "herramienta", limite: 99 }))) as Halo;
    expect(grande.resultados.length).toBe(8);
    expect(grande.resultados[0]!.esquema).toEqual({ type: "object", properties: { id: { type: "string" } } });
    const datos = JSON.parse(textoDe(await meta(envolverProgresivo(lote(15)), "detalle_herramienta").ejecutar({ nombre: "accion_3" }))) as { descripcion: string };
    expect(datos.descripcion).toBe("Herramienta de prueba número 3 para el índice");
  });

  it("permitida manda antes: oculta en descubrir, detalle y ejecutar", async () => {
    const oculta = falsa("secreta_caja", "tarea secreta que debe quedar fuera");
    const metas = envolverProgresivo([...lote(15), oculta], { permitida: (h) => h.nombre !== "secreta_caja" });
    const halo = JSON.parse(textoDe(await meta(metas, "descubrir_herramientas").ejecutar({ consulta: "secreta fuera" }))) as Halo;
    expect(halo.resultados).toEqual([]);
    expect(halo.sugerencia).toBe("prueba con otras palabras");
    const textoOculto = "Herramienta desconocida o no permitida: secreta_caja";
    const rD = await meta(metas, "detalle_herramienta").ejecutar({ nombre: "secreta_caja" });
    expect(rD.esError).toBe(true);
    expect(textoDe(rD)).toBe(textoOculto);
    const rE = await meta(metas, "ejecutar_herramienta").ejecutar({ nombre: "secreta_caja" });
    expect(rE.esError).toBe(true);
    expect(textoDe(rE)).toBe(textoOculto);
  });

  it("ejecutar no llega a metaherramientas ni a desconocidas", async () => {
    const ejecutar = meta(envolverProgresivo(lote(15)), "ejecutar_herramienta");
    for (const nombre of [...METAHERRAMIENTAS, "desconocida_ayer"]) {
      const r = await ejecutar.ejecutar({ nombre });
      expect(r.esError).toBe(true);
      expect(textoDe(r)).toContain("no permitida");
    }
  });

  it("pasa el ctx a la herramienta y el fallo no filtra su mensaje", async () => {
    let ctxVisto: unknown = null;
    const Vacio = { type: "object", properties: {} };
    const eco: HerramientaMcp = {
      nombre: "eco_ctx", descripcion: "Guarda el contexto recibido y contesta eco", esquema: Vacio,
      ejecutar: async (_a, ctx) => { ctxVisto = ctx; return { contenido: [{ tipo: "texto", texto: "eco" }] }; },
    };
    const rompida: HerramientaMcp = {
      nombre: "rompida", descripcion: "Falla en ejecución sin dar razones", esquema: Vacio,
      ejecutar: async () => { throw new Error("mensaje interno que no debe filtrarse"); },
    };
    const metas = envolverProgresivo([...lote(15), eco, rompida]);
    const ejecutar = meta(metas, "ejecutar_herramienta");
    const bien = await ejecutar.ejecutar({ nombre: "eco_ctx" }, "ctx-de-prueba");
    expect(ctxVisto).toBe("ctx-de-prueba");
    expect(bien.esError).toBeUndefined();
    const mal = await ejecutar.ejecutar({ nombre: "rompida" });
    expect(mal.esError).toBe(true);
    expect(textoDe(mal)).toBe("La herramienta falló.");
  });
});
