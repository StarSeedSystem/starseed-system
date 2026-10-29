import { describe, it, expect } from "vitest";
import { HERRAMIENTAS_MCP, variaciones_buscar, type FichaHerramientaMcp } from "../herramientas";
import type { FilaVariacion, Listado, OrdenVariaciones } from "@/lib/variaciones/datos";

describe("herramientas MCP exports", () => {
  it("exports 10 herramientas y trae variaciones_buscar", () => {
    expect(HERRAMIENTAS_MCP).toHaveLength(10);
    expect(HERRAMIENTAS_MCP.some((h) => h.nombre === "variaciones_buscar")).toBe(true);
  });
});

describe("variaciones_buscar · cableado en HERRAMIENTAS_MCP", () => {
  const ficha = variaciones_buscar as FichaHerramientaMcp;
  const fila: FilaVariacion = {
    id: "11111111-1111-1111-1111-111111111111", clave: "widget:clima", familia: "widget", tipo: "variacion",
    titulo: "Un tema", descripcion: null, payload: {}, version: null, de_variacion: null, licencia: "CC-BY",
    enlace_externo: null, etiquetas: [], tema: null, autor: "prueba", publicado_en: "2026-10-29T00:00:00Z",
    usos: 7, valoracion_media: 4.5, valoraciones: 2, updated_at: "2026-10-29T00:00:00Z",
  };
  const listas: Array<{ clave: string; opciones?: { buscar?: string; orden?: OrdenVariaciones } }> = [];

  /** Capa de datos falsa, como la que llega en el contexto del servidor. */
  function contextoCon(lista: Partial<Listado>) {
    return {
      listarVariaciones: async (clave: string, opciones?: { buscar?: string; orden?: OrdenVariaciones }) => {
        listas.push({ clave, opciones });
        return { disponible: true, total: 1, pagina: 1, porPagina: 24, variaciones: [] as FilaVariacion[], ...lista } as Listado;
      },
    };
  }

  it("sin capa de datos en el contexto responde con indisponibilidad", async () => {
    const r = await ficha.ejecutar({ clave: "widget:clima" });
    expect(r.esError).toBe(true);
    expect(r.contenido[0].texto).toContain("no están disponibles");
  });

  it("con la capa en el contexto llama a listarVariaciones y presenta el resultado", async () => {
    listas.length = 0;
    const r = await ficha.ejecutar(
      { clave: "widget:clima", buscar: "tema", orden: "populares" },
      contextoCon({ variaciones: [fila] }),
    );
    expect(listas).toEqual([{ clave: "widget:clima", opciones: { buscar: "tema", orden: "populares" } }]);
    expect(r.esError).toBeFalsy();
    expect(r.contenido[0].texto).toContain("widget:clima: 1 publicadas");
    expect(r.contenido[1].texto).toContain("Un tema");
  });
});
