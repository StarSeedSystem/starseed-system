// hyperframes-rutas.test.mjs
// Pruebas para el servicio HyperFrames - rutas puras

import { describe, it, expect } from "vitest";
import { manejar } from "servicios/hyperframes/src/rutas.mjs";

const MOCK_DEPS = {
  version: "0.8.172",
  ffprobePresent: true,
  ffmpegPresent: true,
  navegadorPresent: true,
  telemetriaApagada: true,
  maxCuerpo: 8 * 1024 * 1024,
};

describe("Servicio HyperFrames - rutas puras", () => {
  describe("GET /salud", () => {
    it("debe devolver estado con información de dependencias", () => {
      const resultado = manejar(
        { metodo: "GET", ruta: "/salud", cuerpo: null },
        MOCK_DEPS
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.version).toBe("1.0.0");
      expect(resultado.ffprobe).toBe(true);
      expect(resultado.ffmpeg).toBe(true);
      expect(resultado.navegador).toBe(true);
      expect(resultado.telemetriaApagada).toBe(true);
      expect(typeof resultado.timestamp).toBe("number");
    });
  });

  describe("POST /lint", () => {
    it("debe devolver lint sin errores", () => {
      const cuerpo = { archivo: "test.html" };
      const resultado = manejar(
        { metodo: "POST", ruta: "/lint", cuerpo },
        MOCK_DEPS
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.lint).toEqual({
        errores: [],
        advertencias: [],
      });
    });
  });

  describe("POST /editar", () => {
    it("debe devolver patch vacío", () => {
      const cuerpo = { operacion: "añadirTexto", valor: "Hello" };
      const resultado = manejar(
        { metodo: "POST", ruta: "/editar", cuerpo },
        MOCK_DEPS
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.patch).toEqual([]);
      expect(resultado.revertir).toEqual([]);
    });
  });

  describe("GET /vista/:id", () => {
    it("debe servir vista de composición", () => {
      const resultado = manejar(
        { metodo: "GET", ruta: "/vista/mi-composicion", cuerpo: null },
        MOCK_DEPS
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.html).toContain("Composición de HyperFrames: mi-composicion");
      expect(resultado.video).toBe("/videos/mi-composicion.mp4");
    });
  });

  describe("POST /render", () => {
    it("debe crear trabajo de render", () => {
      const cuerpo = {
        entrada: "test.html",
        formato: "mp4",
        opciones: { calidad: 90 },
      };
      const resultado = manejar(
        { metodo: "POST", ruta: "/render", cuerpo },
        MOCK_DEPS
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.id).toMatch(/^trabajo-\d+$/);
      expect(resultado.estado).toBe("en cola");
    });
  });

  describe("GET /trabajos/:id", () => {
    it("debe obtener estado del trabajo", () => {
      const resultado = manejar(
        { metodo: "GET", ruta: "/trabajos/trabajo-123", cuerpo: null },
        MOCK_DEPS
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.id).toBe("trabajo-123");
      expect(resultado.estado).toBe("en cola");
      expect(resultado.progreso).toBe(0);
      expect(resultado.salida).toBe(null);
    });
  });

  describe("manejo de límites y errores", () => {
    it("debe rechazar cuerpos grandes", () => {
      const cuerpoGrande = { datos: "x".repeat(9 * 1024 * 1024) }; // 9 MB
      const resultado = manejar(
        { metodo: "POST", ruta: "/lint", cuerpo: cuerpoGrande },
        MOCK_DEPS
      );

      expect(resultado.ok).toBe(false);
      expect(resultado.error).toContain("más de");
      expect(resultado.codigo).toBe(413);
    });

    it("debe rechazar rutas desconocidas", () => {
      const resultado = manejar(
        { metodo: "GET", ruta: "/desconocido", cuerpo: null },
        MOCK_DEPS
      );

      expect(resultado.ok).toBe(false);
      expect(resultado.error).toContain("desconocida");
      expect(resultado.codigo).toBe(404);
    });

    it("debe rechazar rutas con directorios", () => {
      const resultado = manejar(
        { metodo: "GET", ruta: "/ruta/../forbidden", cuerpo: null },
        MOCK_DEPS
      );

      expect(resultado.ok).toBe(false);
      expect(resultado.error).toContain("fuera del proyecto");
      expect(resultado.codigo).toBe(400);
    });
  });
});