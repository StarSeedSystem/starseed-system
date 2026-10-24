import { describe, it, expect } from "vitest";
import { SHADERS_HABILIDAD, contarPalabras, extraerJsonDesdeTexto, crearSetDesdePreset } from "../shaders";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";

// Mock catalog for testing
const mockCatalog = {
  version: "4.0.4",
  catalog: {
    fondo: [
      {
        name: "LinearGradient",
        description: "Degradado lineal suave",
        category: "fondos",
        props: {
          colorA: { default: "#ffffff", type: "color", required: false },
          colorB: { default: "#000000", type: "color", required: false },
          angle: { default: 45, type: "number", min: 0, max: 360, required: false },
        },
      },
      {
        name: "Aurora",
        description: "Aurora boreal animada",
        category: "fondos",
        props: {
          colorA: { default: "#ff0000", type: "color", required: false },
          colorB: { default: "#0000ff", type: "color", required: false },
          speed: { default: 0.5, type: "number", min: 0, max: 1, required: false },
        },
      },
    ],
  },
};

// Mock options for testing
const mockOptions = {
  catalogo: mockCatalog,
  biblioteca: ["starseed://library/"],
  compartido: false,
};

describe("Habilidad de Shaders (Ola 1018F)", () => {
  it("debería tener la habilidad definida con las propiedades necesarias", () => {
    expect(SHADERS_HABILIDAD.id).toBe("shaders");
    expect(SHADERS_HABILIDAD.nombre).toBe("Fondos con Shaders: crear un fondo describiéndolo");
    expect(SHADERS_HABILIDAD.tarjeta).toBeTypeOf("string");
    expect(SHADERS_HABILIDAD.resumen).toBeTypeOf("string");
  });

  it("debería respetar los límites de palabras de tarjeta (≤60)", () => {
    const palabras = contarPalabras(SHADERS_HABILIDAD.tarjeta);
    expect(palabras).toBeLessThanOrEqual(60);
    expect(palabras).toBeGreaterThan(20);
  });

  it("debería respetar los límites de palabras de resumen (≤120)", () => {
    const palabras = contarPalabras(SHADERS_HABILIDAD.resumen);
    expect(palabras).toBeLessThanOrEqual(120);
    expect(palabras).toBeGreaterThan(60);
  });

  it("debería decir cuándo aplica en una sola frase", () => {
    expect(SHADERS_HABILIDAD.cuando).toBeTypeOf("string");
    expect(SHADERS_HABILIDAD.cuando).toMatch(/^Cuando .+\.$/);
  });

  it("debería tener id único que no choque con las habilidades existentes", () => {
    expect(SHADERS_HABILIDAD.id).not.toBe("");
    expect(SHADERS_HABILIDAD.id).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("contarPalabras", () => {
  it("cuenta palabras básicas", () => {
    expect(contarPalabras("hola mundo")).toBe(2);
    expect(contarPalabras("  palabra con espacios extra  ")).toBe(4);
    expect(contarPalabras("  ")).toBe(0);
    expect(contarPalabras(""))
      .toBe(0);
  });

  it("maneja títulos, símbolos y líneas nuevas", () => {
    expect(contarPalabras("uno dos tres")).toBe(3);
    expect(contarPalabras("uno   dos   tres")).toBe(3);
    expect(contarPalabras("rojo → verde"))
      .toBe(3);
  });
});

describe("extraerJsonDesdeTexto", () => {
  it("extrae JSON de bloque markdown simple", () => {
    const entrada = 'Describe este fondo: {"components": [{"type": "LinearGradient", "props": {"colorA": "#ff0000"}}] }';
    const resultado = extraerJsonDesdeTexto(entrada);
    expect(resultado).toBeTypeOf("object");
    expect(resultado).toHaveProperty("components");
    expect(Array.isArray(resultado.components)).toBe(true);
  });

  it("devuelve null si no hay JSON", () => {
    const entrada = "Solo texto plano sin JSON aquí";
    const resultado = extraerJsonDesdeTexto(entrada);
    expect(resultado).toBe(null);
  });

  it("maneja markdown con backticks", () => {
    const entrada = '```\n{"components": []}\n```';
    const resultado = extraerJsonDesdeTexto(entrada);
    expect(resultado).toEqual({ components: [] });
  });
});

describe("crearSetDesdePreset", () => {
  it("crea un set de fondos válido desde un preset", () => {
    const preset = {
      components: [
        { type: "LinearGradient", props: { colorA: "#ff0000", colorB: "#0000ff", angle: 45 } },
      ],
    };
    const capas: BackgroundLayer[] = [];
    const resultado = crearSetDesdePreset(preset, "spline", capas, "Test Author", "Fondo de Prueba");

    expect(resultado.formato).toBe("starseed-fondo");
    expect(resultado.version).toBe(1);
    expect(resultado.nombre).toBe("Fondo de Prueba");
    expect(resultado.autor).toBe("Test Author");
    expect(resultado.base).toBe("spline");
    expect(Array.isArray(resultado.capas)).toBe(true);
    expect(resultado.capas.length).toBe(1);
    expect(resultado.capas[0].kind).toBe("shader");
  });

  it("incluye la licencia MIT de shaders cuando usa un preset shader", () => {
    const preset = { components: [] };
    const resultado = crearSetDesdePreset(preset, null, [], "Autor", "Nombre");

    expect(resultado.licencias[0]).toContain("MIT · paquete npm");
    expect(resultado.licencias[0]).toContain("shaders");
    expect(resultado.licencias[0]).toContain("Shader Effects Inc.");
  });
});
