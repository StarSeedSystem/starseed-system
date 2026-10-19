import { describe, it, expect } from "vitest";
import { Papel, Director, Asignacion, sugeridas, fusionarConAmbito } from "../asignaciones";

describe("asignaciones (puras)", () => {
  describe("sugeridas()", () => {
    it("devuelve una asignación válida para cada papel", () => {
      const papeles: Papel[] = ["escritor", "revisor", "chat", "vision", "voz", "imagen", "codigo"];
      papeles.forEach((papel) => {
        const asignacion = sugeridas(papel);
        expect(asignacion.clave).toBe(papel);
        expect(Array.isArray(asignacion.cadena)).toBe(true);
        expect(asignacion.cadena.length).toBeGreaterThan(0);
        expect(Array.isArray(asignacion.respaldo)).toBe(true);
        expect(Array.isArray(asignacion.preferencias)).toBe(true);
      });
    });

    it("devuelve una asignación válida para cada director", () => {
      const directores: Director[] = ["chat", "optimizador", "diseno", "produccion", "nube", "medidores", "aprendizaje"];
      directores.forEach((director) => {
        const asignacion = sugeridas(director);
        expect(asignacion.clave).toBe(director);
        expect(Array.isArray(asignacion.cadena)).toBe(true);
        expect(asignacion.cadena.length).toBeGreaterThan(0);
        expect(Array.isArray(asignacion.respaldo)).toBe(true);
        expect(Array.isArray(asignacion.preferencias)).toBe(true);
      });
    });

    it("las cadenas empiezan por astraura-158-local", () => {
      const asignacion = sugeridas("escritor");
      expect(asignacion.cadena[0]).toBe("astraura-158-local");
    });
  });

  describe("fusionarConAmbito()", () => {
    it("respeta los valores del ámbito cuando se proporcionan", () => {
      const sugeridas: Asignacion = {
        clave: "escritor",
        cadena: ["astraura-158-local", "openrouter:mistral-free"],
        respaldo: ["navegador:speechSynthesis"],
        preferencias: []
      };

      const delAmbito: Partial<Asignacion> = {
        cadena: ["openrouter:zephyr-free", "astraura-158-local"],
        preferencias: ["openrouter:mistral-free"]
      };

      const resultado = fusionarConAmbito(sugeridas, delAmbito);
      
      // Lo del ámbito manda en cadena y preferencias
      expect(resultado.cadena).toEqual(["openrouter:zephyr-free", "astraura-158-local"]);
      expect(resultado.preferencias).toEqual(["openrouter:mistral-free"]);
      
      // Se mantienen los valores originales cuando no se sobrescriben
      expect(resultado.clave).toBe("escritor");
      expect(resultado.respaldo).toEqual(["navegador:speechSynthesis"]);
    });

    it("mantiene los valores sugeridos cuando el ámbito no los proporciona", () => {
      const sugeridas: Asignacion = {
        clave: "vision",
        cadena: ["astraura-158-local", "openrouter:yi-vision-free"],
        respaldo: ["navegador:speechSynthesis"],
        preferencias: []
      };

      const delAmbito: Partial<Asignacion> = {}; // Ambiente vacío

      const resultado = fusionarConAmbito(sugeridas, delAmbito);
      
      expect(resultado).toEqual(sugeridas);
    });
  });
});