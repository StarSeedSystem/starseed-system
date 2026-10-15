import { describe, it, expect } from "vitest";
import type { Operacion, Cambio, Molecula } from "../tipos";
import {
  elementoDeOperacion,
  elementoDeEstructura,
  moleculaDesdeElementos,
  crearAcumuladorDeGestos,
  formaCorta,
  desdeFormaCorta,
} from "../sesion-sincronia";

describe("elementoDeOperacion", () => {
  it("creates ElementoSala", () => {
    const op: Operacion = {
      id: "op1",
      objetivo: { atomoId: "a", parametroId: "p" },
      accion: { tipo: "exacta", valor: 42 },
      autor: { tipo: "persona", id: "u" },
      origen: "mano",
      t: 1000,
    };
    const c: Cambio = { operacion: op, antes: 0, despues: 42, acotado: false, reversible: true };
    const e = elementoDeOperacion(op, c);
    expect(e.id).toBe("a::p");
    expect(e.tipo).toBe("parametro");
    expect(e.datos).toEqual({ valor: 42 });
    expect(e.actualizadoEn).toBe(1000);
    expect(e.porDispositivo).toBe("u");
    expect(e.borrado).toBe(false);
  });
});

describe("elementoDeEstructura", () => {
  it("creates capa element", () => {
    const capaData = { id: "c1", titulo: "Capa", formato: "", referencia: null, orden: 1, visible: true, bloqueada: false };
    const e = elementoDeEstructura("capa", "c1", capaData, 1000, "d");
    expect(e.id).toBe("capa::c1");
    expect(e.tipo).toBe("capa");
    expect(e.datos).toEqual(capaData);
    expect(e.actualizadoEn).toBe(1000);
    expect(e.porDispositivo).toBe("d");
    expect(e.borrado).toBe(false);
  });
  it("creates atomo element with borrado", () => {
    const atomoData = { id: "a1", capaId: "c1", herramientaId: "osc", titulo: undefined, ejecutaEn: undefined, estado: "activo" };
    const e = elementoDeEstructura("atomo", "a1", atomoData, 1000, "d", true);
    expect(e.id).toBe("atomo::a1");
    expect(e.tipo).toBe("atomo");
    expect(e.datos).toEqual(atomoData);
    expect(e.borrado).toBe(true);
  });
});

describe("moleculaDesdeElementos", () => {
  it("fuses base with parameter change", () => {
    const base: Molecula = {
      id: "m1",
      titulo: "Mol",
      ambito: "personal",
      capas: [{ id: "c1", titulo: "Base Capa", formato: "", referencia: null, orden: 1, visible: true, bloqueada: false }],
      atomos: [{ id: "a1", herramientaId: "osc", capaId: "c1", titulo: "Osc", ejecutaEn: "navegador", estado: "activo" }],
      valores: { "a1::vol": 0.5 },
      version: 1,
      creadaEn: 0,
      actualizadaEn: 1000,
    };
    const op: Operacion = {
      id: "op1",
      objetivo: { atomoId: "a1", parametroId: "vol" },
      accion: { tipo: "exacta", valor: 0.8 },
      autor: { tipo: "persona", id: "u" },
      origen: "mano",
      t: 2000,
    };
    const c: Cambio = { operacion: op, antes: 0.5, despues: 0.8, acotado: false, reversible: true };
    const res = moleculaDesdeElementos(base, [elementoDeOperacion(op, c)]);
    expect(res.valores).toEqual({ "a1::vol": 0.8 });
    expect(res.capas).toHaveLength(1);
    expect(res.capas[0].titulo).toBe("Base Capa");
    expect(res.atomos).toHaveLength(1);
    expect(res.atomos[0].herramientaId).toBe("osc");
    expect(res.version).toBe(2);
    expect(res.actualizadaEn).toBe(2000);
  });
});

describe("crearAcumuladorDeGestos", () => {
  it("returns object with methods", () => {
    const acc = crearAcumuladorDeGestos();
    expect(typeof acc.procesar).toBe("function");
    expect(typeof acc.liberar).toBe("function");
    const conf = acc.liberar();
    expect(conf.tipo).toBe("confirmacion");
  });
});

describe("formaCorta y desdeFormaCorta", () => {
  it("encodes and decodes operation", () => {
    const op: Operacion = {
      id: "op1",
      objetivo: { atomoId: "a", parametroId: "p" },
      accion: { tipo: "exacta", valor: 42 },
      autor: { tipo: "persona", id: "u" },
      origen: "mano",
      t: 1000,
    };
    const enc = formaCorta(op);
    const dec = desdeFormaCorta(enc);
    expect(dec).toEqual(op);
  });
  it("returns null for invalid string", () => {
    expect(desdeFormaCorta("x")).toBeNull();
  });
});
