// Prueba de src/lib/variaciones/claves-ajustes.ts y del componente
// <ConClave> — módulos puros, sin red ni disco. El entorno `node` no tiene
// DOM: el componente se comprueba con renderToStaticMarkup, que pide solo el
// HTML que pintará (nada se monta en un documento).
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { aKebab, claveDeAjuste, clavesDeAjustes, type EntradaAjusteId } from "./claves-ajustes";
import { leerClave } from "./clave-elemento";
import { ConClave } from "@/components/variaciones/con-clave";

describe("aKebab", () => {
  it("normaliza camelCase y subrayados a kebab-case, y deja intacto un id ya kebab", () => {
    expect(aKebab("displacementScale")).toBe("displacement-scale");
    expect(aKebab("fontMain")).toBe("font-main");
    expect(aKebab("STITCH_PROMPT")).toBe("stitch-prompt");
    expect(aKebab("tema-apariencia")).toBe("tema-apariencia");
    expect(aKebab("apariencia.radio")).toBe("apariencia.radio");
  });
});

describe("claveDeAjuste", () => {
  it("devuelve la clave `ajuste:` canónica de un id del índice", () => {
    expect(claveDeAjuste("fondo")).toBe("ajuste:fondo");
    expect(claveDeAjuste("tema-apariencia")).toBe("ajuste:tema-apariencia");
    expect(claveDeAjuste("displacementScale")).toBe("ajuste:displacement-scale");
    expect(claveDeAjuste("buttonStyle")).toBe("ajuste:button-style");
  });

  it("devuelve null para un id vacío o con espacios y símbolos fuera del formato", () => {
    expect(claveDeAjuste("")).toBeNull();
    expect(claveDeAjuste(" ")).toBeNull();
    expect(claveDeAjuste("tema apariencia")).toBeNull();
    expect(claveDeAjuste("fondo#vidrio")).toBeNull();
    expect(claveDeAjuste(":clima")).toBeNull();
  });
});

describe("clavesDeAjustes", () => {
  /** Muestras con la forma mínima de los índices reales: `{ id }`. */
  const BUSQUEDA: EntradaAjusteId[] = [{ id: "tema-apariencia" }, { id: "fondo" }, { id: "tipografia" }];
  const LIENZO: EntradaAjusteId[] = [
    { id: "displacementScale" }, { id: "primary-color" }, { id: "fontMain" },
  ];

  it("genera las claves de los dos índices: buscador primero, lienzo después", () => {
    expect(clavesDeAjustes(BUSQUEDA, LIENZO)).toEqual([
      "ajuste:tema-apariencia", "ajuste:fondo", "ajuste:tipografia",
      "ajuste:displacement-scale", "ajuste:primary-color", "ajuste:font-main",
    ]);
  });

  it("deduplica cuando el mismo ajuste vive en los dos índices", () => {
    expect(clavesDeAjustes([{ id: "fondo" }], [{ id: "fondo" }])).toEqual(["ajuste:fondo"]);
  });

  it("salta entradas sin id o con un id sin clave, sin inventar nada", () => {
    expect(clavesDeAjustes([{ id: "" }, { id: "tema apariencia" }, { id: "escritorios" }], [])).toEqual([
      "ajuste:escritorios",
    ]);
    expect(clavesDeAjustes([], [])).toEqual([]);
  });

  it("no borra ni reordena los índices que le pasan", () => {
    const lienzo = [...LIENZO];
    clavesDeAjustes(BUSQUEDA, lienzo);
    expect(lienzo).toEqual(LIENZO);
    expect(BUSQUEDA).toHaveLength(3);
  });
});

describe("<ConClave> y los índices REALES de Ajustes", () => {
  it("genera claves canónicas y sin repetidos con los índices de verdad", async () => {
    // Los índices reales llegan por import dinámico: arrays en memoria, sin
    // red ni disco; el componente del buscador no se ejecuta, solo se lee.
    const { SETTINGS_SEARCH_INDEX } = await import("@/components/settings/settings-search");
    const { SETTINGS_INDEX } = await import("@/components/design-canvas/settings-index");
    const claves = clavesDeAjustes(SETTINGS_SEARCH_INDEX, SETTINGS_INDEX);
    expect(claves.length).toBeGreaterThanOrEqual(SETTINGS_INDEX.length);
    expect(claves.every((c) => leerClave(c) !== null)).toBe(true);
    expect(new Set(claves).size).toBe(claves.length);
    expect(claves).toContain("ajuste:accesibilidad");
    expect(claves).toContain("ajuste:fondo");
    expect(claves).toContain("ajuste:tipografia");
  });

  function htmlDe(clave?: string | null, extra?: { className?: string; children?: string }) {
    return renderToStaticMarkup(createElement(ConClave, { clave, ...extra }));
  }

  it("escribe data-ss-elemento con una clave canónica", () => {
    expect(htmlDe("ajuste:fondo")).toContain('data-ss-elemento="ajuste:fondo"');
    expect(htmlDe("widget:clima#panel")).toContain('data-ss-elemento="widget:clima#panel"');
  });

  it("con clave ausente, vacía o inválida pinta el bloque sin atributo", () => {
    for (const clave of [null, undefined, "", "widgetclima", "widget:cl ima"]) {
      const html = htmlDe(clave);
      expect(html).not.toContain("data-ss-elemento");
      expect(html).toMatch(/^<div/);
    }
  });

  it("renderiza el contenido y solo las clases que se piden", () => {
    expect(htmlDe("ajuste:tema", { children: "Tema" })).toContain("Tema");
    expect(htmlDe("ajuste:tema", { className: "my-2" })).toContain("class=\"my-2\"");
    expect(htmlDe("ajuste:tema")).not.toContain("class=");
  });
});
