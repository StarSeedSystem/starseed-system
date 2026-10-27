// Pruebas del conversor a datasets de LlamaFactory: solo funciones puras (sin red, sin disco).
import { describe, expect, it } from "vitest";

import { permitido, paraLlamaFactory } from "../dataset-llamafactory";
import type { Experiencia } from "../../experiencias";
import type { AjustesAprendizaje } from "../../experiencias-aprendizaje";

const AJUSTES: AjustesAprendizaje = {
  aprendizajeColectivo: true,
  porAmbito: {
    salud: { permite: true, privacidad: "ambito" },
    red: { permite: true, privacidad: "publica" },
    diario: { permite: true, privacidad: "privada" },
  },
};

const OP = { ambito: "salud", destino: "ambito" as const, nombre: "salud-v1" };

function exp(parcial: Partial<Experiencia>): Experiencia {
  return { id: "e", t: "10:00", medio: "os-web", capa: "llm", tipo: "valoracion", dominio: "salud",
    entrada: "¿Qué es la respiración?", salida: "Es la función que intercambia gases.",
    confianza: null, ms: null, resultado: true, ...parcial };
}

describe("permitido · regla de privacidad de Astraura", () => {
  it("«privado» siempre vale, sin mirar los ajustes", () => {
    expect(permitido("privado", "salud", { aprendizajeColectivo: false, porAmbito: {} }).ok).toBe(true);
  });

  it("«ambito» exige aprendizaje colectivo y el permiso del ámbito", () => {
    const sin = permitido("ambito", "salud", { ...AJUSTES, aprendizajeColectivo: false });
    expect(sin.ok).toBe(false);
    expect(permitido("ambito", "salud", AJUSTES).ok).toBe(true);
    expect(permitido("ambito", "ajeno", AJUSTES).ok).toBe(false);
  });

  it("«publico» exige privacidad «publica»", () => {
    expect(permitido("publico", "salud", AJUSTES).ok).toBe(false);
    expect(permitido("publico", "red", AJUSTES).ok).toBe(true);
  });
});

describe("paraLlamaFactory · valoraciones y correcciones a SFT y KTO", () => {
  it("valoración positiva ⇒ fila SFT con la salida y fila KTO con label true", () => {
    const r = paraLlamaFactory([exp({ id: "p1", valoracion: "positiva" })], AJUSTES, OP);
    expect(r.sft[0]?.messages).toEqual([
      { role: "user", content: "¿Qué es la respiración?" },
      { role: "assistant", content: "Es la función que intercambia gases." },
    ]);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0]?.label).toBe(true);
  });

  it("valoración negativa ⇒ solo KTO con label false, sin SFT", () => {
    const r = paraLlamaFactory([exp({ id: "n1", valoracion: "negativa" })], AJUSTES, OP);
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0]?.label).toBe(false);
  });

  it("corrección ⇒ SFT con el texto corregido, KTO false (original) y KTO true (corregido)", () => {
    const e = exp({ id: "c1", tipo: "correccion", valoracion: "negativa", salida: "Es respirar rápido.", correccion: "Es el intercambio de gases." });
    const r = paraLlamaFactory([e], AJUSTES, OP);
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0]?.messages[1]?.content).toBe("Es el intercambio de gases.");
    const falsa = r.kto.find((f) => !f.label);
    const verdadera = r.kto.find((f) => f.label);
    expect(falsa?.messages[1]?.content).toBe("Es respirar rápido.");
    expect(verdadera?.messages[1]?.content).toBe("Es el intercambio de gases.");
    expect(r.kto).toHaveLength(2);
  });

  it("ámbito privado con destino público ⇒ bloqueado y todo vacío", () => {
    const r = paraLlamaFactory([exp({ id: "b1", valoracion: "positiva", ambito: "diario" })], AJUSTES, { ambito: "diario", destino: "publico", nombre: "diario-v1" });
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.info).toEqual({});
    expect(r.descartadas.bloqueado).toBe(1);
  });

  it("los secretos (sk-…, PEM) se descartan y no llegan al dataset", () => {
    const r = paraLlamaFactory([
      exp({ id: "s1", valoracion: "positiva", salida: "usa sk-abcdef0123456789abcdef como clave" }),
      exp({ id: "s2", valoracion: "positiva", salida: "-----BEGIN PRIVATE KEY-----" }),
    ], AJUSTES, OP);
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.descartadas.secreto).toBe(2);
  });

  it("el duplicado exacto se descarta y solo queda la primera", () => {
    const r = paraLlamaFactory([exp({ id: "d1", valoracion: "positiva" }), exp({ id: "d2", valoracion: "positiva" })], AJUSTES, OP);
    expect(r.sft).toHaveLength(1);
    expect(r.kto).toHaveLength(1);
    expect(r.descartadas.duplicado).toBe(1);
  });

  it("el reparto por id es estable y la suma de partes = filas SFT", () => {
    const exps = Array.from({ length: 10 }, (_, i) =>
      exp({ id: `fila-${i}`, tipo: i % 3 === 0 ? "correccion" : "valoracion", valoracion: i % 2 === 0 ? "positiva" : "negativa", correccion: `arreglo ${i}` }),
    );
    const r1 = paraLlamaFactory(exps, AJUSTES, OP);
    const r2 = paraLlamaFactory(exps, AJUSTES, OP);
    expect(r1.sft.map((f) => f.parte)).toEqual(r2.sft.map((f) => f.parte));
    const suma = r1.partes.train + r1.partes.val + r1.partes.test;
    expect(suma).toBe(r1.sft.length);
    expect(r1.partes.train).toBeGreaterThanOrEqual(r1.partes.val + r1.partes.test);
  });

  it("info declara las dos entradas de dataset_info.json (SFT y KTO)", () => {
    const r = paraLlamaFactory([exp({ id: "i1", valoracion: "positiva" })], AJUSTES, OP);
    expect(r.info["salud-v1_sft"]?.file_name).toBe("salud-v1_sft.json");
    expect(r.info["salud-v1_sft"]?.columns.messages).toBe("messages");
    expect(r.info["salud-v1_kto"]?.columns.kto_tag).toBe("label");
    expect(r.info["salud-v1_kto"]?.tags.content_tag).toBe("content");
  });
});
