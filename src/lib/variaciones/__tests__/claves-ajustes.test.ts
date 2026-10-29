// Prueba de src/lib/variaciones/claves-ajustes.ts — módulo puro, sin red ni
// disco. Los ids representativos salen de los índices reales: del buscador de
// Ajustes (`SETTINGS_SEARCH_INDEX`) y del lienzo de diseño (`SETTINGS_INDEX`),
// que traen mezcla de kebab-case y camelCase.
import { describe, it, expect } from "vitest";

import {
  FAMILIA_AJUSTES,
  normalizarIdAjuste,
  claveDeAjuste,
  clavesDeAjustes,
  type EntradaIndiceAjustes,
} from "../claves-ajustes";

describe("normalizarIdAjuste", () => {
  it("conserva los ids del buscador de Ajustes, que ya son kebab-case", () => {
    expect(normalizarIdAjuste("tema-apariencia")).toBe("tema-apariencia");
    expect(normalizarIdAjuste("fondo")).toBe("fondo");
    expect(normalizarIdAjuste("interfaz-widgets")).toBe("interfaz-widgets");
    expect(normalizarIdAjuste("apariencia.radio")).toBe("apariencia.radio");
  });

  it("lleva los camelCase del lienzo de diseño a kebab-case", () => {
    expect(normalizarIdAjuste("displacementScale")).toBe("displacement-scale");
    expect(normalizarIdAjuste("blurAmount")).toBe("blur-amount");
    expect(normalizarIdAjuste("baseSize")).toBe("base-size");
    expect(normalizarIdAjuste("glowIntensity")).toBe("glow-intensity");
  });

  it("separa con guion los guiones bajos, los espacios y los separadores seguidos", () => {
    expect(normalizarIdAjuste("stitch-prompt")).toBe("stitch-prompt");
    expect(normalizarIdAjuste("voz_modo")).toBe("voz-modo");
    expect(normalizarIdAjuste("voz modo")).toBe("voz-modo");
    expect(normalizarIdAjuste("--fondo--")).toBe("fondo");
  });

  it("devuelve null para un id vacío o no canónico", () => {
    expect(normalizarIdAjuste("")).toBeNull();
    expect(normalizarIdAjuste("   ")).toBeNull();
    expect(normalizarIdAjuste("tema!")).toBeNull();
    expect(normalizarIdAjuste("café")).toBeNull();
  });
});

describe("claveDeAjuste", () => {
  it("genera la clave `ajuste:<id>` del buscador y del lienzo", () => {
    expect(claveDeAjuste("tema-apariencia")).toBe("ajuste:tema-apariencia");
    expect(claveDeAjuste("displacementScale")).toBe("ajuste:displacement-scale");
  });

  it("admite la parte opcional, como en el contrato («ajuste:apariencia.radio»)", () => {
    expect(claveDeAjuste("tema-apariencia", "cristal")).toBe("ajuste:tema-apariencia#cristal");
  });

  it("rechaza un id o una parte que no sea canónica", () => {
    expect(claveDeAjuste("")).toBeNull();
    expect(claveDeAjuste("tema!")).toBeNull();
    expect(claveDeAjuste("tema", "cl ima")).toBeNull();
  });
});

describe("clavesDeAjustes", () => {
  // Muestras reales de los dos índices (buscar en settings-search.tsx y en settings-index.ts).
  const busqueda: EntradaIndiceAjustes[] = [
    { id: "tema-apariencia" },
    { id: "fondo" },
    { id: "tipografia" },
    { id: "interfaz-widgets" },
  ];
  const lienzo: EntradaIndiceAjustes[] = [
    { id: "displacementScale" },
    { id: "chromaticAberration" },
    { id: "buttonStyle" },
    { id: "baseSize" },
  ];

  it("genera las claves de los dos índices, en orden de llegada", () => {
    expect(clavesDeAjustes(busqueda, lienzo)).toEqual([
      "ajuste:tema-apariencia",
      "ajuste:fondo",
      "ajuste:tipografia",
      "ajuste:interfaz-widgets",
      "ajuste:displacement-scale",
      "ajuste:chromatic-aberration",
      "ajuste:button-style",
      "ajuste:base-size",
    ]);
  });

  it("deduplica cuando los dos índices nombran el mismo ajuste", () => {
    expect(clavesDeAjustes([{ id: "fondo" }], [{ id: "fondo" }, { id: "displacementScale" }])).toEqual([
      "ajuste:fondo",
      "ajuste:displacement-scale",
    ]);
    expect(clavesDeAjustes([{ id: "displacementScale" }], [{ id: "displacement-scale" }])).toEqual([
      "ajuste:displacement-scale",
    ]);
  });

  it("salta las entradas sin id válido y las listas vacías", () => {
    expect(clavesDeAjustes([{ id: "" }, { id: "fondo" }], [{ id: "tema!" }])).toEqual(["ajuste:fondo"]);
    expect(clavesDeAjustes([], [])).toEqual([]);
  });

  it("nunca lleva la familia distinta de «ajuste»", () => {
    for (const clave of clavesDeAjustes(busqueda, lienzo)) {
      expect(clave.startsWith(`${FAMILIA_AJUSTES}:`)).toBe(true);
    }
  });
});
