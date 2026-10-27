import { describe, it, expect } from "vitest";
import type { Experiencia } from "../../experiencias";
import type { AjustesAprendizaje } from "../../experiencias-aprendizaje";
import { paraLlamaFactory } from "../dataset-llamafactory";

const baseAjustes: AjustesAprendizaje = {
  aprendizajeColectivo: true,
  porAmbito: {
    demo: { permite: true, privacidad: "ambito" },
    publica: { permite: true, privacidad: "publica" },
    privada: { permite: true, privacidad: "privada" },
  },
};

function ex(o: Partial<Experiencia>): Experiencia {
  return {
    id: o.id ?? "e1",
    t: "2026-01-01 00:00:00",
    medio: "os-web",
    capa: "llm",
    tipo: o.tipo ?? "valoracion",
    dominio: o.dominio ?? "demo",
    entrada: o.entrada ?? "",
    salida: o.salida ?? "ok",
    confianza: 0.9,
    ms: 10,
    resultado: true,
    ...o,
  };
}

describe("dataset-llamafactory", () => {
  it("positiva ⇒ fila SFT + KTO true", () => {
    const res = paraLlamaFactory([ex({ id: "p1", entrada: "hola", salida: "mundo", valoracion: "positiva" })], baseAjustes, { ambito: "demo", destino: "ambito", nombre: "d" });
    expect(res.sft.length).toBe(1);
    expect(res.kto.length).toBe(1);
    expect(res.sft[0].messages[0].role).toBe("user");
    expect(res.sft[0].messages[1].role).toBe("assistant");
    expect(res.sft[0].messages[1].content).toBe("mundo");
    expect(res.kto[0].label).toBe(true);
  });

  it("negativa ⇒ solo KTO false", () => {
    const res = paraLlamaFactory([ex({ id: "n1", entrada: "x", salida: "y", valoracion: "negativa" })], baseAjustes, { ambito: "demo", destino: "ambito", nombre: "d" });
    expect(res.sft.length).toBe(0);
    expect(res.kto.length).toBe(1);
    expect(res.kto[0].label).toBe(false);
  });

  it("corrección ⇒ SFT con el texto corregido + KTO false (original) + KTO true (corregido)", () => {
    const res = paraLlamaFactory([ex({ id: "c1", tipo: "correccion", entrada: "preg", salida: "mal", correccion: "bien", valoracion: "negativa" })], baseAjustes, { ambito: "demo", destino: "ambito", nombre: "d" });
    expect(res.sft.length).toBe(1);
    expect(res.sft[0].messages[1].content).toBe("bien");
    expect(res.kto.length).toBe(2);
    const falsos = res.kto.filter((k) => k.label === false);
    const verdaderos = res.kto.filter((k) => k.label === true);
    expect(falsos.length).toBe(1);
    expect(verdaderos.length).toBe(1);
    expect(falsos[0].messages[1].content).toBe("mal");
    expect(verdaderos[0].messages[1].content).toBe("bien");
  });

  it("ámbito «privada» con destino «publico» ⇒ bloqueado y vacío", () => {
    const res = paraLlamaFactory([ex({ id: "z1", entrada: "a", salida: "b", valoracion: "positiva", ambito: "privada" })], baseAjustes, { ambito: "privada", destino: "publico", nombre: "d" });
    expect(res.sft.length).toBe(0);
    expect(res.kto.length).toBe(0);
    expect(res.descartadas.bloqueado).toBeGreaterThan(0);
  });

  it("secreto descartado", () => {
    const res = paraLlamaFactory([ex({ id: "s1", entrada: "usa sk-1234567890123456", salida: "ok", valoracion: "positiva" })], baseAjustes, { ambito: "demo", destino: "ambito", nombre: "d" });
    expect(res.sft.length).toBe(0);
    expect(res.kto.length).toBe(0);
    expect(res.descartadas.secreto).toBeGreaterThan(0);
  });

  it("duplicado descartado", () => {
    const res = paraLlamaFactory([
      ex({ id: "dup1", entrada: "hola", salida: "mundo", valoracion: "positiva" }),
      ex({ id: "dup2", entrada: "hola", salida: "mundo", valoracion: "positiva" }),
    ], baseAjustes, { ambito: "demo", destino: "ambito", nombre: "d" });
    expect(res.sft.length).toBe(1);
    expect(res.kto.length).toBe(1);
    expect(res.descartadas["duplicados exactos"]).toBeGreaterThan(0);
  });

  it("reparto estable (misma experiencia ⇒ misma parte) y la suma de partes = filas SFT", () => {
    const items = [ex({ id: "r1", entrada: "a", salida: "b", valoracion: "positiva" }), ex({ id: "r2", entrada: "c", salida: "d", valoracion: "positiva" })];
    const res1 = paraLlamaFactory(items, baseAjustes, { ambito: "demo", destino: "ambito", nombre: "d" });
    const res2 = paraLlamaFactory(items, baseAjustes, { ambito: "demo", destino: "ambito", nombre: "d" });
    expect(res1.sft[0].parte).toBe(res2.sft[0].parte);
    expect(res1.sft[1].parte).toBe(res2.sft[1].parte);
    expect(res1.partes.train + res1.partes.val + res1.partes.test).toBe(res1.sft.length);
  });
});
