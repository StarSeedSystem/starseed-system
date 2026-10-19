import { describe, it, expect } from "vitest";
import { construirCatalogo } from "../catalogo-shaders";

// Mock del registro de shaders para pruebas
const mockRegistro = [
  {
    name: "TestBlur",
    category: "Blurs",
    description: "A test blur effect",
    fileName: "TestBlur",
    requiresChild: false,
    propsMetadata: {
      intensity: {
        default: 10,
        description: "Intensity of the blur",
        ui: { type: "range", min: 0, max: 100, step: 1 },
      },
    },
  },
  {
    name: "CursorTest",
    category: "Interactive",
    description: "A test cursor effect",
    fileName: "CursorTest",
    requiresChild: true,
    propsMetadata: {
      size: {
        default: 20,
        description: "Size of the cursor",
        ui: { type: "range", min: 5, max: 50 },
      },
    },
  },
  {
    name: "WebcamTexture",
    category: "Textures",
    description: "Webcam texture shader",
    fileName: "WebcamTexture",
    requiresChild: false,
    propsMetadata: {},
  },
  {
    name: "Fog",
    category: "Distortions",
    description: "A fog effect",
    fileName: "Fog",
    requiresChild: false,
    propsMetadata: {
      density: {
        default: 0.5,
        description: "Fog density",
        ui: { type: "range", min: 0, max: 1, step: 0.01 },
      },
    },
  },
];

describe("construirCatalogo", () => {
  it("debe agrupar shaders por categoría", () => {
    const resultado = construirCatalogo(mockRegistro);
    expect(Object.keys(resultado)).toContain("Desenfoques");
    expect(Object.keys(resultado)).toContain("Interactivos");
    expect(Object.keys(resultado)).toContain("Texturas");
    expect(Object.keys(resultado)).toContain("Distorsiones");
    expect(resultado.Desenfoques).toHaveLength(1);
    expect(resultado.Interactivos).toHaveLength(1);
    expect(resultado.Texturas).toHaveLength(1);
    expect(resultado.Distorsiones).toHaveLength(1);
  });

  it("debe marcar correctamente requiereCamara", () => {
    const resultado = construirCatalogo(mockRegistro);
    const webcamShader = resultado.Texturas[0];
    expect(webcamShader.nombre).toBe("WebcamTexture");
    expect(webcamShader.requiereCamara).toBe(true);
  });

  it("debe marcar correctamente interactivo", () => {
    const resultado = construirCatalogo(mockRegistro);
    const cursorShader = resultado.Interactivos[0];
    expect(cursorShader.nombre).toBe("CursorTest");
    expect(cursorShader.interactivo).toBe(true);
  });

  it("debe marcar correctamente necesitaHijo", () => {
    const resultado = construirCatalogo(mockRegistro);
    const cursorShader = resultado.Interactivos[0];
    expect(cursorShader.necesitaHijo).toBe(true);
    const blurShader = resultado.Desenfoques[0];
    expect(blurShader.necesitaHijo).toBe(false);
  });

  it("debe marcar correctamente shaders pesados", () => {
    const resultado = construirCatalogo(mockRegistro);
    const fogShader = resultado.Distorsiones[0];
    expect(fogShader.nombre).toBe("Fog");
    expect(fogShader.pesado).toBe(true);
  });

  it("debe extraer props editables correctamente", () => {
    const resultado = construirCatalogo(mockRegistro);
    const blurShader = resultado.Desenfoques[0];
    expect(blurShader.props).toHaveProperty("intensity");
    expect(blurShader.props.intensity.default).toBe(10);
    expect(blurShader.props.intensity.description).toBe("Intensity of the blur");
    expect(blurShader.props.intensity.ui.type).toBe("range");
  });
});