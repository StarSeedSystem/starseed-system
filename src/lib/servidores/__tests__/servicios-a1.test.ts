import { describe, it, expect } from "vitest";
import { urlPorDefecto, esperaFria } from "../servicios-a1";

describe("servicios-a1 · urlPorDefecto", () => {
  it("devuelve la URL de LibreTranslate en localhost", () => {
    const resultado = urlPorDefecto("libretranslate", "localhost");
    expect(resultado).toBe("http://127.0.0.1:5100");
  });

  it("devuelve la URL de Stirling-PDF en mac-nativa", () => {
    const resultado = urlPorDefecto("stirling-pdf", "mac-nativa");
    expect(resultado).toBe("http://127.0.0.1:8180");
  });

  it("devuelve null en entorno producción con motivo", () => {
    const resultado = urlPorDefecto("libretranslate", "produccion");
    expect(resultado).toBeNull();
  });

  it("usa la variable de entorno LIBRETRANSLATE_URL cuando existe", () => {
    const original = process.env.LIBRETRANSLATE_URL;
    process.env.LIBRETRANSLATE_URL = "https://mi-translator.local";
    try {
      const resultado = urlPorDefecto("libretranslate", "produccion");
      expect(resultado).toBe("https://mi-translator.local");
    } finally {
      if (original === undefined) delete process.env.LIBRETRANSLATE_URL;
      else (process.env as any)[
        "LIBRETRANSLATE_URL"
      ] = original;
    }
  });

  it("usa la variable de entorno COMFY_URL sobreescribe a la por defecto", () => {
    const original = process.env.COMFYUI_URL;
    process.env.COMFYUI_URL = "https://custom-comfyui.local";
    try {
      const resultado = urlPorDefecto("comfyui", "produccion");
      expect(resultado).toBe("https://custom-comfyui.local");
    } finally {
      if (original === undefined) delete process.env.COMFYUI_URL;
      else (process.env as any)[
        "COMFYUI_URL"
      ] = original;
    }
  });
});

describe("servicios-a1 · esperaFria", () => {
  it("devuelve 3 s para LibreTranslate", () => {
    const resultado = esperaFria("libretranslate");
    expect(resultado).toBe(3);
  });

  it("devuelve 109 s para Stirling-PDF", () => {
    const resultado = esperaFria("stirling-pdf");
    expect(resultado).toBe(109);
  });

  it("devuelve 76 s para ArchiveBox", () => {
    const resultado = esperaFria("archivebox");
    expect(resultado).toBe(76);
  });

  it("devuelve 22 s para ComfyUI", () => {
    const resultado = esperaFria("comfyui");
    expect(resultado).toBe(22);
  });

  it("devuelve 14 s para OpenHands", () => {
    const resultado = esperaFria("openhands");
    expect(resultado).toBe(14);
  });

  it("devuelve 0 para servicio fuera del rango", () => {
    const resultado = esperaFria("xyz" as unknown as ServicioA1);
    expect(resultado).toBe(0);
  });
});