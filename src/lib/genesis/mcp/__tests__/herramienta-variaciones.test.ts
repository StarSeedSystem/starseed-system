import { describe, it, expect } from "vitest";
import {
  ESQUEMA_VARIACIONES_BUSCAR,
  type ListarVariaciones,
  crearHerramientaVariaciones,
  ejecutarVariacionesBuscar,
  formatearListado,
  leerArgumentosVariaciones,
  resumenVariacion,
  variaciones_buscar,
} from "../herramienta-variaciones";
import type { FilaVariacion, Listado, OpcionesListar } from "../../../variaciones/datos";

const fila = (extra: Partial<FilaVariacion> = {}): FilaVariacion => ({
  id: "0f8fad5b-d9cb-469f-a165-70867728950e", clave: "widget:clima", familia: "widget", tipo: "variacion",
  titulo: "Clima cristal", descripcion: null, payload: { radio: 12 }, version: "1.0.0", de_variacion: null,
  licencia: "CC-BY-SA-4.0", enlace_externo: null, etiquetas: ["cristal"], tema: null, autor: "persona-1",
  publicado_en: "2026-10-20T10:00:00Z", usos: 3, valoracion_media: 4.5, valoraciones: 2,
  updated_at: "2026-10-20T10:00:00Z", ...extra,
});
const listado = (extra: Partial<Listado> = {}): Listado =>
  ({ disponible: true, variaciones: [fila()], total: 1, pagina: 1, porPagina: 24, ...extra });
const texto = (r: { contenido: Array<{ texto: string }> }) => r.contenido.map((b) => b.texto).join("\n");

describe("variaciones_buscar · esquema y argumentos", () => {
  it("declara inputSchema con clave obligatoria, buscar y orden cerrado al vocabulario", () => {
    expect(variaciones_buscar.nombre).toBe("variaciones_buscar");
    expect(variaciones_buscar.permiso).toBe("variaciones:buscar");
    expect(variaciones_buscar.esquema).toBe(ESQUEMA_VARIACIONES_BUSCAR);
    expect(variaciones_buscar.inputSchema).toBe(ESQUEMA_VARIACIONES_BUSCAR);
    expect(ESQUEMA_VARIACIONES_BUSCAR.required).toEqual(["clave"]);
    expect(Object.keys(ESQUEMA_VARIACIONES_BUSCAR.properties)).toEqual(["clave", "buscar", "orden"]);
    expect(ESQUEMA_VARIACIONES_BUSCAR.properties.orden.enum).toContain("valoradas");
  });

  it("lee la clave, recorta la búsqueda y acepta solo órdenes conocidos", () => {
    expect(leerArgumentosVariaciones({ clave: " widget:clima ", buscar: "  cristal  ", orden: "valoradas" }))
      .toEqual({ ok: true, opciones: { clave: "widget:clima", buscar: "cristal", orden: "valoradas" } });
    expect(leerArgumentosVariaciones({ clave: "widget:clima", buscar: "x".repeat(200) }))
      .toMatchObject({ ok: true, opciones: { buscar: "x".repeat(80) } });
    for (const args of [{}, { clave: "Widget Clima" }, { clave: "widget:clima", orden: "caro" }]) {
      expect(leerArgumentosVariaciones(args).ok).toBe(false);
    }
  });
});

describe("variaciones_buscar · listado", () => {
  it("resume metadatos públicos y nunca filtra el payload ni secretos", () => {
    const secreto = fila({ titulo: "Clima\ncristal", payload: { apiKey: "sk-secreto", token: "abc" } });
    const linea = resumenVariacion(secreto);
    expect(linea).toContain("«Clima cristal»");
    expect(linea).toContain("variacion · v1.0.0 · CC-BY-SA-4.0 · ★ 4,5 (2) · 3 usos · de persona-1");
    expect(linea).not.toContain("sk-secreto");
    expect(linea).not.toContain("token");
    expect(resumenVariacion(fila({ titulo: "t".repeat(300) })).length).toBeLessThan(260);
  });

  it("compone cabecera, filtros, cada variación y el total; vacío y sin tabla se dicen", () => {
    const lineas = formatearListado("widget:clima", { clave: "widget:clima", buscar: "cristal", orden: "populares" },
      listado({ total: 31, pagina: 2, porPagina: 10 }));
    expect(lineas[0]).toBe("Variaciones públicas de «widget:clima»");
    expect(lineas[1]).toBe("Filtros · búsqueda: «cristal» · orden: populares");
    expect(lineas[2]).toMatch(/^1\. «Clima cristal»/);
    expect(lineas.at(-1)).toBe("Total: 31 · página 2 · 10 por página");
    expect(formatearListado("widget:clima", { clave: "widget:clima" }, listado({ variaciones: [] })))
      .toContain("Sin variaciones públicas todavía.");
    const sinTabla = formatearListado("widget:clima", { clave: "widget:clima" },
      listado({ disponible: false, variaciones: [], error: undefined }));
    expect(sinTabla[1]).toContain("todavía no están disponibles");
    expect(formatearListado("widget:clima", { clave: "widget:clima" },
      listado({ disponible: false, variaciones: [], error: "sin red" }))[1]).toContain("sin red");
  });
});

describe("variaciones_buscar · manejador", () => {
  it("llama a listarVariaciones inyectada con la clave y las opciones", async () => {
    const llamadas: Array<[string, OpcionesListar | undefined]> = [];
    const r = await ejecutarVariacionesBuscar(async (clave, op) => (llamadas.push([clave, op]), listado()),
      { clave: "widget:clima", buscar: "cristal", orden: "usadas" });
    expect(llamadas).toEqual([["widget:clima", { buscar: "cristal", orden: "usadas" }]]);
    expect(r.esError).toBeUndefined();
    expect(texto(r)).toContain("Variaciones públicas de «widget:clima»");
  });

  it("no ejecuta nada sin clave válida y convierte fallos de la base o de la red en error", async () => {
    let llamadas = 0;
    const listar = async () => (llamadas += 1, listado());
    expect(await ejecutarVariacionesBuscar(listar, { clave: "no es clave" })).toMatchObject({ esError: true });
    expect(llamadas).toBe(0);
    const sinTabla = await ejecutarVariacionesBuscar(
      async () => listado({ disponible: false, variaciones: [], error: "sin red" }), { clave: "widget:clima" });
    expect(sinTabla.esError).toBe(true);
    expect(texto(sinTabla)).toContain("sin red");
    const rota = await ejecutarVariacionesBuscar(async () => { throw new Error("fetch failed"); }, { clave: "widget:clima" });
    expect(texto(rota)).toContain("fetch failed");
    expect(rota.esError).toBe(true);
  });

  it("la fábrica recorta la clave y la búsqueda antes de llamar a la capa inyectada", async () => {
    const llamadas: Array<[string, OpcionesListar | undefined]> = [];
    const listar: ListarVariaciones = async (clave, op) => (llamadas.push([clave, op]), listado());
    await crearHerramientaVariaciones(listar).ejecutar({ clave: "  widget:clima  ", buscar: "  cristal  " });
    expect(llamadas).toEqual([["widget:clima", { buscar: "cristal" }]]);
  });

  it("si la capa inyectada lanza algo que no es un Error, avisa de sin conexión", async () => {
    const rota = await ejecutarVariacionesBuscar(async () => { throw "sin conexión"; }, { clave: "widget:clima" });
    expect(rota.esError).toBe(true);
    expect(texto(rota)).toBe("Error: Variaciones: sin conexión");
  });

  it("la ficha sin contexto avisa; con contexto o fábrica consulta la capa inyectada", async () => {
    const listar = async () => listado();
    expect((await variaciones_buscar.ejecutar({ clave: "widget:clima" })).esError).toBe(true);
    expect(texto(await variaciones_buscar.ejecutar({ clave: "widget:clima" }, { listarVariaciones: listar })))
      .toContain("Clima cristal");
    expect(texto(await crearHerramientaVariaciones(listar).ejecutar({ clave: "widget:clima" })))
      .toContain("Clima cristal");
  });
});
