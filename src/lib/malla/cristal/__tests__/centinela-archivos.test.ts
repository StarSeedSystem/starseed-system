import { describe, expect, it } from "vitest";
import { decidirEntrada } from "@/lib/malla/cristal/centinela-archivos";
import type { ResultadoAnalisis } from "@/lib/malla/cristal/centinela";
import type { ResultadoResonancia } from "@/lib/malla/cristal/resonancias";

describe("centinela-archivos — decidirEntrada", () => {
  const analisisPeligroso: ResultadoAnalisis = {
    nivel: "peligroso",
    motivos: ["Ejecutable ELF detectado por bytes mágicos"],
  };

  const analisisSospechoso: ResultadoAnalisis = {
    nivel: "sospechoso",
    motivos: ["Shebang (#!) detectado al inicio del archivo"],
  };

  const analisisLimpio: ResultadoAnalisis = {
    nivel: "limpio",
    motivos: [],
  };

  const resonanciaCuarentena: ResultadoResonancia = {
    decision: "cuarentena",
    cuentas: 2,
    motivo: "2 cuentas marcan peligroso",
  };

  const resonanciaAviso: ResultadoResonancia = {
    decision: "aviso",
    cuentas: 1,
    motivo: "una cuenta marca peligroso",
  };

  const resonanciaLimpio: ResultadoResonancia = {
    decision: "limpio",
    cuentas: 2,
    motivo: "2 cuentas marcan limpio",
  };

  const resonanciaSinDatos: ResultadoResonancia = {
    decision: "sin-datos",
    cuentas: 0,
    motivo: "pocos veredictos fiables",
  };

  describe("peligroso o cuarentena → rechazar", () => {
    it("rechaza archivo peligroso sin resonancia", () => {
      const resultado = decidirEntrada(analisisPeligroso, null);
      expect(resultado.accion).toBe("rechazar");
      expect(resultado.texto).toContain("Archivo rechazado:");
      expect(resultado.texto).toContain("Análisis local:");
    });

    it("rechaza archivo peligroso con resonancia limpio", () => {
      const resultado = decidirEntrada(analisisPeligroso, resonanciaLimpio);
      expect(resultado.accion).toBe("rechazar");
      expect(resultado.texto).toContain("Archivo rechazado:");
    });

    it("rechaza archivo limpio con resonancia cuarentena", () => {
      const resultado = decidirEntrada(analisisLimpio, resonanciaCuarentena);
      expect(resultado.accion).toBe("rechazar");
      expect(resultado.texto).toContain("Archivo rechazado:");
      expect(resultado.texto).toContain("Red:");
    });

    it("rechaza archivo peligroso con resonancia cuarentena", () => {
      const resultado = decidirEntrada(analisisPeligroso, resonanciaCuarentena);
      expect(resultado.accion).toBe("rechazar");
      expect(resultado.texto).toContain("Archivo rechazado:");
      expect(resultado.texto).toContain("Análisis local:");
      expect(resultado.texto).toContain("Red:");
    });
  });

  describe("sospechoso o aviso → avisar con los motivos", () => {
    it("avisar archivo sospechoso sin resonancia", () => {
      const resultado = decidirEntrada(analisisSospechoso, null);
      expect(resultado.accion).toBe("avisar");
      expect(resultado.texto).toContain("Precaución:");
      expect(resultado.texto).toContain("Análisis local:");
    });

    it("avisar archivo sospechoso con resonancia limpio", () => {
      const resultado = decidirEntrada(analisisSospechoso, resonanciaLimpio);
      expect(resultado.accion).toBe("avisar");
      expect(resultado.texto).toContain("Precaución:");
    });

    it("avisar archivo limpio con resonancia aviso", () => {
      const resultado = decidirEntrada(analisisLimpio, resonanciaAviso);
      expect(resultado.accion).toBe("avisar");
      expect(resultado.texto).toContain("Precaución:");
      expect(resultado.texto).toContain("Red:");
    });

    it("avisar archivo sospechoso con resonancia aviso", () => {
      const resultado = decidirEntrada(analisisSospechoso, resonanciaAviso);
      expect(resultado.accion).toBe("avisar");
      expect(resultado.texto).toContain("Precaución:");
      expect(resultado.texto).toContain("Análisis local:");
      expect(resultado.texto).toContain("Red:");
    });
  });

  describe("todo lo demás → preguntar (comportamiento por defecto)", () => {
    it("pregunta para archivo limpio sin resonancia", () => {
      const resultado = decidirEntrada(analisisLimpio, null);
      expect(resultado.accion).toBe("aceptar-con-pregunta");
      expect(resultado.texto).toBe("¿Aceptar este archivo?");
    });

    it("pregunta para archivo limpio con resonancia limpio", () => {
      const resultado = decidirEntrada(analisisLimpio, resonanciaLimpio);
      expect(resultado.accion).toBe("aceptar-con-pregunta");
      expect(resultado.texto).toBe("¿Aceptar este archivo?");
    });

    it("pregunta para archivo limpio con resonancia sin-datos", () => {
      const resultado = decidirEntrada(analisisLimpio, resonanciaSinDatos);
      expect(resultado.accion).toBe("aceptar-con-pregunta");
      expect(resultado.texto).toBe("¿Aceptar este archivo?");
    });
  });
});