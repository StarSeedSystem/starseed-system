// Tests puros del registro y recalibrado de Laya (Ola 1018L · LYS1018M). Respuestas de ejemplo
// con la forma real de system_one (choice/probabilities/answer_confidence, score, noul), sin red.
import { describe, it, expect } from "vitest";
import {
  anotar, exportarJSONL, huellaEstado, umbralRecalibrado, MIN_CASOS_RECALIBRADO,
  type EntradaAnotacion, type RegistroLaya,
} from "../aprendizaje-laya";
import { UMBRAL_POR_DEFECTO } from "../puntos-decision";

const RESPUESTA_LAYA = {
  answers: {
    herramienta: { choice: "chat", probabilities: { chat: 0.71, voz: 0.05, tarea: 0.24 }, confidence: 0.68, answer_confidence: 0.83 },
    dificultad: { score: 1.5, probabilities: [0.4, 0.45, 0.15], confidence: 0.52, answer_confidence: 0.7 },
    basta_pequeno: { noul: 0.42, confidence: 0.44, answer_confidence: 0.61 },
  },
};

const entrada = (cambios: Partial<EntradaAnotacion> = {}): EntradaAnotacion => ({
  punto: "respuesta.basta", ambito: "perfil:alex", p: RESPUESTA_LAYA.answers.basta_pequeno.answer_confidence,
  donde: "a1", ms: 2100, resultado: "aceptada", privado: false, estado: "¿Basta un modelo pequeño?", ...cambios,
});

const anotarN = (n: number, cambios: Partial<EntradaAnotacion> = {}, registro: RegistroLaya = []): RegistroLaya => {
  let r = registro;
  for (let i = 0; i < n; i++) r = anotar(r, entrada(cambios));
  return r;
};

describe("anotar", () => {
  it("añade el caso sin mutar el registro y guarda el texto si no es privado", () => {
    const original = anotarN(1);
    const nuevo = anotar(original, entrada({ estado: "Texto libre de prueba" }));
    expect(original).toHaveLength(1);
    expect(nuevo).toHaveLength(2);
    expect(nuevo[1]).toMatchObject({ estado: "Texto libre de prueba", privado: false });
    expect(nuevo[1].huella).toBeUndefined();
  });

  it("si es privado guarda SOLO la huella: ni estado ni texto", () => {
    const registro = anotar([], entrada({ privado: true, estado: "Mi teléfono es +34 600 123 456" }));
    expect(registro[0].estado).toBeUndefined();
    expect(registro[0].huella).toBe(huellaEstado("Mi teléfono es +34 600 123 456"));
    expect(JSON.stringify(registro)).not.toContain("teléfono");
  });

  it("usa answer_confidence (calibrada) y no confidence", () => {
    const p = RESPUESTA_LAYA.answers.herramienta.answer_confidence;
    const registro = anotar([], entrada({ punto: "reflejo.herramienta", p }));
    expect(registro[0].p).toBe(0.83);
    expect(registro[0].p).not.toBe(RESPUESTA_LAYA.answers.herramienta.confidence);
  });

  it("rechaza p fuera de [0,1], ms negativo y resultado desconocido", () => {
    expect(() => anotar([], entrada({ p: 1.2 }))).toThrow(/answer_confidence/);
    expect(() => anotar([], entrada({ ms: -1 }))).toThrow(/ms/);
    expect(() => anotar([], entrada({ resultado: "otra" as EntradaAnotacion["resultado"] }))).toThrow(/resultado/);
  });
});

describe("huellaEstado", () => {
  it("es estable, distinta por texto y de 16 hex sin revelar el texto", () => {
    expect(huellaEstado("hola")).toBe(huellaEstado("hola"));
    expect(huellaEstado("hola")).not.toBe(huellaEstado("adiós"));
    expect(huellaEstado("hola")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("umbralRecalibrado", () => {
  it("con menos de 30 casos devuelve el umbral del catálogo", () => {
    const registro = anotarN(MIN_CASOS_RECALIBRADO - 1, { p: 0.9, resultado: "corregida" });
    expect(umbralRecalibrado(registro, "respuesta.basta", "perfil:alex")).toBe(0.6);
    expect(umbralRecalibrado([], "punto.desconocido", "perfil:alex")).toBe(UMBRAL_POR_DEFECTO);
  });

  it("con ≥ 30 casos sube el umbral para no aceptar lo corregido", () => {
    let r = anotarN(15, { p: 0.8, resultado: "corregida" });
    r = anotarN(15, { p: 0.9, resultado: "aceptada" }, r);
    const t = umbralRecalibrado(r, "respuesta.basta", "perfil:alex");
    expect(t).toBeGreaterThan(0.8);
    expect(t).toBeLessThanOrEqual(0.9);
  });

  it("baja el umbral si todos los casos se aceptaron sin corrección", () => {
    const registro = anotarN(MIN_CASOS_RECALIBRADO, { p: 0.4, resultado: "aceptada" });
    expect(umbralRecalibrado(registro, "respuesta.basta", "perfil:alex")).toBe(0.4);
  });

  it("no mezcla puntos ni ámbitos distintos", () => {
    let r = anotarN(15, { p: 0.8, resultado: "corregida" });
    r = anotarN(15, { p: 0.9, resultado: "aceptada" }, r);
    const conOtro = anotarN(MIN_CASOS_RECALIBRADO, { ambito: "grupo:otro", p: 0.95, resultado: "corregida" }, r);
    expect(umbralRecalibrado(conOtro, "respuesta.basta", "perfil:alex")).toBe(0.85);
  });
});

describe("exportarJSONL", () => {
  it("saca una línea por caso no privado, con state/questions y sin privados", () => {
    let r = anotar([], entrada({ estado: "Caso público A" }));
    r = anotar(r, entrada({ estado: "Caso privado B", privado: true }));
    r = anotar(r, entrada({ estado: "Caso público C", punto: "reflejo.herramienta" }));
    const jsonl = exportarJSONL(r);
    const filas = jsonl.trim().split("\n").map((linea) => JSON.parse(linea) as Record<string, unknown>);
    expect(filas).toHaveLength(2);
    expect(jsonl).not.toContain("Caso privado B");
    expect(filas[0]).toMatchObject({ state: "Caso público A", punto: "respuesta.basta",
      answer_confidence: 0.61, resultado: "aceptada", donde: "a1", ms: 2100 });
    expect(filas[0].questions).toHaveProperty("basta");
    expect(filas[1].questions).toHaveProperty("herramienta");
    expect(jsonl.endsWith("\n")).toBe(true);
    expect(exportarJSONL([anotar([], entrada({ privado: true }))])).toBe("");
  });
});
