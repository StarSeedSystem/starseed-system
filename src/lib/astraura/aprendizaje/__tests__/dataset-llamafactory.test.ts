// Pruebas del convertidor de experiencias a datasets SFT/KTO de LlamaFactory.
import { describe, it, expect } from "vitest";
import type { Experiencia, TipoExperiencia } from "../../experiencias";
import type { AjustesAprendizaje } from "../../experiencias-aprendizaje";
import { paraLlamaFactory, permitido } from "../dataset-llamafactory";

const AJUSTES: AjustesAprendizaje = {
  aprendizajeColectivo: true,
  porAmbito: { salud: { permite: true, privacidad: "ambito" }, secreto: { permite: true, privacidad: "privada" } },
};

function exp(overrides: Partial<Experiencia> & { id: string; tipo: TipoExperiencia }): Experiencia {
  return {
    t: "", medio: "os-web", capa: "llm", dominio: "salud", entrada: "", salida: "",
    confianza: null, ms: null, resultado: null, ...overrides,
  };
}

const OP = { ambito: "salud", destino: "ambito" as const, nombre: "salud" };

describe("permitido", () => {
  it("permite siempre el destino privado", () => {
    expect(permitido("privado", "salud", { aprendizajeColectivo: false, porAmbito: {} }).ok).toBe(true);
  });

  it("bloquea «publico» con ámbito de privacidad «privada»", () => {
    const r = permitido("publico", "secreto", AJUSTES);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBeTruthy();
  });
});

describe("paraLlamaFactory", () => {
  it("positiva ⇒ fila SFT y KTO con label true", () => {
    const r = paraLlamaFactory(
      [exp({ id: "p1", tipo: "valoracion", entrada: "¿qué como?", salida: "fruta", valoracion: "positiva" })],
      AJUSTES,
      OP,
    );
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages).toEqual([
      { role: "user", content: "¿qué como?" },
      { role: "assistant", content: "fruta" },
    ]);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(true);
    expect(r.descartadas).toEqual({});
  });

  it("negativa ⇒ solo KTO con label false", () => {
    const r = paraLlamaFactory(
      [exp({ id: "n1", tipo: "valoracion", entrada: "¿qué como?", salida: "piedras", valoracion: "negativa" })],
      AJUSTES,
      OP,
    );
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(false);
  });

  it("corrección ⇒ SFT con el texto corregido, KTO false (original) y KTO true (corregido)", () => {
    const r = paraLlamaFactory(
      [exp({ id: "c1", tipo: "correccion", entrada: "¿qué como?", salida: "piedras", correccion: "fruta" })],
      AJUSTES,
      OP,
    );
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages[1]).toEqual({ role: "assistant", content: "fruta" });
    expect(r.kto.map((f) => [f.label, f.messages[1].content])).toEqual([
      [false, "piedras"],
      [true, "fruta"],
    ]);
  });

  it("ámbito privado con destino público ⇒ bloqueado y todo vacío", () => {
    const r = paraLlamaFactory(
      [exp({ id: "s1", tipo: "valoracion", entrada: "a", salida: "b", valoracion: "positiva" })],
      { ...AJUSTES, porAmbito: { salud: { permite: true, privacidad: "privada" } } },
      { ...OP, destino: "publico" },
    );
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.descartadas).toEqual({ bloqueado: 1 });
  });

  it("descarta textos con pinta de secreto", () => {
    const r = paraLlamaFactory(
      [exp({ id: "k1", tipo: "valoracion", entrada: "mi clave sk-AbCdEf1234567890ab", salida: "ok", valoracion: "positiva" })],
      AJUSTES,
      OP,
    );
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.descartadas).toEqual({ secreto: 1 });
  });

  it("descarta duplicados exactos y cuenta el motivo", () => {
    const base = { tipo: "valoracion" as const, entrada: "e", salida: "s", valoracion: "positiva" as const };
    const r = paraLlamaFactory([exp({ id: "d1", ...base }), exp({ id: "d2", ...base })], AJUSTES, OP);
    expect(r.sft).toHaveLength(1);
    expect(r.kto).toHaveLength(1);
    expect(r.descartadas).toEqual({ duplicado: 1 });
  });

  it("reparto estable por id y las partes suman las filas SFT", () => {
    const exps = ["aa", "bb", "cc", "dd", "ee"].map((id, i) =>
      exp({ id, tipo: "valoracion", entrada: `pregunta ${i}`, salida: `respuesta ${i}`, valoracion: "positiva" }),
    );
    const r1 = paraLlamaFactory(exps, AJUSTES, OP);
    const r2 = paraLlamaFactory(exps, AJUSTES, OP);
    expect(r1.sft.map((f) => f.parte)).toEqual(r2.sft.map((f) => f.parte));
    expect(r1.partes.train + r1.partes.val + r1.partes.test).toBe(r1.sft.length);
  });
});
