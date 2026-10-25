// Pruebas del convertidor a datasets de LlamaFactory: solo funciones puras.
import { describe, it, expect } from "vitest";
import type { Experiencia } from "../../experiencias";
import type { AjustesAprendizaje } from "../../experiencias-aprendizaje";
import { permitido, paraLlamaFactory } from "../dataset-llamafactory";

function exp(parche: Partial<Experiencia>): Experiencia {
  return {
    id: "id1", t: "2026-10-25", medio: "os-web", capa: "llm",
    tipo: "valoracion", dominio: "salud", entrada: "¿qué soy?",
    salida: "una persona", confianza: null, ms: null, resultado: null,
    valoracion: "positiva", ambito: "salud",
    ...parche,
  };
}

const AJUSTES: AjustesAprendizaje = {
  aprendizajeColectivo: true,
  porAmbito: { salud: { permite: true, privacidad: "ambito" } },
};

const OP = { ambito: "salud", destino: "ambito" as const, nombre: "salud" };

describe("permitido", () => {
  it("el destino «privado» vale siempre", () => {
    expect(permitido("privado", "salud", { ...AJUSTES, aprendizajeColectivo: false }).ok).toBe(true);
  });
  it("sin aprendizaje colectivo ni permiso del ámbito, no", () => {
    expect(permitido("ambito", "salud", { ...AJUSTES, aprendizajeColectivo: false }).ok).toBe(false);
    const sinPermiso: AjustesAprendizaje = { aprendizajeColectivo: true, porAmbito: {} };
    expect(permitido("ambito", "salud", sinPermiso).ok).toBe(false);
  });
  it("lo privado no sale y «publico» exige privacidad «publica»", () => {
    const privada: AjustesAprendizaje = { aprendizajeColectivo: true, porAmbito: { salud: { permite: true, privacidad: "privada" } } };
    expect(permitido("ambito", "salud", privada).ok).toBe(false);
    expect(permitido("publico", "salud", AJUSTES).ok).toBe(false);
    const publica: AjustesAprendizaje = { aprendizajeColectivo: true, porAmbito: { salud: { permite: true, privacidad: "publica" } } };
    expect(permitido("publico", "salud", publica).ok).toBe(true);
  });});

describe("paraLlamaFactory", () => {
  it("valoración positiva ⇒ fila SFT y KTO con label true", () => {
    const r = paraLlamaFactory([exp({})], AJUSTES, OP);
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages[0]).toEqual({ role: "user", content: "¿qué soy?" });
    expect(r.sft[0].messages[1]).toEqual({ role: "assistant", content: "una persona" });
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(true);
  });

  it("valoración negativa ⇒ solo KTO con label false", () => {
    const r = paraLlamaFactory([exp({ valoracion: "negativa" })], AJUSTES, OP);
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(false);
  });

  it("corrección ⇒ SFT con el texto corregido + KTO false y KTO true", () => {
    const r = paraLlamaFactory(
      [exp({ tipo: "correccion", valoracion: "negativa", salida: "respuesta mala", correccion: "respuesta corregida" })],
      AJUSTES,
      OP,
    );
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages[1].content).toBe("respuesta corregida");
    expect(r.kto).toHaveLength(2);
    expect(r.kto[0].messages[1].content).toBe("respuesta mala");
    expect(r.kto[0].label).toBe(false);
    expect(r.kto[1].messages[1].content).toBe("respuesta corregida");
    expect(r.kto[1].label).toBe(true);
  });

  it("ámbito «privada» con destino «publico» ⇒ bloqueado y vacío", () => {
    const ajustes: AjustesAprendizaje = { aprendizajeColectivo: true, porAmbito: { salud: { permite: true, privacidad: "privada" } } };
    const datos = [exp({}), exp({ id: "id2", tipo: "correccion", correccion: "mejor así" })];
    const r = paraLlamaFactory(datos, ajustes, { ...OP, destino: "publico" });
    expect(r.sft).toEqual([]);
    expect(r.kto).toEqual([]);
    expect(r.descartadas).toEqual({ bloqueado: 2 });
    expect(r.info).toEqual({});
  });

  it("texto con pinta de secreto ⇒ descartado", () => {
    const r = paraLlamaFactory([exp({ salida: "clave sk-AbCdE1234567890aBcDeF" })], AJUSTES, OP);
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.descartadas["secreto"]).toBe(1);
  });

  it("duplicado exacto ⇒ descartado", () => {
    const r = paraLlamaFactory([exp({ id: "a" }), exp({ id: "b" })], AJUSTES, OP);
    expect(r.sft).toHaveLength(1);
    expect(r.kto).toHaveLength(1);
    expect(r.descartadas["duplicado"]).toBe(1);
  });

  it("reparto estable y la suma de partes = filas SFT", () => {
    const datos = ["x1", "x2", "x3", "x4", "x5"].map((id) => exp({ id }));
    const r1 = paraLlamaFactory(datos, AJUSTES, OP);
    const r2 = paraLlamaFactory([...datos].reverse(), AJUSTES, OP);
    expect(r1.partes).toEqual(r2.partes);
    const porParte = { train: 0, val: 0, test: 0 };
    for (const f of r1.sft) porParte[f.parte] += 1;
    expect(porParte).toEqual(r1.partes);
  });

  it("info describe las dos entradas de dataset_info.json", () => {
    const r = paraLlamaFactory([exp({})], AJUSTES, OP);
    expect(r.info["salud_sft"].file_name).toBe("salud_sft.json");
    expect(r.info["salud_sft"].formatting).toBe("sharegpt");
    expect(r.info["salud_sft"].tags.user_tag).toBe("user");
    expect(r.info["salud_kto"].columns.kto_tag).toBe("label");
    expect(r.info["salud_kto"].columns.messages).toBe("messages");
  });
});
