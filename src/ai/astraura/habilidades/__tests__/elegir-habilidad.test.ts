// Pruebas_PURAS de elegir-habilidad (Ola 1018L · LYS1018K): sin red, sin disco,
// sin modelos. Las respuestas de Laya de la PRUEBA usan su forma real
// (choice/probabilities/answer_confidence, y noul/score ajenos en el negativo).
import { describe, it, expect } from "vitest";
import { HABILIDADES_INGENIERIA } from "@/ai/astraura/skills-ingenieria";
import {
  CRITERIO_NINGUNA,
  NINGUNA,
  UMBRAL_HABILIDAD,
  bloqueHabilidad,
  preguntaHabilidad,
} from "../elegir-habilidad";

const TDD = HABILIDADES_INGENIERIA[0];
const REVISION = HABILIDADES_INGENIERIA[4]; // code-review

/** Respuesta de Laya con la forma REAL de systemone para una choice. */
function elegida(id: string, confianza = 0.88) {
  return {
    type: "choice",
    choice: id,
    probabilities: { [id]: 0.72, ninguna: 0.2, "code-review": 0.08 },
    answer_confidence: confianza,
  };
}

describe("UMBRAL_HABILIDAD", () => {
  it("sale del punto «habilidad.elegir» del catálogo de puntos", () => {
    expect(UMBRAL_HABILIDAD).toBe(0.6);
  });
});

describe("preguntaHabilidad", () => {
  it("arma la choice con el «cuando» de cada una y «ninguna»", () => {
    const p = preguntaHabilidad();
    expect(p.type).toBe("choice");
    expect(p.instructions).toContain("habilidad");
    expect(Object.keys(p.criteria)).toEqual([...HABILIDADES_INGENIERIA.map((h) => h.id), NINGUNA]);
    expect(p.criteria.ninguna).toBe(CRITERIO_NINGUNA);
    expect(p.criteria[TDD.id]).toBe(`${TDD.nombre}: ${TDD.cuando}`);
    expect(p.criteria[REVISION.id]).toBe(`${REVISION.nombre}: ${REVISION.cuando}`);
  });

  it("limita las opciones al subconjunto pedido y añade «ninguna»", () => {
    const p = preguntaHabilidad([TDD, REVISION]);
    expect(Object.keys(p.criteria)).toEqual([TDD.id, REVISION.id, NINGUNA]);
  });
});

describe("bloqueHabilidad · tamaño por capa", () => {
  it("tarjeta para reflejo, resumen para palabra y razón", () => {
    const reflejo = bloqueHabilidad(elegida("tdd"), "reflejo");
    expect(reflejo).toContain(`Habilidad «tdd» · ${TDD.nombre}`);
    expect(reflejo).toContain(TDD.tarjeta);
    expect(reflejo).not.toContain("TDD es el bucle");
    expect(bloqueHabilidad(elegida("tdd"), "palabra")).toContain("TDD es el bucle");
    expect(bloqueHabilidad(elegida("tdd"), "razon")).toContain("TDD es el bucle");
  });

  it("referencia a la guía completa para la capa profunda", () => {
    const bloque = bloqueHabilidad(elegida(REVISION.id), "profunda");
    expect(bloque).toContain("GUÍA COMPLETA");
    expect(bloque).toContain(REVISION.rutaCompleta);
    expect(bloque).not.toContain(REVISION.tarjeta);
  });

  it("el tamaño recibido en la llamada gana (palabra pequeña pide tarjeta)", () => {
    const bloque = bloqueHabilidad(elegida("tdd"), "palabra", UMBRAL_HABILIDAD, "tarjeta");
    expect(bloque).toBe(`Habilidad «tdd» · ${TDD.nombre}: ${TDD.tarjeta} (Matt Pocock, MIT).`);
  });
});

describe("bloqueHabilidad · reglas del punto", () => {
  it("nada que inyectar con «ninguna» aunque la confianza sea alta", () => {
    expect(bloqueHabilidad(elegida(NINGUNA, 0.99), "reflejo")).toBeNull();
  });

  it("con `answer_confidence` bajo el umbral no decide", () => {
    expect(bloqueHabilidad(elegida("tdd", 0.59), "reflejo")).toBeNull();
  });

  it("la `confidence` de OpenRouter (NO calibrada) NUNCA decide", () => {
    expect(
      bloqueHabilidad({ type: "choice", choice: "tdd", answer_confidence: null, confidence: 0.99 }, "reflejo"),
    ).toBeNull();
  });

  it("sin `choice` cae a la opción mayor de `probabilities`", () => {
    const r = {
      type: "choice",
      probabilities: { [REVISION.id]: 0.8, tdd: 0.1, ninguna: 0.1 },
      answer_confidence: 0.87,
    };
    expect(bloqueHabilidad(r, "reflejo")).toContain(`«${REVISION.id}»`);
  });

  it("un id desconocido o una forma rara se ignora sin lanzar", () => {
    expect(bloqueHabilidad(elegida("no-existe"), "reflejo")).toBeNull();
    expect(bloqueHabilidad({ type: "noul", noul: 0.9, probabilities: { sí: 0.9 }, answer_confidence: 0.9 }, "reflejo")).toBeNull();
    expect(bloqueHabilidad({ type: "score", score: "alta", probabilities: { alta: 0.9 }, answer_confidence: 0.9 }, "reflejo")).toBeNull();
    expect(bloqueHabilidad({}, "reflejo")).toBeNull();
    expect(bloqueHabilidad(null, "reflejo")).toBeNull();
    expect(bloqueHabilidad(undefined, "profunda")).toBeNull();
  });
});
