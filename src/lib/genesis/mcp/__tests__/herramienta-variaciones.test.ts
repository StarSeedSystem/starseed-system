// Pruebas de la herramienta MCP «variaciones_buscar» (Ola 1019V, tarea Y).
// Solo funciones puras: la capa de datos se inyecta como registro contable, sin red.
// NOTA: La implementación (herramienta-variaciones.ts) no existe en main actual.
// Está en la rama nube-ola/40946608828/ola/VPU1019Y. Estos tests fallarán hasta que se integre.
import { describe, it, expect } from "vitest";
import {
  crearHerramientaVariaciones,
  lineasDeListado,
  ORDENES_VARIACIONES,
  type ListarVariaciones,
} from "../herramienta-variaciones";
import type { Listado, OpcionesListar } from "../../../variaciones/datos";

/** Variación de ejemplo, con las columnas de la fila pública (nunca lleva el payload a la salida). */
const fila = (twd: Partial<Listado["variaciones"][number]> = {}) => ({
  id: "f1",
  clave: "widget:clima",
  familia: "widget",
  tipo: "variacion" as const,
  titulo: "Cristal azul",
  descripcion: null,
  payload: { secreto: "nunca sale" },
  version: null,
  de_variacion: null,
  licencia: "MIT",
  enlace_externo: null,
  etiquetas: ["cristal", "azul"],
  tema: null,
  autor: "ana",
  publicado_en: "2026-10-29T10:00:00Z",
  usos: 3,
  valoracion_media: 4.25,
  valoraciones: 2,
  updated_at: "2026-10-29T10:00:00Z",
  ...twd,
});

// Listado base: disponible, vacío y primera página.
const listado = (parcial: Partial<Listado> = {}): Listado =>
  ({ disponible: true, variaciones: [], total: 0, pagina: 1, porPagina: 24, ...parcial });

/** Registro contable: guarda las llamadas (clave y opciones) y devuelve lo fijado o lanza. */
const registroListar = (devuelto: Listado = listado(), lanza = false) => {
  const llamadas: Array<{ clave: string; opciones: OpcionesListar }> = [];
  const listar: ListarVariaciones = async (clave, opciones = {}) => {
    llamadas.push({ clave, opciones });
    if (lanza) throw new Error("sin conexión");
    return devuelto;
  };
  return { listar, llamadas };
};

describe("lineasDeListado", () => {
  it("encabeza con la clave y el total, y una línea por variación sin el payload", () => {
    const lineas = lineasDeListado("widget:clima", listado({ variaciones: [fila()], total: 2 }));
    expect(lineas[0]).toBe("Variaciones públicas de «widget:clima» · 2 en total");
    expect(lineas[1]).toContain("Cristal azul");
    expect(lineas[1]).toContain("MIT");
    expect(lineas.join("\n")).not.toContain("secreto");
    expect(lineas).toHaveLength(2);
  });

  it("enseña el aviso si la base devolvió error y el texto de vacío si no hay variaciones", () => {
    const conAviso = lineasDeListado("widget:clima", listado({ error: "Clave de elemento no válida" }));
    expect(conAviso).toEqual(["Variaciones públicas de «widget:clima» · 0 en total", "Aviso: Clave de elemento no válida"]);
    expect(lineasDeListado("widget:clima", listado())).toEqual([
      "Variaciones públicas de «widget:clima» · 0 en total",
      "Sin variaciones publicadas todavía para esta clave.",
    ]);
  });

  it("marca lo no disponible y añade valoración y etiquetas solo cuando existen", () => {
    const lineas = lineasDeListado("tema:x", listado({ disponible: false }));
    expect(lineas[1]).toContain("no están disponibles");
    expect(lineasDeListado("tema:x", listado({ variaciones: [fila({ valoraciones: 0, etiquetas: [] })] }))[1]).toBe(
      "- Cristal azul — variacion · MIT",
    );
  });
});

describe("crearHerramientaVariaciones", () => {
  const ficha = crearHerramientaVariaciones(async (_clave, opciones = {}) => {
    if (opciones.buscar === "rejilla") {
      return listado({ total: 1, variaciones: [fila({ titulo: "Grano ámbar", etiquetas: [] })] });
    }
    return listado();
  });

  it("declara nombre y el esquema con clave requerida, buscar y orden", () => {
    expect(ficha.nombre).toBe("variaciones_buscar");
    const esquema = ficha.esquema as { required: string[]; properties: Record<string, unknown> };
    expect(esquema.required).toEqual(["clave"]);
    expect(Object.keys(esquema.properties).sort()).toEqual(["buscar", "clave", "orden"]);
    expect((esquema.properties.orden as { enum: string[] }).enum).toEqual([...ORDENES_VARIACIONES]);
  });

  it("pasa clave, buscar y orden a la capa inyectada y devuelve sus líneas", async () => {
    const { listar, llamadas } = registroListar(listado({ variaciones: [fila()], total: 3 }));
    const salida = await crearHerramientaVariaciones(listar).ejecutar({
      clave: "  widget:clima  ",
      buscar: "  rejilla  ",
      orden: "valoradas",
    });
    expect(llamadas).toEqual([{ clave: "widget:clima", opciones: { orden: "valoradas", buscar: "rejilla" } }]);
    expect(salida.esError).toBeUndefined();
    expect(salida.contenido).toHaveLength(2);
    expect(salida.contenido[0]).toEqual({ tipo: "texto", texto: "Variaciones públicas de «widget:clima» · 3 en total" });
  });

  it("rechaza una clave que no es canónica sin llamar a la capa inyectada", async () => {
    const { listar, llamadas } = registroListar();
    const salida = await crearHerramientaVariaciones(listar).ejecutar({ clave: "Widget Clima" });
    expect(salida.esError).toBe(true);
    expect(salida.contenido[0].texto).toContain("Clave de elemento no válida");
    expect(llamadas).toHaveLength(0);
  });

  it("rechaza un orden que no existe, también sin tocar la capa inyectada", async () => {
    const { listar, llamadas } = registroListar();
    const salida = await crearHerramientaVariaciones(listar).ejecutar({ clave: "widget:clima", orden: "monedas" });
    expect(salida.esError).toBe(true);
    expect(salida.contenido[0].texto).toContain("Orden no admitido");
    expect(llamadas).toHaveLength(0);
  });

  it("aplica «novedades» por defecto cuando no llega orden", async () => {
    const { listar, llamadas } = registroListar();
    await crearHerramientaVariaciones(listar).ejecutar({ clave: "widget:clima" });
    expect(llamadas[0].opciones).toEqual({ orden: "novedades" });
  });

  it("marca «no disponible» como error de herramienta", async () => {
    const { listar } = registroListar(listado({ disponible: false }));
    const salida = await crearHerramientaVariaciones(listar).ejecutar({ clave: "widget:clima" });
    expect(salida.esError).toBe(true);
    expect(salida.contenido.map((c) => c.texto).join(" ")).toContain("no están disponibles");
  });

  it("no lanza si la capa inyectada se cae: error explicado", async () => {
    const { listar } = registroListar(listado(), true);
    const salida = await crearHerramientaVariaciones(listar).ejecutar({ clave: "widget:clima" });
    expect(salida.esError).toBe(true);
    expect(salida.contenido[0].texto).toContain("Error al listar variaciones");
    expect(salida.contenido[0].texto).toContain("sin conexión");
  });
});