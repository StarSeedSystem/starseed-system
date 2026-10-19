import { describe, expect, it } from "vitest";
import {
  cuerpoExcedeLimite,
  extraerIdRuta,
  respuestaSalud,
  manejarRender,
  manejarTrabajo,
  LIMITE_CUERPO_BYTES
} from "../../../servicios/hyperframes/src/rutas.mjs";

const depsMock = {
  version: "0.8.172",
  navegador: true,
  ffmpeg: true
};

describe("Servicio HyperFrames - Rutas (funciones puras)", () => {
  describe("Utilidades", () => {
    it("cuerpoExcedeLimite devuelve false para cuerpo pequeño", () => {
      expect(cuerpoExcedeLimite({ dato: "x".repeat(100) })).toBe(false);
    });

    it("cuerpoExcedeLimite devuelve true para cuerpo mayor a 8 MB", () => {
      const cuerpoGrande = { datos: "x".repeat(9 * 1024 * 1024) };
      expect(cuerpoExcedeLimite(cuerpoGrande)).toBe(true);
    });

    it("cuerpoExcedeLimite devuelve false para cuerpo null/undefined", () => {
      expect(cuerpoExcedeLimite(null)).toBe(false);
      expect(cuerpoExcedeLimite(undefined)).toBe(false);
    });

    it("extraerIdRuta extrae el ID correctamente", () => {
      expect(extraerIdRuta("/vista/abc123", "/vista/")).toBe("abc123");
      expect(extraerIdRuta("/trabajos/job-456", "/trabajos/")).toBe("job-456");
    });

    it("extraerIdRuta devuelve null si no coincide el prefijo", () => {
      expect(extraerIdRuta("/otra/ruta", "/vista/")).toBeNull();
    });
  });

  describe("respuestaSalud", () => {
    it("devuelve la configuración correcta", () => {
      const resultado = respuestaSalud(depsMock);
      expect(resultado.estado).toBe(200);
      expect(resultado.cuerpo).toEqual({
        version: "0.8.172",
        navegador: true,
        ffmpeg: true,
        telemetriaApagada: true
      });
    });
  });

  describe("manejarRender", () => {
    it("devuelve 202 con ID único", () => {
      const resultado = manejarRender();
      expect(resultado.estado).toBe(202);
      expect(resultado.cuerpo).toHaveProperty("mensaje", "Renderizado aceptado");
      expect(resultado.cuerpo).toHaveProperty("idTrabajo");
      expect(typeof resultado.cuerpo.idTrabajo).toBe("string");
      expect(resultado.cuerpo.idTrabajo.length).toBeGreaterThan(0);
    });

    it("genera IDs diferentes en cada llamada", () => {
      const id1 = manejarRender().cuerpo.idTrabajo;
      const id2 = manejarRender().cuerpo.idTrabajo;
      expect(id1).not.toBe(id2);
    });
  });

  describe("manejarTrabajo", () => {
    it("devuelve estado de trabajo con ID dado", () => {
      const resultado = manejarTrabajo("job-789");
      expect(resultado.estado).toBe(200);
      expect(resultado.cuerpo).toEqual({
        id: "job-789",
        estado: "procesando",
        progreso: 0
      });
    });
  });

  describe("Límites de cuerpo", () => {
    it("LIMITE_CUERPO_BYTES es 8 MB", () => {
      expect(LIMITE_CUERPO_BYTES).toBe(8 * 1024 * 1024);
    });

    it("rechaza cuerpos exactamente en el límite de 8 MB + 1 byte", () => {
      const cuerpoLimite = { datos: "x".repeat(LIMITE_CUERPO_BYTES + 1) };
      expect(cuerpoExcedeLimite(cuerpoLimite)).toBe(true);
    });

    it("acepta cuerpos justo por debajo del límite de 8 MB", () => {
      const cuerpoValido = { datos: "x".repeat(LIMITE_CUERPO_BYTES - 100) };
      expect(cuerpoExcedeLimite(cuerpoValido)).toBe(false);
    });
  });
});