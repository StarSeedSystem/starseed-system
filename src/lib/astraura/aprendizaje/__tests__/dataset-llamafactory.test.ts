import { describe, it, expect } from "vitest";
import type { Capa, Experiencia } from "../experiencias";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";
import { paraLlamaFactory, permitido } from "../dataset-llamafactory";

function ajustes(): AjustesAprendizaje {
  return {
    aprendizajeColectivo: true,
    porAmbito: {
      salud: { permite: true, privacidad: "ambito" },
      abierta: { permite: true, privacidad: "publica" },
    },
  };
}

function exp(extra: Partial<Experiencia>): Experiencia {
  const base: Experiencia = {
    id: "e1",
    t: "2026-10-27 10:00:00",
    medio: "os-web",
    capa: "bitnet" as Capa,
    tipo: "valoracion",
    dominio: "salud",
    entrada: "¿Qué es la inhalación?",
    salida: "Es respirar sin interrupción.",
    confianza: null,
    ms: null,
    resultado: null,
  };
  return { ...base, ...extra };
}

const NINGUNO = ajustes();

describe("permitido", () => {
  it("el destino privado siempre vale", () => {
    expect(permitido("privado", "desconocido", NINGUNO).ok).toBe(true);
  });
  it("público exige privacidad publica y consentimiento", () => {
    expect(permitido("publico", "abierta", ajustes()).ok).toBe(true);
    expect(permitido("publico", "salud", ajustes()).ok).toBe(false);
    expect(permitido("ambito", "salud", ajustes()).ok).toBe(true);
    const sinColectivo = { ...ajustes(), aprendizajeColectivo: false };
    expect(permitido("ambito", "salud", sinColectivo).ok).toBe(false);
    expect(permitido("privado", "salud", sinColectivo).ok).toBe(true);
  });
  it("el ámbito privado por ajustes queda bloqueado", () => {
    const aj = ajustes();
    aj.porAmbito.salud.privacidad = "privada";
    expect(permitido("ambito", "salud", aj).ok).toBe(false);
  });
});

describe("paraLlamaFactory · datasets SFT y KTO", () => {
  it("valoración positiva produce fila SFT y KTO true", () => {
    const r = paraLlamaFactory([exp({ valoracion: "positiva" })], NINGUNO, { ambito: "salud", destino: "ambito", nombre: "salud" });
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages).toEqual([
      { role: "user", content: "¿Qué es la inhalación?" },
      { role: "assistant", content: "Es respirar sin interrupción." },
    ]);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(true);
  });
  it("valoración negativa produce solo KTO false", () => {
    const r = paraLlamaFactory([exp({ valoracion: "negativa" })], NINGUNO, { ambito: "salud", destino: "ambito", nombre: "salud" });
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(1);
    expect(r.kto[0].label).toBe(false);
  });
  it("corrección produce SFT corregido, KTO false del original y KTO true del corregido", () => {
    const r = paraLlamaFactory([exp({ tipo: "correccion", valoracion: "negativa", correccion: "Es respirar bajo el agua con rima." })], NINGUNO, { ambito: "salud", destino: "ambito", nombre: "salud" });
    expect(r.sft).toHaveLength(1);
    expect(r.sft[0].messages[1].content).toBe("Es respirar bajo el agua con rima.");
    expect(r.kto.map((k) => k.label)).toEqual([false, true]);
  });
  it("privada con destino publico queda bloqueado y vacío", () => {
    const aj = ajustes();
    aj.porAmbito.salud.privacidad = "privada";
    const r = paraLlamaFactory([exp({ valoracion: "positiva" })], aj, { ambito: "salud", destino: "publico", nombre: "salud" });
    expect(r.sft).toHaveLength(0);
    expect(r.kto).toHaveLength(0);
    expect(r.descartadas["bloqueado"]).toBe(1);
  });
  it("los secretos se descartan y se cuentan", () => {
    const r = paraLlamaFactory([exp({ valoracion: "positiva", salida: "sk-ABCDEFGHIJKLMNOPQR" }), exp({ id: "e2", valoracion: "positiva", salida: "Bearer abcdefghijklmnopqrstuvwx" })], NINGUNO, { ambito: "salud", destino: "ambito", nombre: "salud" });
    expect(r.sft).toHaveLength(0);
    expect(r.descartadas["secreto"]).toBe(2);
  });
  it("los duplicados exactos se descartan", () => {
    const r = paraLlamaFactory([exp({ valoracion: "positiva" }), exp({ id: "e2", valoracion: "positiva" })], NINGUNO, { ambito: "salud", destino: "ambito", nombre: "salud" });
    expect(r.sft).toHaveLength(1);
    expect(r.descartadas["duplicado"]).toBe(1);
  });
  it("reparto estable: la misma experiencia cae siempre en la misma parte y las partes suman", () => {
    const e = [exp({ id: "fijo", valoracion: "positiva" })];
    const a = paraLlamaFactory(e, NINGUNO, { ambito: "salud", destino: "ambito", nombre: "salud" });
    const b = paraLlamaFactory([...e], NINGUNO, { ambito: "salud", destino: "ambito", nombre: "salud" });
    expect(a.sft[0].parte).toBe(b.sft[0].parte);
    expect(a.partes.train + a.partes.val + a.partes.test).toBe(a.sft.length);
  });
  it("dataset vacío declara dataset_info.json correcto", () => {
    const r = paraLlamaFactory([], ajustes(), { ambito: "abierta", destino: "publico", nombre: "colectiva" });
    expect(r.info["colectiva_sft"]).toMatchObject({ formatting: "sharegpt" });
    expect(r.info["colectiva_kto"]).toMatchObject({ columns: { kto_tag: "label" } });
  });
});
