import { describe, expect, it } from "vitest";
import type { AdaptadorFamilia } from "@/lib/variaciones/familias";
import {
  documentoAislado,
  enlaceSeguro,
  esCodigo,
  siguientePaso,
  vistaPreviaDe,
} from "../tarjeta-variacion";

// Pruebas PURAS de la tarjeta de variación (Ola 1019V · contrato §4): entrada → salida,
// sin red, sin disco, sin DOM y sin montar el componente (SaveToLibrary no se toca).

const adaptador = (vistaPrevia?: (payload: unknown) => unknown): AdaptadorFamilia<unknown> => ({
  familia: "widget",
  nombre: "Widget de prueba",
  capturar: () => null,
  validar: (payload) => ({ ok: true, payload }),
  aplicar: () => ({ deshacer: () => {} }),
  ...(vistaPrevia ? { vistaPrevia } : {}),
});

describe("siguientePaso", () => {
  it("el código siempre pide confirmación, en cualquier modo y acción", () => {
    for (const modo of ["inactiva", "probando", "aplicada"] as const) {
      for (const accion of ["probar", "aplicar"] as const) {
        expect(siguientePaso(modo, accion, true)).toEqual({ tipo: "confirmar" });
      }
    }
  });

  it("probar aplica en vivo desde inactiva y vuelve a pulsar deshace", () => {
    expect(siguientePaso("inactiva", "probar", false)).toEqual({ tipo: "aplicar", modo: "probando" });
    expect(siguientePaso("probando", "probar", false)).toEqual({ tipo: "deshacer" });
    expect(siguientePaso("aplicada", "probar", false)).toEqual({ tipo: "deshacer" });
  });

  it("aplicar deja la variación aplicada, promueve una prueba y deshace al repetir", () => {
    expect(siguientePaso("inactiva", "aplicar", false)).toEqual({ tipo: "aplicar", modo: "aplicada" });
    expect(siguientePaso("probando", "aplicar", false)).toEqual({ tipo: "promover" });
    expect(siguientePaso("aplicada", "aplicar", false)).toEqual({ tipo: "deshacer" });
  });
});

describe("enlaceSeguro", () => {
  it("solo deja pasar https sin espacios", () => {
    expect(enlaceSeguro("https://github.com/a/b")).toBe("https://github.com/a/b");
    expect(enlaceSeguro("http://inseguro.test")).toBeNull();
    expect(enlaceSeguro("javascript:alert(1)")).toBeNull();
    expect(enlaceSeguro("data:text/html,<b>x</b>")).toBeNull();
    expect(enlaceSeguro("https://con espacio.test")).toBeNull();
    expect(enlaceSeguro(undefined)).toBeNull();
    expect(enlaceSeguro(null)).toBeNull();
  });
});

describe("vistaPreviaDe", () => {
  it("usa la vista previa del adaptador cuando existe", () => {
    const texto = vistaPreviaDe(adaptador((p) => ({ resumen: "cristal", payload: p })), { blur: 20 });
    expect(texto).toContain('"resumen": "cristal"');
    expect(texto).toContain('"blur": 20');
  });

  it("sin adaptador o sin vista previa, enseña el payload tal cual", () => {
    expect(vistaPreviaDe(null, { radio: 24 })).toBe('{\n  "radio": 24\n}');
    expect(vistaPreviaDe(adaptador(), { radio: 24 })).toBe('{\n  "radio": 24\n}');
    expect(vistaPreviaDe(null, undefined)).toBe("—");
  });

  it("si la vista previa lanza, degrada con un aviso honesto", () => {
    const roto = adaptador(() => {
      throw new Error("sin datos");
    });
    expect(vistaPreviaDe(roto, {})).toBe("La vista previa de esta familia no está disponible.");
  });
});

describe("esCodigo", () => {
  it("marca código por payload html y por familia átomo o herramienta", () => {
    expect(esCodigo({ html: "<b>hola</b>" }, "widget")).toBe(true);
    expect(esCodigo({ script: "alert(1)" }, "tema")).toBe(true);
    expect(esCodigo({ color: "#fff" }, "atomo")).toBe(true);
    expect(esCodigo({ color: "#fff" }, "herramienta")).toBe(true);
  });

  it("no marca como código un payload visual normal", () => {
    expect(esCodigo({ color: "primary", radio: 24 }, "widget")).toBe(false);
    expect(esCodigo({ fondo: "aurora" }, "tema")).toBe(false);
  });
});

describe("documentoAislado", () => {
  it("envuelve html y objetos con clave html en un documento completo", () => {
    const doc = documentoAislado({ html: "<p>hola</p>" });
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain("<p>hola</p>");
    expect(doc).toContain("</body></html>");
  });

  it("escapa el JSON de un payload normal para que no se interprete como marcado", () => {
    const doc = documentoAislado({ etiqueta: "<script>alert(1)</script>" });
    expect(doc).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(doc).not.toContain("<script>alert(1)</script>");
  });

  it("no concede same-origin: el aislamiento lo pone el iframe", () => {
    expect(documentoAislado("<b>x</b>")).not.toContain("allow-same-origin");
  });
});
