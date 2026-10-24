import { describe, it, expect } from "vitest";
import { paletaDePreset, paletaDeMuestra, paletaFondo, ColorRGBA, FondoSet } from "../paleta-fondo";

/* FSH1018M — fondos con shaders: paleta del fondo (Ola 1018F) */

describe("paletaDePreset", () => {
  it("debe extraer colores de un preset con propiedades HSLA", () => {
    const preset = {
      componentes: [
        {
          type: "gradient",
          id: "fondo-luz-dia",
          props: {
            hue: 45,
            saturation: 0.8,
            lightness: 0.6,
            alpha: 1,
            weight: 1.5,
          },
        },
        {
          type: "gradient",
          id: "brillo-crepusculo",
          props: {
            hue: 210,
            saturation: 0.6,
            lightness: 0.4,
            alpha: 0.8,
            weight: 0.5,
          },
        },
      ],
      structureVersion: 1,
    };

    const colores = paletaDePreset(preset);

    expect(colores).toHaveLength(2);
    expect(colores[0]).toMatchObject({
      nombre: "fondo-luz-dia",
      peso: 1.5,
      origen: "preset",
    });
    expect(colores[0].rgba.r).toBeGreaterThanOrEqual(0);
    expect(colores[0].rgba.r).toBeLessThanOrEqual(255);
    expect(colores[1]).toMatchObject({
      nombre: "brillo-crepusculo",
      peso: 0.5,
      origen: "preset",
    });

    expect(colores[0].peso).toBeGreaterThan(colores[1].peso);
  });

  it("debe ordenar colores por peso descendente", () => {
    const preset = {
      componentes: [
        { type: "gradiente", id: "oscuro", props: { hue: 0, weight: 0.2 } },
        { type: "gradiente", id: "claro", props: { hue: 120, weight: 0.8 } },
        { type: "gradiente", id: "mediano", props: { hue: 240, weight: 0.5 } },
      ],
      structureVersion: 1,
    };

    const colores = paletaDePreset(preset);

    expect(colores.map((c) => c.nombre)).toEqual(["claro", "mediano", "oscuro"]);
    expect(colores.map((c) => c.peso)).toEqual([0.8, 0.5, 0.2]);
  });

  it("debe generar valores RGBA en rango válido", () => {
    const preset = {
      componentes: [
        {
          type: "gradient",
          id: "color-testo",
          props: { hue: 180, saturation: 0.7, lightness: 0.5 },
        },
      ],
      structureVersion: 1,
    };

    const colores = paletaDePreset(preset);

    colores.forEach((color) => {
      expect(color.rgba.r).toBeGreaterThanOrEqual(0);
      expect(color.rgba.r).toBeLessThanOrEqual(255);
      expect(color.rgba.g).toBeGreaterThanOrEqual(0);
      expect(color.rgba.g).toBeLessThanOrEqual(255);
      expect(color.rgba.b).toBeGreaterThanOrEqual(0);
      expect(color.rgba.b).toBeLessThanOrEqual(255);
      expect(color.rgba.a).toBeGreaterThanOrEqual(0);
      expect(color.rgba.a).toBeLessThanOrEqual(1);
    });
  });
});

describe("paletaDeMuestra", () => {
  it("debe agrupar pixeles RGBA con k-medias determinista", () => {
    const pixeles: ColorRGBA[] = [
      { r: 255, g: 100, b: 50, a: 1 },
      { r: 250, g: 90, b: 60, a: 1 },
      { r: 240, g: 80, b: 70, a: 1 },
      { r: 100, g: 200, b: 150, a: 1 },
      { r: 90, g: 180, b: 140, a: 1 },
      { r: 110, g: 190, b: 160, a: 1 },
    ];

    const colores = paletaDeMuestra(pixeles, 2);

    expect(colores).toHaveLength(2);
    colores.forEach((color) => {
      expect(color).toHaveProperty("nombre");
      expect(color).toHaveProperty("rgba");
      expect(color).toHaveProperty("peso");
      expect(color).toHaveProperty("origen");
      expect(color.origen).toBe("muestra");
      expect(color.peso).toBeGreaterThan(0);
      expect(color.peso).toBeLessThanOrEqual(1);
      expect(color.rgba.r).toBeGreaterThanOrEqual(0);
      expect(color.rgba.r).toBeLessThanOrEqual(255);
    });

    expect(colores[0].peso).toBeGreaterThanOrEqual(colores[1].peso);
  });

  it("debe usar k=5 por defecto", () => {
    const pixeles: ColorRGBA[] = [
      { r: 255, g: 0, b: 0, a: 1 },
      { r: 0, g: 255, b: 0, a: 1 },
      { r: 0, g: 0, b: 255, a: 1 },
    ];

    const colores = paletaDeMuestra(pixeles);

    expect(colores).toHaveLength(5);
  });

  it("debe mantener determinismo con misma entrada", () => {
    const pixeles: ColorRGBA[] = [
      { r: 200, g: 50, b: 100, a: 0.9 },
      { r: 180, g: 70, b: 120, a: 0.8 },
    ];

    const colores1 = paletaDeMuestra(pixeles, 2);
    const colores2 = paletaDeMuestra(pixeles, 2);

    expect(colores1).toEqual(colores2);
  });
});

describe("paletaFondo", () => {
  it("debe retornar solo colores del set cuando no hay muestra", () => {
    const set: FondoSet = {
      nombre: "aurora-natural",
      colores: [
        {
          nombre: "fondo-gris-oscuro",
          rgba: { r: 30, g: 30, b: 30, a: 1 },
          peso: 1.0,
          origen: "preset",
        },
        {
          nombre: "brillo-azul-claro",
          rgba: { r: 100, g: 150, b: 255, a: 0.8 },
          peso: 0.6,
          origen: "preset",
        },
      ],
    };

    const paleta = paletaFondo(set);

    expect(paleta).toHaveLength(2);
    expect(paleta.map((c) => c.nombre)).toEqual(["fondo-gris-oscuro", "brillo-azul-claro"]);
  });

  it("debe combinar colores de set y muestra", () => {
    const set: FondoSet = {
      nombre: "océano",
      colores: [
        {
          nombre: "agua-azul",
          rgba: { r: 0, g: 50, b: 100, a: 1 },
          peso: 0.8,
          origen: "preset",
        },
      ],
    };

    const muestra: ColorRGBA[] = [
      { r: 150, g: 200, b: 255, a: 0.9 },
      { r: 100, g: 150, b: 200, a: 0.8 },
    ];

    const paleta = paletaFondo(set, muestra);

    expect(paleta.length).toBeGreaterThanOrEqual(2);
    expect(paleta.some((c) => c.nombre === "agua-azul")).toBe(true);
  });

  it("debe ordenar por peso luego por luminancia", () => {
    const set: FondoSet = {
      nombre: "contraste-alto",
      colores: [
        {
          nombre: "blanco-brillante",
          rgba: { r: 255, g: 255, b: 255, a: 1 },
          peso: 0.3,
          origen: "preset",
        },
        {
          nombre: "negro-profundo",
          rgba: { r: 10, g: 10, b: 10, a: 1 },
          peso: 0.7,
          origen: "preset",
        },
        {
          nombre: "gris-medio",
          rgba: { r: 128, g: 128, b: 128, a: 1 },
          peso: 0.5,
          origen: "preset",
        },
      ],
    };

    const paleta = paletaFondo(set);

    expect(paleta.map((c) => c.nombre)).toEqual(["negro-profundo", "gris-medio", "blanco-brillante"]);
    expect(paleta.map((c) => c.peso)).toEqual([0.7, 0.5, 0.3]);
  });

  it("debe eliminar colores RGBA duplicados", () => {
    const set: FondoSet = {
      nombre: "sin-duplicados",
      colores: [
        {
          nombre: "rojo-primero",
          rgba: { r: 255, g: 0, b: 0, a: 1 },
          peso: 1.0,
          origen: "preset",
        },
        {
          nombre: "rojo-segundo",
          rgba: { r: 255, g: 0, b: 0, a: 1 },
          peso: 0.9,
          origen: "preset",
        },
        {
          nombre: "azul-unico",
          rgba: { r: 0, g: 0, b: 255, a: 1 },
          peso: 0.5,
          origen: "preset",
        },
      ],
    };

    const paleta = paletaFondo(set);

    expect(paleta).toHaveLength(2);
    expect(paleta.some((c) => c.nombre === "rojo-primero")).toBe(true);
    expect(paleta.some((c) => c.nombre === "azul-unico")).toBe(true);
  });
});
