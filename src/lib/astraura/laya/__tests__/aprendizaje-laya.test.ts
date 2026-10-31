import { describe, it, expect } from "vitest";
import {
  anotar, casosDe, exportarJSONL, huellaEstado, MIN_CASOS_UMBRAL,
  umbralDeCatalogo, umbralRecalibrado, type CasoLaya, type RegistroAprendizaje,
} from "@/lib/astraura/laya/aprendizaje-laya";

// Registro y recalibrado del umbral de Laya (tarea M de architecture/laya-y-habilidades.md §6).

const caso = (extra: Partial<CasoLaya> = {}): CasoLaya => ({
  punto: "respuesta.basta", ambito: "a1", p: 0.9, donde: "a1", ms: 2000,
  resultado: "aceptada", estado: "Respuesta de ejemplo: noul sí", privado: false, ...extra,
});

// Respuestas reales de Laya (choice/score/noul, con `answer_confidence` calibrada): forma de ejemplo.
const formaChoice = { choice: "chat", probabilities: { chat: 0.71, ninguna: 0.29 }, confidence: 0.68, answer_confidence: 0.83 };
const formaScore = { score: "media", probabilities: [0.2, 0.6, 0.2], confidence: 0.55, answer_confidence: 0.62 };
const formaNoul = { answer: true, probabilities: [0.25, 0.75], confidence: 0.3, answer_confidence: 0.48 };
const pDe = (r: typeof formaChoice | typeof formaScore | typeof formaNoul) => r.answer_confidence;

describe("anotar", () => {
  it("guarda el caso completo cuando no es privado y no muta el registro", () => {
    const antes: RegistroAprendizaje = [];
    const despues = anotar(antes, caso({ punto: "plan.dificultad", ts: 1760000000000 }));
    expect(despues).toHaveLength(1);
    expect(despues[0].estado).toBe("Respuesta de ejemplo: noul sí");
    expect(despues[0].ts).toBe(1760000000000);
    expect(antes).toHaveLength(0);
  });

  it("cuando es privado guarda SOLO la huella del estado (determinista, sin Node)", () => {
    const reg = anotar([], caso({
      punto: "privacidad.subir", resultado: "corregida", privado: true,
      estado: "texto con teléfono 600·000·000 y saldos",
    }));
    expect(reg[0].privado).toBe(true);
    expect(reg[0].estado).toMatch(/^h[0-9a-f]{8}$/);
    expect(reg[0].estado).not.toContain("teléfono");
    expect(reg[0].estado).toBe(huellaEstado("texto con teléfono 600·000·000 y saldos"));
  });
});

describe("umbralRecalibrado", () => {
  it("devuelve el umbral del catálogo con menos de 30 casos del punto y ámbito", () => {
    expect(umbralRecalibrado([caso()], "privacidad.subir", "a1")).toBe(umbralDeCatalogo("privacidad.subir"));
    // 29 casos de otro ámbito no cuentan: siguen siendo de menos.
    const otroAmbito: RegistroAprendizaje = Array.from({ length: 29 }, () => caso({ ambito: "mac" }));
    expect(casosDe(otroAmbito, "respuesta.basta", "a1")).toHaveLength(0);
    expect(umbralRecalibrado([...otroAmbito, ...Array.from({ length: MIN_CASOS_UMBRAL - 1 }, () => caso())],
      "respuesta.basta", "a1")).toBe(umbralDeCatalogo("respuesta.basta"));
  });

  it("con punto desconocido y menos casos, el umbral por defecto (0,6)", () => {
    expect(umbralRecalibrado([], "punto.nuevo", "a1")).toBe(0.6);
  });

  it("con ≥ 30 casos elige el umbral que minimiza las correcciones", () => {
    const reg: RegistroAprendizaje = [
      ...Array.from({ length: 15 }, () => caso({ p: 0.9, resultado: "aceptada" })),
      ...Array.from({ length: 15 }, () => caso({ p: 0.4, resultado: "corregida" })),
    ];
    // Umbral 0,9: pasa lo bien decidido; 0,4 deja pasar las 15 corregidas. Gana 0,9.
    expect(umbralRecalibrado(reg, "respuesta.basta", "a1")).toBe(0.9);
  });

  it("empate de correcciones: mayor cobertura; y se conoce la forma calibrada de las respuestas", () => {
    const reg: RegistroAprendizaje = [
      ...Array.from({ length: 20 }, () => caso({ p: pDe(formaChoice), resultado: "aceptada" })),
      ...Array.from({ length: 10 }, () => caso({ p: pDe(formaNoul), resultado: "aceptada" })),
    ];
    expect(umbralRecalibrado(reg, "respuesta.basta", "a1")).toBe(0.48);
    expect(pDe(formaScore)).toBeLessThan(1);
  });
});

describe("exportarJSONL", () => {
  it("saca solo los casos no privados, una línea JSON por caso, sin la marca «privado»", () => {
    const reg = anotar(anotar([], caso({
      punto: "voz.tono", resultado: "escalada", estado: "tono sereno", ts: 123,
    })), caso({ punto: "privacidad.subir", privado: true, estado: "dato privado" }));
    const jsonl = exportarJSONL(reg);
    const lineas = jsonl.split("\n").filter((l) => l.trim() !== "");
    expect(lineas).toHaveLength(1);
    const obj = JSON.parse(lineas[0]) as Record<string, unknown>;
    expect(obj).toEqual({
      punto: "voz.tono", ambito: "a1", p: 0.9, donde: "a1", ms: 2000,
      resultado: "escalada", estado: "tono sereno", ts: 123,
    });
    expect(obj.privado).toBeUndefined();
  });

  it("devuelve cadena vacía si todo es privado", () => {
    expect(exportarJSONL([caso({ privado: true, estado: "x" })])).toBe("");
  });
});
