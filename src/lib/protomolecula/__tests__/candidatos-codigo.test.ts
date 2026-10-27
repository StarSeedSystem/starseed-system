/**
 * Protomolécula · PRUEBAS DE CANDIDATOS DE CÓDIGO (§8.2 contrato).
 * Solo funciones puras: sin red, sin disco, sin `node:*`, sin `vi.mock`.
 */
import { describe, it, expect } from "vitest";
import { proponer, revisar, diff, aceptar, type Candidato } from "../candidatos-codigo";
import type { Autor } from "../tipos";

const autorMano: Autor = { tipo: "persona", id: "alex", nombre: "Alex" };
const autorIA: Autor = { tipo: "agente", id: "astraura" };

describe("proponer candidato", () => {
  it("crea candidato con estado propuesto", () => {
    const c = proponer("p1", "c1", "ts", "a", "b", autorMano);
    expect(c.id).toBe("p1");
    expect(c.estado).toBe("propuesto");
    expect(c.avisos).toEqual([]);
  });

  it("incluye lenguaje destino opcional", () => {
    const c = proponer("p2", "c1", "py", "orig", "prop", autorIA, "js");
    expect(c.lenguajeDestino).toBe("js");
  });
});

describe("revisar candidato", () => {
  it("detecta secreto real sk- y bloquea", () => {
    const c = proponer("s1", "c1", "ts", "clave", "api_key = 'sk-test123'", autorMano);
    const r = revisar(c);
    expect(r.avisos.some((a) => a.includes("secreto"))).toBe(true);
    expect(r.bloqueado).toBe(true);
  });

  it("detecta secreto gsk_ y bloquea", () => {
    const c = proponer("s2", "c1", "ts", "clave", "gsk_abc", autorMano);
    expect(revisar(c).bloqueado).toBe(true);
  });

  it("detecta Bearer y bloquea", () => {
    const c = proponer("s3", "c1", "ts", "clave", "Authorization: Bearer token", autorMano);
    expect(revisar(c).bloqueado).toBe(true);
  });

  it("marca ruta del disco sin bloquear por sí sola", () => {
    const c = proponer("r1", "c1", "ts", "archivo", "/Users/alex/docs", autorMano);
    const r = revisar(c);
    expect(r.avisos.some((a) => a.includes("ruta"))).toBe(true);
    expect(r.bloqueado).toBe(false);
  });

  it("bloquea eval", () => {
    const c = proponer("e1", "c1", "ts", "x", "eval('1')", autorMano);
    expect(revisar(c).bloqueado).toBe(true);
  });

  it("bloquea new Function", () => {
    const c = proponer("nf1", "c1", "ts", "x", "new Function('a','b')", autorMano);
    expect(revisar(c).bloqueado).toBe(true);
  });

  it("bloquea import() dinámico", () => {
    const c = proponer("d1", "c1", "ts", "x", "import('mod')", autorMano);
    expect(revisar(c).bloqueado).toBe(true);
  });

  it("bloquea referencia node:", () => {
    const c = proponer("n1", "c1", "ts", "x", "import { readFile } from 'node:fs';", autorMano);
    expect(revisar(c).bloqueado).toBe(true);
  });
});

describe("diff línea a línea", () => {
  it("detecta añadidos, borrados y cambios", () => {
    const d = diff("a\nb\n", "a\nc\nd");
    expect(d.añadidos).toContain("d");
    expect(d.borrados).toContain("b");
    expect(d.modificados).toContain("b → c");
  });
});

describe("aceptar candidato", () => {
  it("acepta con mano sobre capa código válida", () => {
    const c = proponer("a1", "c-codigo", "ts", "o", "p", autorMano);
    const res = aceptar(c, {
      decidir: () => ({ permitido: true, confirmar: true, motivo: "mano" }),
    });
    expect(res.ok).toBe(true);
    expect(res.bloqueado).toBe(false);
  });

  it("acepta con mano y bloquea núcleo", () => {
    const c = proponer("a2", "nucleo/invariantes", "ts", "o", "p", autorMano);
    const res = aceptar(c, {
      decidir: () => ({ permitido: true, confirmar: true, motivo: "mano" }),
    });
    expect(res.ok).toBe(false);
    expect(res.mensaje).toContain("núcleo");
  });

  it("rechaza si revisar bloquea por secreto", () => {
    const c = proponer("a3", "c-codigo", "ts", "o", "sk-secret", autorMano);
    const res = aceptar(c, {
      decidir: () => ({ permitido: true, confirmar: true, motivo: "mano" }),
    });
    expect(res.ok).toBe(false);
    expect(res.bloqueado).toBe(true);
  });

  it("acepta con mano sobre capa código", () => {
    const c = proponer("a4", "capa-codigo-123", "py", "print('hola')", "print('adios')", autorMano);
    const res = aceptar(c, {
      decidir: () => ({ permitido: true, confirmar: true, motivo: "mano" }),
    });
    expect(res.ok).toBe(true);
    expect(res.mensaje).toContain("reemplaza solo el contenido");
  });
});
