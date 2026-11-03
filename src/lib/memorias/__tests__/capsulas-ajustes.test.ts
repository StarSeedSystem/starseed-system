import { describe, it, expect } from "vitest";
import {
  claveSujeto,
  normalizarRegistroCapsulas,
  conCapsula,
  capsulaEncendida,
  encenderCapsula,
  CAPSULAS_AJUSTES_KEY,
  CAPSULAS_EVENT,
  CLAVE_CAPSULAS,
  EVENTO_CAPSULAS,
} from "../capsulas-ajustes";
import type { RegistroCapsulas } from "../capsulas-ajustes";

const PERSONALIDAD = { tipo: "personalidad", id: "aurora" } as const;

describe("claveSujeto", () => {
  it("compone «tipo:id»", () => {
    expect(claveSujeto("personalidad", "aurora")).toBe("personalidad:aurora");
    expect(claveSujeto("cerebro", "c-1")).toBe("cerebro:c-1");
  });
});

describe("normalizarRegistroCapsulas", () => {
  it("acepta un ajuste bien formado", () => {
    const saneado = normalizarRegistroCapsulas({
      v: 1,
      sujetos: { "personalidad:aurora": true, "cerebro:c-1": false },
    });
    expect(saneado).toEqual({
      v: 1,
      sujetos: { "personalidad:aurora": true, "cerebro:c-1": false },
    });
  });

  it("devuelve null ante valores roto: sin v, con otra v o sin sujetos", () => {
    expect(normalizarRegistroCapsulas(null)).toBeNull();
    expect(normalizarRegistroCapsulas("hola")).toBeNull();
    expect(normalizarRegistroCapsulas({ sujetos: {} })).toBeNull();
    expect(normalizarRegistroCapsulas({ v: 2, sujetos: {} })).toBeNull();
    expect(normalizarRegistroCapsulas({ v: 1, sujetos: "no" })).toBeNull();
  });

  it("sueltan los valores que no son booleanos y las claves sin dos puntos", () => {
    const saneado = normalizarRegistroCapsulas({
      v: 1,
      sujetos: { "personalidad:aurora": true, "cerebro:c-1": "sí", suelto: true },
    });
    expect(saneado).toEqual({ v: 1, sujetos: { "personalidad:aurora": true } });
  });
});

describe("conCapsula", () => {
  const registro: RegistroCapsulas = { v: 1, sujetos: {} };

  it("enciende y apaga un sujeto sin tocar el registro original", () => {
    const encendido = conCapsula(registro, PERSONALIDAD, true);
    expect(encendido.sujetos["personalidad:aurora"]).toBe(true);
    expect(registro.sujetos["personalidad:aurora"]).toBeUndefined();
    const apagado = conCapsula(encendido, PERSONALIDAD, false);
    expect(apagado.sujetos["personalidad:aurora"]).toBe(false);
  });

  it("distingue sujetos con el mismo id y tipo distinto", () => {
    const conDos = conCapsula(
      conCapsula(registro, PERSONALIDAD, true),
      { tipo: "agente", id: "aurora" },
      true,
    );
    expect(Object.keys(conDos.sujetos)).toEqual(["personalidad:aurora", "agente:aurora"]);
  });

  it("ignora a un sujeto sin id", () => {
    expect(conCapsula(registro, { tipo: "perfil", id: "  " }, true)).toBe(registro);
  });
});

describe("capsulaEncendida (sin almacenamiento en pruebas)", () => {
  it("está apagada por defecto", () => {
    expect(capsulaEncendida(PERSONALIDAD)).toBe(false);
  });

  it("apagada ante un sujeto sin id", () => {
    expect(capsulaEncendida({ tipo: "perfil", id: "" })).toBe(false);
  });
});

describe("encenderCapsula (sin almacenamiento en pruebas)", () => {
  it("devuelve false sin usar storage y a un sujeto sin id", () => {
    expect(encenderCapsula(PERSONALIDAD, true)).toBe(false);
    expect(encenderCapsula({ tipo: "cerebro", id: "" }, true)).toBe(false);
  });
});

describe("constantes de cableado", () => {
  it("la clave y el evento van con sus alias de sync", () => {
    expect(CAPSULAS_AJUSTES_KEY).toBe("starseed.memorias.capsulas.v1");
    expect(CAPSULAS_EVENT).toBe("starseed:memorias-capsulas");
    expect(CLAVE_CAPSULAS).toBe(CAPSULAS_AJUSTES_KEY);
    expect(EVENTO_CAPSULAS).toBe(CAPSULAS_EVENT);
  });
});
