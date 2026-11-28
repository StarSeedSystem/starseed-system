import { describe, it, expect } from "vitest";
import {
  formatoTiempo,
  etiquetaNivel,
  etiquetaEcualizador,
  esControladora,
  obtenerNeuronasUnicas,
} from "../utils";

describe("sala-sonido/utils", () => {
  describe("formatoTiempo", () => {
    it("formatea segundos a MM:SS", () => {
      expect(formatoTiempo(0)).toBe("0:00");
      expect(formatoTiempo(30)).toBe("0:30");
      expect(formatoTiempo(60)).toBe("1:00");
      expect(formatoTiempo(90)).toBe("1:30");
      expect(formatoTiempo(125)).toBe("2:05");
      expect(formatoTiempo(3661)).toBe("61:01");
    });

    it("redondea hacia abajo los segundos", () => {
      expect(formatoTiempo(59.9)).toBe("0:59");
      expect(formatoTiempo(60.9)).toBe("1:00");
    });
  });

  describe("etiquetaNivel", () => {
    it("devuelve la etiqueta correcta para cada rango", () => {
      expect(etiquetaNivel(0)).toBe("Silencio");
      expect(etiquetaNivel(0.1)).toBe("Muy bajo");
      expect(etiquetaNivel(0.24)).toBe("Muy bajo");
      expect(etiquetaNivel(0.25)).toBe("Bajo");
      expect(etiquetaNivel(0.49)).toBe("Bajo");
      expect(etiquetaNivel(0.5)).toBe("Medio");
      expect(etiquetaNivel(0.74)).toBe("Medio");
      expect(etiquetaNivel(0.75)).toBe("Alto");
      expect(etiquetaNivel(0.99)).toBe("Alto");
      expect(etiquetaNivel(1)).toBe("Máximo");
      expect(etiquetaNivel(1.5)).toBe("Máximo");
    });
  });

  describe("etiquetaEcualizador", () => {
    it("devuelve 'Plano' para cero", () => {
      expect(etiquetaEcualizador(0)).toBe("Plano");
    });

    it("devuelve dB positivos con signo +", () => {
      expect(etiquetaEcualizador(0.5)).toBe("+6 dB");
      expect(etiquetaEcualizador(1)).toBe("+12 dB");
      expect(etiquetaEcualizador(0.25)).toBe("+3 dB");
    });

    it("devuelve dB negativos sin signo +", () => {
      expect(etiquetaEcualizador(-0.5)).toBe("-6 dB");
      expect(etiquetaEcualizador(-1)).toBe("-12 dB");
      expect(etiquetaEcualizador(-0.25)).toBe("-3 dB");
    });

    it("redondea al entero más cercano", () => {
      expect(etiquetaEcualizador(0.33)).toBe("+4 dB");
      expect(etiquetaEcualizador(-0.33)).toBe("-4 dB");
    });
  });

  describe("esControladora", () => {
    it("devuelve true para modo 'todas'", () => {
      expect(esControladora("neurona-1", "todas", [])).toBe(true);
      expect(esControladora("neurona-2", "todas", ["neurona-1"])).toBe(true);
    });

    it("devuelve true solo para la neurona controladora en modo 'una'", () => {
      expect(esControladora("neurona-1", "una", ["neurona-1"])).toBe(true);
      expect(esControladora("neurona-2", "una", ["neurona-1"])).toBe(false);
      expect(esControladora("neurona-1", "una", [])).toBe(false);
    });

    it("devuelve true para neuronas en la lista en modo 'elegidas'", () => {
      expect(esControladora("neurona-1", "elegidas", ["neurona-1", "neurona-3"])).toBe(true);
      expect(esControladora("neurona-3", "elegidas", ["neurona-1", "neurona-3"])).toBe(true);
      expect(esControladora("neurona-2", "elegidas", ["neurona-1", "neurona-3"])).toBe(false);
      expect(esControladora("neurona-1", "elegidas", [])).toBe(false);
    });
  });

  describe("obtenerNeuronasUnicas", () => {
    it("extrae neuronas únicas de las fuentes", () => {
      const fuentes = [
        { neuronaId: "n1", neuronaNombre: "Neurona 1" },
        { neuronaId: "n2", neuronaNombre: "Neurona 2" },
        { neuronaId: "n1", neuronaNombre: "Neurona 1" },
      ];
      const resultado = obtenerNeuronasUnicas(fuentes);
      expect(resultado).toHaveLength(2);
      expect(resultado).toEqual([
        { id: "n1", nombre: "Neurona 1" },
        { id: "n2", nombre: "Neurona 2" },
      ]);
    });

    it("devuelve array vacío para entrada vacía", () => {
      expect(obtenerNeuronasUnicas([])).toEqual([]);
    });

    it("mantiene el orden de primera aparición", () => {
      const fuentes = [
        { neuronaId: "n3", neuronaNombre: "Tercera" },
        { neuronaId: "n1", neuronaNombre: "Primera" },
        { neuronaId: "n2", neuronaNombre: "Segunda" },
        { neuronaId: "n3", neuronaNombre: "Tercera duplicada" },
      ];
      const resultado = obtenerNeuronasUnicas(fuentes);
      expect(resultado.map((n) => n.id)).toEqual(["n3", "n1", "n2"]);
    });
  });
});