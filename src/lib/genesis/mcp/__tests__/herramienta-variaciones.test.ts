import { describe, it, expect } from "vitest";
import { crearVariacionesBuscar, ORDENES_VARIACIONES } from "../herramienta-variaciones";
import type { ListarVariaciones } from "../herramienta-variaciones";
import type { FilaVariacion, Listado, OrdenVariaciones } from "@/lib/variaciones/datos";

/** La capa de datos falsa: anota cada llamada y responde lo que diga la prueba. */
function capaFalsa(respuesta?: Partial<Listado>) {
  const llamadas: Array<{ clave: string; opciones?: { buscar?: string; orden?: OrdenVariaciones } }> = [];
  const listar: ListarVariaciones = async (clave, opciones) => {
    llamadas.push({ clave, opciones });
    return {
      disponible: true,
      variaciones: [fila()],
      total: 1,
      pagina: 1,
      porPagina: 24,
      ...respuesta,
    };
  };
  return { llamadas, herramienta: crearVariacionesBuscar(listar) };
}

/** Fila equivalente a la de la migración `os_variaciones` (variaciones-publicas.md §6). */
const fila = (extra: Partial<FilaVariacion> = {}): FilaVariacion => ({
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  clave: "widget:clima",
  familia: "widget",
  tipo: "variacion",
  titulo: "Clima cristal",
  descripcion: null,
  payload: { radio: 12 },
  version: "1.0.0",
  de_variacion: null,
  licencia: "CC-BY-SA-4.0",
  enlace_externo: null,
  etiquetas: ["cristal"],
  tema: null,
  autor: "persona-1",
  publicado_en: "2026-10-20T10:00:00Z",
  usos: 3,
  valoracion_media: 4.5,
  valoraciones: 2,
  updated_at: "2026-10-20T10:00:00Z",
  ...extra,
});

const textos = (r: { contenido: Array<{ texto: string }>; esError?: boolean }) =>
  r.contenido.map((b) => b.texto);

describe("variaciones_buscar · esquema", () => {
  it("se llama igual que en el contrato y exige la clave del elemento", () => {
    const { herramienta } = capaFalsa();
    expect(herramienta.nombre).toBe("variaciones_buscar");
    expect(herramienta.descripcion.length).toBeGreaterThan(10);
    expect(herramienta.esquema).toMatchObject({ type: "object", required: ["clave"] });
    expect(Object.keys((herramienta.esquema.properties as Record<string, unknown>)).sort())
      .toEqual(["buscar", "clave", "orden"]);
    expect(ORDENES_VARIACIONES).toContain("aurora");
    expect(ORDENES_VARIACIONES).toHaveLength(6);
  });
});

describe("variaciones_buscar · listado correcto", () => {
  it("pasa clave, buscador y orden a la capa de datos y lista cada variación en su bloque", async () => {
    const { herramienta, llamadas } = capaFalsa({
      variaciones: [fila(), fila({ titulo: "Clima de almanaque", tipo: "nota", version: null, tema: "synthwave", valoracion_media: 4 })],
      total: 2,
    });
    const r = await herramienta.ejecutar({ clave: " widget:clima ", buscar: "  cristal  ", orden: "valoradas" });
    expect(r.esError).toBeUndefined();
    expect(llamadas).toEqual([{ clave: "widget:clima", opciones: { buscar: "cristal", orden: "valoradas" } }]);
    const t = textos(r);
    expect(t[0]).toContain("Variaciones públicas de widget:clima: 2 publicadas");
    expect(t[0]).toContain("página 1 de 1");
    expect(t[0]).toContain("búsqueda: «cristal»");
    expect(t[1]).toContain("· Clima cristal · variación · v1.0.0");
    expect(t[1]).toContain("licencia: CC-BY-SA-4.0");
    expect(t[1]).toContain("valoración: 4.5 (2) · usos: 3");
    expect(t[1]).toContain("etiquetas: cristal");
    expect(t[2]).toContain("· Clima de almanaque · nota · tema: synthwave");
    expect(t[2]).not.toContain("vnull");
  });

  it("sin buscar ni orden pasa la clave sola y dice cuántas páginas hay", async () => {
    const { herramienta, llamadas } = capaFalsa({ total: 30, pagina: 2, porPagina: 24, variaciones: [] });
    const r = await herramienta.ejecutar({ clave: "tema:synthwave-horizon" });
    expect(llamadas).toEqual([{ clave: "tema:synthwave-horizon", opciones: {} }]);
    expect(textos(r)[0]).toContain("página 2 de 2");
  });

  it("con clave nueva sin variaciones lo dice, sin error", async () => {
    const { herramienta } = capaFalsa({ variaciones: [], total: 0 });
    const r = await herramienta.ejecutar({ clave: "boton:publicar" });
    expect(r.esError).toBeUndefined();
    const t = textos(r);
    expect(t[1]).toBe("Nadie ha publicado variaciones todavía para boton:publicar.");
  });
});

describe("variaciones_buscar · validación antes de llamar", () => {
  it("rechaza clave ausente, vacía o con mezcla de mayúsculas y no toca la capa de datos", async () => {
    for (const clave of [undefined, "   ", "Widget Clima", "widget"]) {
      const { herramienta, llamadas } = capaFalsa();
      const r = await herramienta.ejecutar({ clave });
      expect(r.esError).toBe(true);
      expect(textos(r)[0]).toContain("Clave de elemento no válida");
      expect(llamadas).toHaveLength(0);
    }
  });

  it("rechaza un orden que no esté en la lámina y no toca la capa de datos", async () => {
    const { herramienta, llamadas } = capaFalsa();
    const r = await herramienta.ejecutar({ clave: "widget:clima", orden: "mas_vistas" });
    expect(r.esError).toBe(true);
    expect(textos(r)[0]).toContain("Orden no válido");
    expect(textos(r)[0]).toContain("aurora, novedades");
    expect(llamadas).toHaveLength(0);
  });
});

describe("variaciones_buscar · la ventana nunca se rompe", () => {
  it("sin tabla o sin red (disponible: false) lo cuenta como error, con el motivo de la base", async () => {
    const { herramienta, llamadas } = capaFalsa({ disponible: false, variaciones: [], error: undefined });
    const r = await herramienta.ejecutar({ clave: "widget:clima" });
    expect(r.esError).toBe(true);
    expect(textos(r)[0]).toContain("aún no están disponibles");
    expect(llamadas).toHaveLength(1);
  });

  it("propaga el error exacto de la capa de datos", async () => {
    const { herramienta } = capaFalsa({ disponible: false, error: "Red: fetch failed", variaciones: [], total: 0 });
    const r = await herramienta.ejecutar({ clave: "widget:clima" });
    expect(r.esError).toBe(true);
    expect(textos(r)[0]).toContain("Red: fetch failed");
  });
});
