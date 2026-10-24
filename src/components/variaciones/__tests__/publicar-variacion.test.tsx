import { describe, it, expect } from "vitest";
import {
  CAMPOS_VACIOS,
  LICENCIAS_VARIACION,
  construirNueva,
  etiquetasDesdeTexto,
  filaNotaVariacion,
  motivosDePublicacion,
  recursoDeVariacion,
  type CamposVariacion,
} from "@/lib/variaciones/publicar-campos";

// Pruebas PURAS del núcleo de «Publicar mi variación» (Ola 1019V · tarea Q,
// contrato architecture/variaciones-publicas.md §4-§6): entrada → salida,
// sin red, sin disco, sin DOM y sin cliente real de Supabase.

const CAMPOS: CamposVariacion = {
  ...CAMPOS_VACIOS,
  titulo: "Cristal más alto",
  descripcion: "Sube el desenfoque del cristal de los widgets.",
  etiquetasTexto: "cristal, widget, clima",
  tema: "Verdant Earth",
  licencia: "MIT",
};

describe("etiquetasDesdeTexto", () => {
  it("separa por comas y punto y coma, normaliza y quita repetidas", () => {
    expect(etiquetasDesdeTexto("Cristal, widget; CRISTAL,  clima Oscuro")).toEqual(
      ["cristal", "widget", "clima-oscuro"],
    );
  });
  it("corta al máximo de 8 etiquetas y descarta vacías", () => {
    expect(etiquetasDesdeTexto(",,a,b,c,d,e,f,g,h,i,j")).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(etiquetasDesdeTexto("  ")).toEqual([]);
  });
});

describe("construirNueva", () => {
  it("mapea los campos y deja el payload capturado tal cual", () => {
    const payload = { blur: 22, radio: 24 };
    const n = construirNueva("widget:clima", CAMPOS, payload);
    expect(n).toMatchObject({
      clave: "widget:clima", titulo: "Cristal más alto", licencia: "MIT",
      descripcion: "Sube el desenfoque del cristal de los widgets.", tema: "Verdant Earth",
      etiquetas: ["cristal", "widget", "clima"], deVariacion: null,
    });
    expect(n.payload).toBe(payload);
  });
  it("los campos vacíos se ven como vacíos y la cadena de origen se respeta", () => {
    const n = construirNueva("fondo:aurora", CAMPOS_VACIOS, null);
    expect(n.descripcion).toBeUndefined();
    expect(n.tema).toBeUndefined();
    expect(n.deVariacion).toBeNull();
    const d = construirNueva("fondo:aurora", { ...CAMPOS_VACIOS, deVariacion: "abc-123" }, null);
    expect(d.deVariacion).toBe("abc-123");
  });
});

describe("motivosDePublicacion", () => {
  it("pasa con una variación completa y con un payload JSON plano", () => {
    expect(motivosDePublicacion("widget:clima", CAMPOS, { blur: 22 })).toEqual([]);
  });
  it("exige una clave de elemento válida, título y licencia", () => {
    expect(motivosDePublicacion("no es clave", CAMPOS, {})).toContainEqual(
      expect.stringContaining("no es una clave de elemento válida"),
    );
    expect(motivosDePublicacion("widget:clima", { ...CAMPOS, titulo: "    " }, {})).toContainEqual(
      expect.stringContaining("Título"),
    );
    expect(motivosDePublicacion("widget:clima", { ...CAMPOS, licencia: "" }, {})).toContainEqual(
      expect.stringContaining("Licencia"),
    );
  });
  it("nunca lleva nada privado ni un secreto en el payload", () => {
    expect(motivosDePublicacion("widget:clima", CAMPOS, { apiKey: "abcdef123456abcdef" })).toContainEqual(
      expect.stringContaining("Privacidad"),
    );
    expect(motivosDePublicacion("widget:clima", CAMPOS, { valores: "starseed.dock.items.v2" })).toContainEqual(
      expect.stringContaining("Privacidad"),
    );
  });
});

describe("recursoDeVariacion", () => {
  it("si no está publicada comparte un archivo derivado de la clave", () => {
    const r = recursoDeVariacion({ clave: "widget:clima", titulo: "Mi variación", descripcion: "Sube el cristal" });
    expect(r).toMatchObject({
      kind: "archivo", id: "widget:clima", name: "Mi variación", mime: "application/json", route: "/library",
    });
    expect(r.note).toContain("Variación de «widget:clima»");
    expect(r.note).toContain("Sube el cristal");
  });
  it("si ya está publicada el destino apunta a la publicación", () => {
    const r = recursoDeVariacion({ clave: "widget:clima", titulo: "Mi variación", id: "pub-9" });
    expect(r).toMatchObject({ kind: "publicacion", id: "pub-9", name: "Mi variación" });
    expect(r.mime).toBeUndefined();
  });
});

describe("filaNotaVariacion", () => {
  it("crea una nota pública que referencia el elemento por `references.elemento`", () => {
    const fila = filaNotaVariacion({
      clave: "ajuste:apariencia.radio", titulo: "Radio doble", descripcion: "Radios 24 en todo",
      autorId: "u-1", autorNombre: "alex", variacionId: "v-77",
    });
    expect(fila).toMatchObject({
      author_id: "u-1", author_name: "alex", type: "note",
      meta: { visibility: "public" },
      post_references: { elemento: "ajuste:apariencia.radio" },
    });
    const contenido = fila.content as Record<string, unknown>;
    expect(contenido.references).toEqual({ elemento: "ajuste:apariencia.radio", variacion: "v-77" });
  });
});

describe("licencias y estado inicial", () => {
  it("el formulario arranca con una licencia del catálogo y sin marcar la nota", () => {
    expect(LICENCIAS_VARIACION).toContain(CAMPOS_VACIOS.licencia);
    expect(CAMPOS_VACIOS.tambienPublicacion).toBe(false);
  });
});

