import { describe, it, expect } from "vitest";
import { privacidadEfectiva } from "../privacidad-laya";

describe("privacidadEfectiva", () => {
  describe("when Laya provides no result (null)", () => {
    it("should return the base level (max of marcada and reglas) with motivo about Laya", () => {
      // marcada: persona (2), reglas: publico (0) -> base 2 (privado)
      expect(
        privacidadEfectiva({
          marcada: "persona",
          reglas: "publico",
          laya: null,
          umbral: 0.5,
        })
      ).toEqual({
        nivel: "privado",
        motivo: "Laya no proporcionó un resultado concluyente",
      });

      // marcada: ámbito (1), reglas: ámbito (1) -> base 1 (ámbito)
      expect(
        privacidadEfectiva({
          marcada: "ámbito",
          reglas: "ámbito",
          laya: null,
          umbral: 0.5,
        })
      ).toEqual({
        nivel: "ámbito",
        motivo: "Laya no proporcionó un resultado concluyente",
      });

      // marcada: persona (2), reglas: privado (2) -> base 2 (privado)
      expect(
        privacidadEfectiva({
          marcada: "persona",
          reglas: "privado",
          laya: null,
          umbral: 0.5,
        })
      ).toEqual({
        nivel: "privado",
        motivo: "Laya no proporcionó un resultado concluyente",
      });
    });
  });

  describe("when Laya provides a result below the umbral", () => {
    it("should return the base level with motivo about confidence below umbral", () => {
      // Base level: privado (2) from marcada: persona
      // Laya confidence: 0.25 < 0.5 -> should stay at privado
      expect(
        privacidadEfectiva({
          marcada: "persona",
          reglas: "publico", // base level is max(2,0)=2
          laya: { answer_confidence: 0.25 },
          umbral: 0.5,
        })
      ).toEqual({
        nivel: "privado",
        motivo: "La confianza de Laya (0.25) está por debajo del umbral (0.50)",
      });

      // Base level: ámbito (1) from marcada: ámbito and reglas: publico
      // Laya confidence: 0.4 < 0.5 -> should stay at ámbito
      expect(
        privacidadEfectiva({
          marcada: "ámbito",
          reglas: "publico",
          laya: { answer_confidence: 0.4 },
          umbral: 0.5,
        })
      ).toEqual({
        nivel: "ámbito",
        motivo: "La confianza de Laya (0.40) está por debajo del umbral (0.50)",
      });
    });
  });

  describe("when Laya provides a result above or equal to the umbral", () => {
    it("should increase the level by one (if possible)", () => {
      // Base level: público (0) is not possible because marcada is at least ámbito (1).
      // The lowest base we can get is 1 (ámbito) when marcada is ámbit0 and reglas is publico.
      // Test increasing from ámbito (1) to privado (2)
      expect(
        privacidadEfectiva({
          marcada: "ámbito",
          reglas: "publico", // base level: max(1,0)=1
          laya: { answer_confidence: 0.6 },
          umbral: 0.5,
        })
      ).toEqual({
        nivel: "privado",
        motivo: "Se aumentó el nivel de privacidad de ámbito a privado por confianza de Laya (0.60)",
      });

      // Test that if we are already at privado (2), we cannot increase further.
      expect(
        privacidadEfectiva({
          marcada: "persona",
          reglas: "privado", // base level: 2
          laya: { answer_confidence: 0.8 },
          umbral: 0.5,
        })
      ).toEqual({
        nivel: "privado",
        motivo: "Ya está en el nivel máximo de privacidad (privado). La confianza de Laya (0.80) no puede aumentar más el nivel.",
      });
    });

    it("should handle the edge case of confidence exactly equal to umbral", () => {
      expect(
        privacidadEfectiva({
          marcada: "ámbito",
          reglas: "publico",
          laya: { answer_confidence: 0.5 },
          umbral: 0.5,
        })
      ).toEqual({
        nivel: "privado",
        motivo: "Se aumentó el nivel de privacidad de ámbito a privado por confianza de Laya (0.50)",
      });
    });
  });

  describe("when reglas is not recognized", () => {
    it("should treat unrecognized reglas as publico (0)", () => {
      expect(
        privacidadEfectiva({
          marcada: "ámbito",
          reglas: "unknown",
          laya: { answer_confidence: 0.6 },
          umbral: 0.5,
        })
      ).toEqual({
        nivel: "privado",
        motivo: "Se aumentó el nivel de privacidad de ámbito a privado por confianza de Laya (0.60)",
      });
    });
  });
});