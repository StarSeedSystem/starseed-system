// Pruebas del aprendizaje y recalibrado de Laya (tarea M de la Ola 1018L).
// Solo funciones PURAS: sin red, sin disco y sin modelos. Las respuestas de Laya de ejemplo
// tienen la forma real de System One (choice/probabilities/answer_confidence, score y noul).
import { describe, it, expect } from "vitest";
import {
  anotar, exportarJSONL, huella, umbralRecalibrado, MIN_CASOS_RECALIBRAR,
  type CasoAprendizaje, type EntradaAnotacion, type ResultadoLaya,
} from "../aprendizaje-laya";

const caso = (cambios: Partial<CasoAprendizaje> = {}): CasoAprendizaje => ({
  punto: "reflejo.herramienta", ambito: "a1", p: 0.8, donde: "a1", ms: 210,
  resultado: "aceptada", privado: false, estado: "texto de prueba", ...cambios,
});

const entrada = (cambios: Partial<EntradaAnotacion> = {}): EntradaAnotacion => ({
  punto: "reflejo.herramienta", ambito: "a1", p: 0.8, donde: "a1", ms: 210,
  resultado: "aceptada", privado: false, estado: "texto de prueba", ...cambios,
});

const repite = (n: number, resultado: ResultadoLaya, p: number, punto: string, ambito: string): CasoAprendizaje[] =>
  Array.from({ length: n }, (_, i) => caso({ punto, ambito, p, resultado, estado: `caso ${i}` }));

// Respuestas reales de Laya: la confianza que decide es answer_confidence (calibrada), no confidence.
const RESPUESTA_CHOICE = { choice: "chat", probabilities: { chat: 0.71, ninguna: 0.29 }, confidence: 0.68, answer_confidence: 0.83 };
const RESPUESTA_SCORE = { score: "media", probabilities: [0.2, 0.6, 0.2], confidence: 0.55, answer_confidence: 0.62 };
const RESPUESTA_NOUL = { answer: true, probabilities: [0.25, 0.75], confidence: 0.3, answer_confidence: 0.48 };

describe("anotar", () => {
  it("guarda el caso completo cuando no es privado y no muta el registro", () => {
    const previo = [caso()];
    const nuevo = anotar(previo, entrada({ punto: "voz.tono", estado: "tono cálido" }));
    expect(previo).toHaveLength(1);
    expect(nuevo).toHaveLength(2);
    expect(nuevo[1]).toMatchObject({ punto: "voz.tono", estado: "tono cálido", privado: false });
  });

  it("guarda SOLO una huella cuando es privado", () => {
    const nuevo = anotar([], entrada({ privado: true, estado: "mi teléfono es +34 600 123 456" }));
    expect(nuevo[0].estado).toMatch(/^h[0-9a-f]{8}$/);
    expect(nuevo[0].estado).not.toContain("teléfono");
    expect(nuevo[0].estado).toBe(huella("mi teléfono es +34 600 123 456"));
    expect(nuevo[0].privado).toBe(true);
  });

  it("la huella es estable y distingue estados distintos", () => {
    expect(huella("hola")).toBe(huella("hola"));
    expect(huella("hola")).not.toBe(huella("adiós"));
  });

  it("usa answer_confidence (calibrada) y no confidence", () => {
    const choice = anotar([], entrada({ p: RESPUESTA_CHOICE.answer_confidence }));
    expect(choice[0].p).toBe(0.83);
    expect(choice[0].p).not.toBe(RESPUESTA_CHOICE.confidence);
    const score = anotar([], entrada({ p: RESPUESTA_SCORE.answer_confidence }));
    const noul = anotar([], entrada({ p: RESPUESTA_NOUL.answer_confidence }));
    expect(score[0].p).toBe(0.62);
    expect(noul[0].p).toBe(0.48);
  });

  it("acota p a [0, 1] y los milisegundos a enteros no negativos", () => {
    expect(anotar([], entrada({ p: 1.4, ms: 210.6 }))[0]).toMatchObject({ p: 1, ms: 211 });
    expect(anotar([], entrada({ p: -0.2, ms: -5 }))[0]).toMatchObject({ p: 0, ms: 0 });
    expect(anotar([], entrada({ p: Number.NaN }))[0].p).toBe(0);
  });
});

describe("umbralRecalibrado", () => {
  it("con menos de 30 casos conserva el umbral del catálogo", () => {
    const pocos = repite(MIN_CASOS_RECALIBRAR - 1, "corregida", 0.9, "respuesta.basta", "a1");
    expect(umbralRecalibrado(pocos, "respuesta.basta", "a1")).toBe(0.6);
    expect(umbralRecalibrado([], "privacidad.subir", "personal")).toBe(0.5);
  });

  it("usa UMBRAL_POR_DEFECTO si el punto no está en el catálogo", () => {
    expect(umbralRecalibrado([], "punto.inventado", "a1")).toBe(0.6);
  });

  it("con 30 casos separables sube el umbral sobre las correcciones", () => {
    const reg = [...repite(15, "aceptada", 0.85, "plan.dificultad", "mac"), ...repite(15, "corregida", 0.65, "plan.dificultad", "mac")];
    expect(reg).toHaveLength(MIN_CASOS_RECALIBRAR);
    expect(umbralRecalibrado(reg, "plan.dificultad", "mac")).toBe(0.85);
  });

  it("si el umbral del catálogo ya separa, no lo mueve", () => {
    const reg = [...repite(15, "aceptada", 0.85, "plan.dificultad", "mac"), ...repite(15, "corregida", 0.4, "plan.dificultad", "mac")];
    expect(umbralRecalibrado(reg, "plan.dificultad", "mac")).toBe(0.6);
  });

  it("solo cuenta los casos del mismo punto y ámbito", () => {
    const reg = [...repite(30, "corregida", 0.9, "plan.dificultad", "mac"), ...repite(30, "aceptada", 0.55, "plan.dificultad", "a1")];
    expect(umbralRecalibrado(reg, "plan.dificultad", "mac")).toBe(1);
    expect(umbralRecalibrado(reg, "plan.dificultad", "a1")).toBe(0.55);
  });
});

describe("exportarJSONL", () => {
  it("saca solo los casos no privados en líneas JSONL con state y preguntas", () => {
    const reg = anotar(anotar([], entrada({ punto: "voz.tono", ambito: "general", estado: "tono neutro" })),
      entrada({ punto: "privacidad.subir", ambito: "privado", privado: true, estado: "dato privado" }));
    const lineas = exportarJSONL(reg).split("\n").filter((l) => l.trim().length > 0);
    expect(lineas).toHaveLength(1);
    const fila = JSON.parse(lineas[0]) as Record<string, unknown>;
    expect(fila.punto).toBe("voz.tono");
    expect(fila.state).toBe("tono neutro");
    expect(fila.privado).toBeUndefined();
    expect(fila.questions).toBeTypeOf("object");
  });

  it("devuelve cadena vacía si todos los casos son privados", () => {
    expect(exportarJSONL([caso({ privado: true, estado: huella("secreto") })])).toBe("");
  });
});
