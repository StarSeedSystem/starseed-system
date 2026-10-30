import { describe, it, expect } from "vitest";
import { paraLlamaFactory, permitido, parteDe, type DestinoModelo } from "../dataset-llamafactory";
import type { Experiencia } from "../../experiencias";
import type { AjustesAprendizaje } from "../../experiencias-aprendizaje";

const AJUSTES: AjustesAprendizaje = {
  aprendizajeColectivo: true,
  porAmbito: { salud: { permite: true, privacidad: "ambito" } },
};
const OP = { ambito: "salud", destino: "privado" as DestinoModelo, nombre: "salud" };

function exp(cambios: Partial<Experiencia> = {}): Experiencia {
  return {
    id: "e1",
    t: "2026-10-30 10:00:00",
    medio: "os-web",
    capa: "llm",
    tipo: "valoracion",
    dominio: "salud",
    entrada: "¿Qué es la fiebre?",
    salida: "Una temperatura corporal elevada.",
    confianza: null,
    ms: null,
    resultado: null,
    ambito: "salud",
    valoracion: "positiva",
    ...cambios,
  };
}

describe("permitido", () => {
  it("el destino privado siempre se permite", () => {
    expect(permitido("privado", "salud", { aprendizajeColectivo: false, porAmbito: {} }).ok).toBe(true);
  });

  it("el ámbito exige consentimiento y privacidad no privada", () => {
    expect(permitido("ambito", "salud", AJUSTES).ok).toBe(true);
    const apagado = { ...AJUSTES, aprendizajeColectivo: false };
    expect(permitido("ambito", "salud", apagado)).toEqual({ ok: false, motivo: expect.any(String) });
    const privado = { aprendizajeColectivo: true, porAmbito: { salud: { permite: true, privacidad: "privada" as const } } };
    expect(permitido("publico", "salud", privado).ok).toBe(false);
  });
});

describe("paraLlamaFactory", () => {
  it("una valoración positiva produce SFT y KTO aprobado", () => {
    const r = paraLlamaFactory([exp()], AJUSTES, OP);
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages).toEqual([
      { role: "user", content: "¿Qué es la fiebre?" },
      { role: "assistant", content: "Una temperatura corporal elevada." },
    ]);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(true);
    expect(r.sft[0].parte).toBe(r.kto[0].parte);
  });

  it("una valoración negativa solo produce KTO suspendido", () => {
    const r = paraLlamaFactory([exp({ valoracion: "negativa" })], AJUSTES, OP);
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(false);
  });

  it("una corrección produce SFT corregido, KTO suspendido y KTO aprobado", () => {
    const corregida = "La fiebre es una respuesta defensiva del cuerpo.";
    const r = paraLlamaFactory([exp({ tipo: "correccion", valoracion: "negativa", correccion: corregida })], AJUSTES, OP);
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages[1].content).toBe(corregida);
    expect(r.kto.map((k) => k.label)).toEqual([false, true]);
    expect(r.kto[0].messages[1].content).toBe("Una temperatura corporal elevada.");
    expect(r.kto[1].messages[1].content).toBe(corregida);
  });

  it("un ámbito privado no alimenta un corpus público", () => {
    const ajustes: AjustesAprendizaje = {
      aprendizajeColectivo: true,
      porAmbito: { salud: { permite: true, privacidad: "privada" } },
    };
    const r = paraLlamaFactory([exp()], ajustes, { ...OP, destino: "publico" });
    expect(r.sft).toEqual([]);
    expect(r.kto).toEqual([]);
    expect(r.descartadas).toEqual({ bloqueado: 1 });
  });

  it("descarta textos con pinta de secreto", () => {
    const r = paraLlamaFactory([exp({ salida: "usa sk-abcdefghijklmnop16 y listo" })], AJUSTES, OP);
    expect(r.sft).toEqual([]);
    expect(r.kto).toEqual([]);
    expect(r.descartadas.secreto).toBe(1);
  });

  it("descarta duplicados exactos una sola vez", () => {
    const r = paraLlamaFactory([exp(), exp({ id: "e2" })], AJUSTES, OP);
    expect(r.sft).toHaveLength(1);
    expect(r.kto).toHaveLength(1);
    expect(r.descartadas.duplicado).toBe(1);
  });

  it("reparte 80/10/10 de forma estable y suma las filas SFT", () => {
    const r = paraLlamaFactory([exp(), exp({ id: "e2", entrada: "¿Qué es la tos?" })], AJUSTES, OP);
    expect(r.partes.train + r.partes.val + r.partes.test).toBe(r.sft.length);
    expect(r.sft[0].parte).toBe(parteDe("e1"));
    const otra = paraLlamaFactory([exp()], AJUSTES, OP);
    expect(otra.sft[0].parte).toBe(r.sft[0].parte);
  });

  it("declara las dos entradas de dataset_info.json con kto_tag", () => {
    const r = paraLlamaFactory([exp()], AJUSTES, OP);
    expect(r.info["salud_sft"]).toMatchObject({
      formatting: "sharegpt",
      columns: { messages: "messages" },
      tags: { role_tag: "role", content_tag: "content" },
    });
    expect(r.info["salud_kto"]).toMatchObject({ columns: { messages: "messages", kto_tag: "label" } });
  });
});
