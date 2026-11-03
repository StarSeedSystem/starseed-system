import { describe, it, expect } from "vitest";
import { HERRAMIENTAS_MCP } from "../herramientas";
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

function fichaVariaciones() {
  const herramienta = HERRAMIENTAS_MCP.find((h) => h.nombre === "variaciones_buscar");
  if (!herramienta) throw new Error("falta variaciones_buscar en el registro MCP");
  return herramienta;
}

describe("herramientas MCP exports", () => {
  it("exports 10 herramientas e incluye variaciones_buscar", () => {
    expect(HERRAMIENTAS_MCP).toHaveLength(10);
    expect(HERRAMIENTAS_MCP.some((h) => h.nombre === "variaciones_buscar")).toBe(true);
  });
});

describe("variaciones_buscar en el registro MCP", () => {
  it("sin capa de datos en el contexto responde con indisponibilidad", async () => {
    const r = await fichaVariaciones().ejecutar({ clave: "widget:clima" });
    expect(r.esError).toBe(true);
    expect(r.contenido[0].texto).toContain("falta la capa de datos");
  });

  it("con la capa en el contexto llama a listarVariaciones y presenta el resultado", async () => {
    const llamadas: Array<{ clave: string; opciones: OpcionesListar | undefined }> = [];
    const listar = async (clave: string, opciones?: OpcionesListar) => {
      llamadas.push({ clave, opciones });
      return listado({
        variaciones: [fila(), fila({ titulo: "Clima de almanaque", tipo: "nota", version: null, tema: "synthwave", valoracion_media: 4 })],
        total: 2,
      });
    };
    const r = await fichaVariaciones().ejecutar(
      { clave: "widget:clima", buscar: "tema", orden: "populares" },
      { listarVariaciones: listar },
    );
    expect(llamadas).toEqual([{ clave: "widget:clima", opciones: { buscar: "tema", orden: "populares" } }]);
    expect(r.esError).toBeFalsy();
    expect(r.contenido[0].texto).toContain("Variaciones públicas de «widget:clima»");
    expect(r.contenido.some((b) => b.texto.includes("Clima cristal"))).toBe(true);
    expect(r.contenido.some((b) => b.texto.includes("Clima de almanaque"))).toBe(true);
  });
});