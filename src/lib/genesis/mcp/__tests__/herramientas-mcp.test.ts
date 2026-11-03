import { describe, it, expect } from "vitest";
import { HERRAMIENTAS_MCP, type FichaHerramientaMcp } from "../herramientas";
import type { FilaVariacion, Listado, OpcionesListar } from "../../../variaciones/datos";

const fichaVariaciones = HERRAMIENTAS_MCP.find((h) => h.nombre === "variaciones_buscar");

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

describe("herramientas MCP exports", () => {
  it("exports 10 herramientas e incluye variaciones_buscar", () => {
    expect(HERRAMIENTAS_MCP).toHaveLength(10);
    expect(HERRAMIENTAS_MCP.some((h) => h.nombre === "variaciones_buscar")).toBe(true);
  });
});

describe("variaciones_buscar · cableado en el registro MCP", () => {
  it("sin capa de datos en el contexto responde con indisponibilidad", async () => {
    const ficha = fichaVariaciones as FichaHerramientaMcp;
    const r = await ficha.ejecutar({ clave: "widget:clima" });
    expect(r.esError).toBe(true);
    expect(texto(r)).toContain("falta la capa de datos inyectada");
  });

  it("con la capa en el contexto llama a listarVariaciones y presenta el resultado", async () => {
    const ficha = fichaVariaciones as FichaHerramientaMcp;
    const llamadas: Array<{ clave: string; opciones?: OpcionesListar }> = [];
    const listarVariaciones = async (clave: string, opciones?: OpcionesListar) => {
      llamadas.push({ clave, opciones });
      return listado();
    };
    const r = await ficha.ejecutar(
      { clave: " widget:clima ", buscar: "  cristal  ", orden: "valoradas" },
      { listarVariaciones },
    );
    expect(r.esError).toBeFalsy();
    expect(llamadas).toEqual([{ clave: "widget:clima", opciones: { buscar: "cristal", orden: "valoradas" } }]);
    const t = texto(r);
    expect(t).toContain("Variaciones públicas de «widget:clima»");
    expect(t).toContain("búsqueda: «cristal»");
    expect(t).toContain("orden: valoradas");
    expect(t).toContain("«Clima cristal»");
    expect(t).toContain("Total: 1 · página 1 · 24 por página");
  });
});
