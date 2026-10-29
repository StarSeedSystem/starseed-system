import { describe, it, expect } from "vitest";
import { leerRespuesta, type Decision, type PreguntaChoice } from "@/lib/jev/decisiones";
import {
  HABILIDADES_INGENIERIA,
  OPCION_NINGUNA,
  UMBRAL_CONFIANZA_DEFECTO,
  bloqueHabilidad,
  preguntaHabilidad,
} from "../elegir-habilidad";
import { HABILIDADES_INGENIERIA_A } from "../ingenieria-a";

/** Respuesta de Laya con la FORMA REAL (choice/probabilities/answer_confidence). */
function respuestaLaya(choice: string, answer_confidence: number, confidence = 0.99): Decision {
  return leerRespuesta({
    answers: {
      habilidad: {
        type: "choice",
        choice,
        probabilities: { [choice]: answer_confidence },
        answer_confidence,
        confidence,
      },
    },
  })["habilidad"];
}

describe("preguntaHabilidad", () => {
  it("arma una choice con criterio = «cuando» de cada habilidad + «ninguna»", () => {
    const p: PreguntaChoice = preguntaHabilidad();
    expect(p.type).toBe("choice");
    expect(p.instructions.length).toBeGreaterThan(0);
    // Por cada habilidad (A + B) una opción, más «ninguna».
    expect(Object.keys(p.criteria)).toHaveLength(HABILIDADES_INGENIERIA.length + 1);
    for (const h of HABILIDADES_INGENIERIA) {
      expect(p.criteria[h.id]).toBe(`${h.id}: ${h.cuando}`);
    }
    expect(p.criteria[OPCION_NINGUNA]).toContain("Ninguna habilidad");
  });

  it("con una lista corta, solo esas opciones y «ninguna»", () => {
    const p = preguntaHabilidad([
      { id: "tdd", cuando: "Escribiendo primero la prueba." },
    ]);
    expect(Object.keys(p.criteria)).toEqual(["tdd", OPCION_NINGUNA]);
  });

  it("el catálogo por defecto junta las de ingeniería A y B", () => {
    expect(HABILIDADES_INGENIERIA).toEqual([
      ...HABILIDADES_INGENIERIA_A,
      ...HABILIDADES_INGENIERIA.filter((h) => !HABILIDADES_INGENIERIA_A.includes(h)),
    ]);
    expect(HABILIDADES_INGENIERIA.length).toBe(12);
  });
});

describe("bloqueHabilidad", () => {
  const tarde = respuestaLaya("tdd", 0.83);

  it("reflejo y palabra pequeña llevan la TAJETA", () => {
    for (const capa of ["reflejo", "palabra-pequeña"] as const) {
      const texto = bloqueHabilidad(tarde, capa);
      expect(texto).toContain("TDD");
      expect(texto).toContain("rojo");
      expect(texto.length).toBeLessThan(600);
    }
  });

  it("palabra y razón con Bonsai llevan el RESUMEN", () => {
    for (const capa of ["palabra", "razón"] as const) {
      const texto = bloqueHabilidad(tarde, capa);
      expect(texto).toContain("costuras");
      expect(texto.length).toBeGreaterThan(bloqueHabilidad(tarde, "reflejo").length);
    }
  });

  it("profunda y nube llevan la REFERENCIA al texto completo", () => {
    for (const capa of ["profunda", "nube"] as const) {
      const texto = bloqueHabilidad(tarde, capa);
      expect(texto).toContain("vendor/habilidades/mattpocock-skills/engineering/tdd/SKILL.md");
    }
  });

  it("«ninguna» devuelve vacío en cualquier capa", () => {
    const ninguna = respuestaLaya(OPCION_NINGUNA, 0.97);
    for (const capa of ["reflejo", "razón", "nube"] as const) {
      expect(bloqueHabilidad(ninguna, capa)).toBe("");
    }
  });

  it("confianza por debajo del umbral devuelve vacío", () => {
    const dudosa = respuestaLaya("tdd", 0.5);
    expect(bloqueHabilidad(dudosa, "razón")).toBe("");
    // Con un umbral más bajo que la confianza baja, entra.
    expect(bloqueHabilidad(dudosa, "razón", 0.4)).toContain("TDD");
    expect(UMBRAL_CONFIANZA_DEFECTO).toBeGreaterThan(0.5);
  });

  it("la confianza que manda es la CALIBRADA (answer_confidence), no confidence", () => {
    // confidence alta (0.99) pero answer_confidence 0.4: se queda sin bloque.
    const engañosa = respuestaLaya("tdd", 0.4, 0.99);
    expect(engañosa.confianza).toBe(0.4);
    expect(bloqueHabilidad(engañosa, "palabra")).toBe("");
  });

  it("un id desconocido o una decision que no es choice devuelve vacío", () => {
    const fantasma = respuestaLaya("no-existe", 0.9);
    expect(bloqueHabilidad(fantasma, "razón")).toBe("");
    const noul = leerRespuesta({
      answers: { privacidad: { type: "noul", noul: 0.9, answer_confidence: 0.9 } },
    }).privacidad;
    expect(bloqueHabilidad(noul, "razón")).toBe("");
  });
});
