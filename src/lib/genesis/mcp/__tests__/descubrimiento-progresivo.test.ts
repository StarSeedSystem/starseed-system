import { describe, it, expect } from "vitest";
import type { HerramientaMcp } from "../protocolo";
import {
  tokenizar,
  crearIndiceBm25,
  envolverProgresivo,
  METAHERRAMIENTAS,
  UMBRAL_PROGRESIVO,
} from "../descubrimiento-progresivo";

const crearHerramienta = (nombre: string, desc = "d", esquema: Record<string, unknown> = {}): HerramientaMcp => ({
  nombre,
  descripcion: desc,
  esquema: esquema,
  ejecutar: async () => ({ contenido: [{ tipo: "texto", texto: "ok" }] }),
});

describe("tokenizar", () => {
  it("separa camelCase antes de minúsculas", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
  });
  it("separa guion bajo", () => {
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
  });
  it("quita tildes (NFD)", () => {
    expect(tokenizar("acción_rápida")).toEqual(["accion", "rapida"]);
  });
  it("descarta palabras vacías", () => {
    expect(tokenizar("el y la de los un una en a of the to for and")).toEqual([]);
  });
});

describe("BM25", () => {
  const docs = Array.from({ length: 20 }, (_, i) => ({
    id: `h${i}`,
    texto: i === 0 ? "tareas_listar listar tareas" : `función ${i} listar tareas acciones`,
  }));
  it("consulta vacía devuelve []", () => {
    expect(crearIndiceBm25(docs).buscar("", 5)).toEqual([]);
  });
  it("'listar tareas' devuelve tareas_listar primero", () => {
    expect(crearIndiceBm25(docs).buscar("listar tareas", 5)[0].id).toBe("h0");
  });
  it("empate estable por id ascendente", () => {
    const res = crearIndiceBm25(docs).buscar("función", 5);
    expect(res.map((r) => r.id)).toEqual([...res.map((r) => r.id)].sort());
  });
});

describe("envolverProgresivo", () => {
  it("≤ umbral devuelve la misma lista", () => {
    const res = envolverProgresivo([crearHerramienta("a")]);
    expect(res).toHaveLength(1);
  });
  it("> umbral devuelve las tres metaherramientas", () => {
    const res = envolverProgresivo(Array.from({ length: 15 }, (_, i) => crearHerramienta(`h${i}`)), { umbral: 0 });
    expect(res.map((h) => h.nombre)).toEqual(Array.from(METAHERRAMIENTAS));
  });
  it("perfil pequeño: ≤3 resultados, ≤80 chars, sin esquema", async () => {
    const envuelto = envolverProgresivo(Array.from({ length: 20 }, (_, i) => crearHerramienta(`h${i}`, `Desc ${i}`)), { umbral: 0, medio: "modelo-pequeno" });
    const meta = envuelto.find((h) => h.nombre === "descubrir_herramientas")!;
    const r = await meta.ejecutar({ consulta: "desc" }, undefined);
    const datos = JSON.parse(r.contenido[0].texto);
    expect(datos.resultados.length).toBeLessThanOrEqual(3);
    expect(datos.resultados[0].descripcion.length).toBeLessThanOrEqual(80);
    expect(datos.resultados[0].esquema).toBeUndefined();
  });
  it("perfil grande incluye esquema", async () => {
    const envuelto = envolverProgresivo(Array.from({ length: 20 }, (_, i) => crearHerramienta(`h${i}`, "d", { type: "object", properties: { nombre: { type: "string" } } })), { umbral: 0, medio: "modelo-grande" });
    const meta = envuelto.find((h) => h.nombre === "descubrir_herramientas")!;
    const r = await meta.ejecutar({ consulta: "nombre" }, undefined);
    const datos = JSON.parse(r.contenido[0].texto);
    expect(datos.resultados[0].esquema).toBeDefined();
  });
  it("permitida oculta del descubrimiento y ejecución", async () => {
    const envuelto = envolverProgresivo(
      [crearHerramienta("visible"), crearHerramienta("oculto")],
      { permitida: (h) => h.nombre === "visible", umbral: 0 },
    );
    // con umbral 0 y solo 1 visible, debe devolver metaherramientas
    expect(envuelto).toHaveLength(3);
    const metaDesc = envuelto.find((h) => h.nombre === "descubrir_herramientas")!;
    const datos = JSON.parse((await metaDesc.ejecutar({ consulta: "visible" })).contenido[0].texto);
    expect(datos.resultados).toHaveLength(1);
    expect(datos.resultados[0].nombre).toBe("visible");
  });
  it("ejecutar rechaza metaherramientas y desconocidas", async () => {
    const envuelto = envolverProgresivo([crearHerramienta("real")], { umbral: 0 });
    const metaEj = envuelto.find((h) => h.nombre === "ejecutar_herramienta")!;
    expect((await metaEj.ejecutar({ nombre: "descubrir_herramientas" })).esError).toBe(true);
    expect((await metaEj.ejecutar({ nombre: "inexistente" })).esError).toBe(true);
  });
  it("el ctx llega a la herramienta", async () => {
    const envuelto = envolverProgresivo([
      { ...crearHerramienta("captura"), ejecutar: async (_a, ctx?: unknown) => ({ contenido: [{ tipo: "texto", texto: JSON.stringify(ctx) }] }) },
    ], { umbral: 0 });
    const metaEj = envuelto.find((h) => h.nombre === "ejecutar_herramienta")!;
    const r = await metaEj.ejecutar({ nombre: "captura" }, { valor: 42 });
    expect(JSON.parse(r.contenido[0].texto)).toEqual({ valor: 42 });
  });
  it("una herramienta que lanza no expone detalles", async () => {
    const envuelto = envolverProgresivo([
      { ...crearHerramienta("falla"), ejecutar: async () => { throw new Error("detalles internos sensibles"); } },
    ], { umbral: 0 });
    const metaEj = envuelto.find((h) => h.nombre === "ejecutar_herramienta")!;
    const r = await metaEj.ejecutar({ nombre: "falla" });
    expect(r.esError).toBe(true);
    expect(r.contenido[0].texto).toBe("La herramienta falló.");
  });
});
