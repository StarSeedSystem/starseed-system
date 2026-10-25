// Prueba Ola 1019V · tarea W: src/lib/variaciones/claves-ajustes.ts y las
// props puras de src/components/variaciones/con-clave.tsx. Módulos puros:
// sin red, sin disco y sin `vi.mock` — los dos índices son datos vivos del
// repo, y `globals` está en false, así que se importa todo de "vitest".
import { describe, it, expect } from "vitest";

import { clavesDeAjustes, claveDeAjuste, atributosDeAjuste } from "../claves-ajustes";
import { propsDeClave } from "@/components/variaciones/con-clave";
import { leerClave } from "../clave-elemento";
import { SETTINGS_SEARCH_INDEX } from "@/components/settings/settings-search";
import { SETTINGS_INDEX } from "@/components/design-canvas/settings-index";

const claves = clavesDeAjustes();

describe("clavesDeAjustes", () => {
  it("cubre cada entrada de los dos registros, sin claves repetidas", () => {
    const total = SETTINGS_SEARCH_INDEX.length + SETTINGS_INDEX.length;
    expect(claves.length).toBe(total);
    expect(new Set(claves.map((c) => c.clave)).size).toBe(claves.length);
    for (const entrada of [...SETTINGS_SEARCH_INDEX, ...SETTINGS_INDEX]) {
      expect(claves.some((c) => c.id === entrada.id)).toBe(true);
    }
  });

  it("emite claves `ajuste:` canónicas válidas para `leerClave`", () => {
    for (const c of claves) {
      expect(c.clave.startsWith("ajuste:")).toBe(true);
      expect(leerClave(c.clave)).toBe(c.clave);
      expect(typeof c.label === "string" && c.label.length > 0).toBe(true);
    }
  });

  it("usa el id de la fuente tal cual, en kebab-case", () => {
    const buscador = claves.find((c) => c.clave === "ajuste:tema-apariencia");
    expect(buscador).toEqual({ clave: "ajuste:tema-apariencia", id: "tema-apariencia", label: "Tema y apariencia", fuente: "buscador" });
    const lienzo = claves.find((c) => c.clave === "ajuste:displacement-scale");
    expect(lienzo).toEqual({ clave: "ajuste:displacement-scale", id: "displacementScale", label: "Displacement Scale", fuente: "lienzo" });
  });

  it("normaliza camelCase del lienzo a kebab-case", () => {
    const crudo = "buttonStyle";
    const limpio = crudo.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    expect(claves.some((c) => c.clave === `ajuste:${limpio}`)).toBe(true);
    expect(claves.some((c) => c.clave === "ajuste:buttonstyle")).toBe(false);
  });
});

describe("claveDeAjuste", () => {
  it("resuelve un ajuste del buscador por su id", () => {
    expect(claveDeAjuste("tema-apariencia")).toBe("ajuste:tema-apariencia");
    expect(claveDeAjuste("export-import")).toBe("ajuste:export-import");
  });

  it("resuelve un efecto del lienzo con su id original en camelCase", () => {
    expect(claveDeAjuste("displacementScale")).toBe("ajuste:displacement-scale");
    expect(claveDeAjuste("fontMain")).toBe("ajuste:font-main");
  });

  it("no distingue mayúsculas en el id buscado", () => {
    expect(claveDeAjuste("TEMA-APARIENCIA")).toBe("ajuste:tema-apariencia");
  });

  it("devuelve null para un id vacío, con espacios o que el registro no conoce", () => {
    expect(claveDeAjuste("")).toBeNull();
    expect(claveDeAjuste("   ")).toBeNull();
    expect(claveDeAjuste("tema apariencia")).toBeNull();
    expect(claveDeAjuste("ajuste-fantasma")).toBeNull();
  });
});

describe("atributosDeAjuste", () => {
  it("expone data-ss-elemento para un ajuste del registro", () => {
    expect(atributosDeAjuste("fondo")).toEqual({ "data-ss-elemento": "ajuste:fondo" });
    expect(atributosDeAjuste("buttonRadius")).toEqual({ "data-ss-elemento": "ajuste:button-radius" });
  });

  it("devuelve objeto vacío con un id que no existe: expansión sin guardas", () => {
    expect(atributosDeAjuste("")).toEqual({});
    expect(atributosDeAjuste("inventado-que-no-esta")).toEqual({});
  });
});

describe("propsDeClave (ConClave)", () => {
  it("solo pone data-ss-elemento cuando la clave es canónica", () => {
    expect(propsDeClave("widget:clima")).toEqual({ "data-ss-elemento": "widget:clima" });
    expect(propsDeClave("widget:cl ima")).not.toHaveProperty("data-ss-elemento");
    expect(propsDeClave(null)).toEqual({});
    expect(Object.keys(propsDeClave(undefined))).toHaveLength(0);
  });

  it("conserva la clase junto a la clave, para envolver sin perder el estilo", () => {
    expect(propsDeClave("ajuste:fondo", "rounded-xl p-4")).toEqual({
      "data-ss-elemento": "ajuste:fondo",
      className: "rounded-xl p-4",
    });
  });
});
