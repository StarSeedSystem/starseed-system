import { describe, it, expect } from "vitest";
import { resumenModelo, etiquetaUso } from "../presentacion";
import { MODELOS_IMAGEN } from "../modelos";
import type { OpcionImagen } from "../../imagenes/plan";

const sdxl = MODELOS_IMAGEN.find((m) => m.id === "sdxl");
const opcion: OpcionImagen = {
  capa: "neurona", neuronaId: "a1", modelo: sdxl ?? null, motor: "sdcpp",
  cuantizacion: "q4", semilla: 1, motivo: "porque sí",
};
const web: OpcionImagen = {
  capa: "web-gratis", modelo: null, motor: "pollinations", cuantizacion: "nativa",
  semilla: 2, motivo: "siempre funciona",
};

describe("resumenModelo", () => {
  it("muestra modelo, capa y cuantización", () => {
    expect(resumenModelo(opcion)).toContain("SDXL");
    expect(resumenModelo(opcion)).toContain("otra neurona tuya");
    expect(resumenModelo(opcion)).toContain("q4");
  });
  it("sin cuantización nativa no la menciona", () => {
    expect(resumenModelo(web)).not.toContain("nativa");
  });
  it("sin modelo no dice un nombre inventado", () => {
    expect(resumenModelo(web)).toContain("sin modelo nuevo");
  });
});

describe("etiquetaUso", () => {
  it("avisos no comercial", () => {
    expect(etiquetaUso("no-comercial", true)).toContain("no vale");
    expect(etiquetaUso("libre", true)).toBe("licencia libre");
    expect(etiquetaUso("atribucion", false)).toBe("libre con atribución");
  });
});
