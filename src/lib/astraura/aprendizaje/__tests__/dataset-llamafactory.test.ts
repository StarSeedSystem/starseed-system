import { describe, expect, it } from "vitest";

import type { Experiencia } from "../../experiencias";
import type { AjustesAprendizaje } from "../../experiencias-aprendizaje";
import { paraLlamaFactory, parteDe, permitido } from "../dataset-llamafactory";

function exp(parcial: Partial<Experiencia> & { id: string }): Experiencia {
  return {
    t: "2026-10-29 00:00:00",
    medio: "os-web",
    capa: "llm",
    tipo: "valoracion",
    dominio: "salud",
    entrada: "¿Cómo cuido mi espalda?",
    salida: "Con pausas activas.",
    confianza: null,
    ms: null,
    resultado: null,
    ...parcial,
  };
}

const abierto: AjustesAprendizaje = {
  aprendizajeColectivo: true,
  porAmbito: { salud: { permite: true, privacidad: "ambito" } },
};

const op = { ambito: "salud", destino: "privado" as const, nombre: "salud" };

describe("paraLlamaFactory", () => {
  it("una valoración positiva produce SFT y KTO aprobado", () => {
    const d = paraLlamaFactory([exp({ id: "a1", valoracion: "positiva" })], abierto, op);
    expect(d.sft).toHaveLength(1);
    expect(d.kto).toHaveLength(1);
    expect(d.kto[0].label).toBe(true);
    expect(d.sft[0].messages).toEqual([
      { role: "user", content: "¿Cómo cuido mi espalda?" },
      { role: "assistant", content: "Con pausas activas." },
    ]);
    expect(d.descartadas).toEqual({});
    const sftInfo = d.info.salud_sft as { columns: Record<string, string> };
    const ktoInfo = d.info.salud_kto as { columns: Record<string, string> };
    expect(sftInfo.columns.messages).toBe("messages");
    expect(sftInfo.columns.kto_tag).toBeUndefined();
    expect(ktoInfo.columns.kto_tag).toBe("label");
  });

  it("una valoración negativa solo produce KTO suspenso", () => {
    const d = paraLlamaFactory([exp({ id: "a2", valoracion: "negativa" })], abierto, op);
    expect(d.sft).toHaveLength(0);
    expect(d.kto).toHaveLength(1);
    expect(d.kto[0].label).toBe(false);
  });

  it("una corrección produce SFT corregido y KTO suspenso del original y aprobado del corregido", () => {
    const e = exp({ id: "a3", tipo: "correccion", valoracion: "negativa", salida: "original", correccion: "corregida" });
    const d = paraLlamaFactory([e], abierto, op);
    expect(d.sft).toHaveLength(1);
    expect(d.sft[0].messages[1].content).toBe("corregida");
    expect(d.kto.map((k) => [k.messages[1].content, k.label])).toEqual([
      ["original", false],
      ["corregida", true],
    ]);
  });

  it("bloquea el destino público cuando el ámbito es privado", () => {
    const ajustes: AjustesAprendizaje = {
      aprendizajeColectivo: true,
      porAmbito: { salud: { permite: true, privacidad: "privada" } },
    };
    const d = paraLlamaFactory(
      [exp({ id: "a4", valoracion: "positiva" })],
      ajustes,
      { ambito: "salud", destino: "publico", nombre: "salud" },
    );
    expect(d.sft).toEqual([]);
    expect(d.kto).toEqual([]);
    expect(d.descartadas).toEqual({ bloqueado: 1 });
    expect(d.info).toEqual({});
  });

  it("descarta textos con pinta de secreto", () => {
    const e = exp({ id: "a5", valoracion: "positiva", salida: "clave sk-ABCDEFGHIJKLMNOP1234" });
    const d = paraLlamaFactory([e], abierto, op);
    expect(d.sft).toEqual([]);
    expect(d.kto).toEqual([]);
    expect(d.descartadas).toEqual({ secreto: 1 });
  });

  it("descarta duplicados exactos de entrada y respuesta", () => {
    const una = exp({ id: "a6", valoracion: "positiva" });
    const otra = exp({ id: "a7", valoracion: "positiva" });
    const d = paraLlamaFactory([una, otra], abierto, op);
    expect(d.sft).toHaveLength(1);
    expect(d.kto).toHaveLength(1);
    expect(d.descartadas.duplicado).toBe(2);
  });

  it("reparte de forma estable y la suma de partes cuadra con las filas SFT", () => {
    const exps = Array.from({ length: 20 }, (_, i) => exp({ id: `b${i}`, valoracion: "positiva" }));
    const d = paraLlamaFactory(exps, abierto, op);
    expect(parteDe("b7")).toBe(parteDe("b7"));
    expect(d.sft.every((fila) => fila.parte === parteDe(fila.id))).toBe(true);
    expect(d.partes.train + d.partes.val + d.partes.test).toBe(d.sft.length);
  });
});

describe("permitido", () => {
  it("lo privado siempre se permite y lo público exige privacidad pública", () => {
    expect(permitido("privado", "salud", { aprendizajeColectivo: false, porAmbito: {} })).toEqual({ ok: true });
    expect(permitido("publico", "salud", abierto).ok).toBe(false);
    const publico: AjustesAprendizaje = {
      aprendizajeColectivo: true,
      porAmbito: { salud: { permite: true, privacidad: "publica" } },
    };
    expect(permitido("publico", "salud", publico)).toEqual({ ok: true });
  });
});


