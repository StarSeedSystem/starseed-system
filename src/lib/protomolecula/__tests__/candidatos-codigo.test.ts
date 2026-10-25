import { describe, expect, it } from "vitest";
import type { Autor } from "./tipos";
import { proponer, revisar, diff, aceptar } from "./candidatos-codigo.ts";

const ana: Autor = { tipo: "persona", id: "ana" };
const jet: Autor = { tipo: "agente", id: "jet" };

const CAPA_ID = "cap1";
const ORIGINAL = "console.log(\"hola\");\nfunction foo() {\n  return 1;\n}";
const PROPIO = "console.log(\"hola\");\nfunction foo() {\n  return 2;\n}\nconsole.log(\"mundo\");";
const PROPIO_COMPO = "console.log(\"hola\");\nfunction foo() {\n  return 2;\n}\nconsole.log(\"mundo\");\nconsole.log(\"extra\");";
const PROPIO_SECRETO = "console.log(\"hola\");\nsk-ABCD1234\nfunction foo() { return 1; }";
const PROPIO_EVAL = "console.log(\"hola\");\nnew Function('return 1');\nfunction foo() { return 1; }";
const PROPIO_IMPORT = "console.log(\"hola\");\nimport('fs');\nfunction foo() { return 1; }";

const decidirAceptar = (permitido = true, confirmar = true, motivo = "aceptado") => ({ permitido, confirmar, motivo });
const decidirRechazar = (motivo: string) => ({ permitido: false, confirmar: false, motivo });

describe("proponer", () => {
  it("guarda un candidato con estado propuesto y sin avisos", () => {
    const res = proponer({ capaId: CAPA_ID, lenguajeOrigen: "javascript", propuesto: PROPIO, original: ORIGINAL, autor: ana });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const c = res.candidato;
      expect(c.id).toBeDefined();
      expect(c.capaId).toBe(CAPA_ID);
      expect(c.lenguajeOrigen).toBe("javascript");
      expect(c.propuesto).toBe(PROPIO);
      expect(c.original).toBe(ORIGINAL);
      expect(c.autor).toEqual(ana);
      expect(c.estado).toBe("propuesto");
      expect(c.avisos).toEqual([]);
    }
  });
  it("permite elegir el lenguajeDestino opcional", () => {
    const res = proponer({ capaId: CAPA_ID, lenguajeOrigen: "ts", lenguajeDestino: "js", propuesto: PROPIO, original: ORIGINAL, autor: jet });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.candidato.lenguajeDestino).toBe("js");
    }
  });
});

describe("revisar", () => {
  it("no avisa si está limpio", () => {
    const c = { id: "1", capaId: CAPA_ID, lenguajeOrigen: "ts", propuesto: PROPIO, original: ORIGINAL, autor: ana, estado: "propuesto", avisos: [] };
    const r = revisar(c);
    expect(r.avisos).toEqual([]);
    expect(r.bloqueado).toBe(false);
  });
  it("marca secretos (sk-, gsk_, Bearer)", () => {
    const c = { id: "2", capaId: CAPA_ID, lenguajeOrigen: "ts", propuesto: PROPIO_SECRETO, original: ORIGINAL, autor: ana, estado: "propuesto", avisos: [] };
    const r = revisar(c);
    expect(r.avisos).toContain("posibles secretos");
    expect(r.bloqueado).toBe(true);
  });
  it("marca eval", () => {
    const c = { id: "3", capaId: CAPA_ID, lenguajeOrigen: "ts", propuesto: PROPIO_EVAL, original: ORIGINAL, autor: ana, estado: "propuesto", avisos: [] };
    const r = revisar(c);
    expect(r.avisos).toContain("operaciones peligrosas");
    expect(r.bloqueado).toBe(true);
  });
  it("marca new Function", () => {
    const c = { id: "4", capaId: CAPA_ID, lenguajeOrigen: "ts", propuesto: "new Function('return 1')", original: "console.log('x')", autor: ana, estado: "propuesto", avisos: [] };
    const r = revisar(c);
    expect(r.bloqueado).toBe(true);
  });
  it("marca import(", () => {
    const c = { id: "5", capaId: CAPA_ID, lenguajeOrigen: "ts", propuesto: "import('fs')", original: "console.log('x')", autor: ana, estado: "propuesto", avisos: [] };
    const r = revisar(c);
    expect(r.bloqueado).toBe(true);
  });
  it("marca node:", () => {
    const c = { id: "6", capaId: CAPA_ID, lenguajeOrigen: "ts", propuesto: "node.exec()", original: "console.log('x')", autor: ana, estado: "propuesto", avisos: [] };
    const r = revisar(c);
    expect(r.bloqueado).toBe(true);
  });
});

describe("diff", () => {
  it("muestra un cambio en la línea correcta", () => {
    const d = diff(ORIGINAL, PROPIO);
    expect(d).toEqual([{ tipo: "cambiado", linea: 3, original: "  return 1;", propuesto: "  return 2;" }]);
  });
  it("muestra una adición de línea", () => {
    const d = diff(ORIGINAL, PROPIO_COMPO);
    expect(d).toEqual([{ tipo: "agregado", linea: 5, propuesto: "console.log(\"extra\");" }]);
  });
  it("muestra un borrado de línea", () => {
    const d = diff(PROPIO, ORIGINAL);
    expect(d).toEqual([{ tipo: "borrado", linea: 5, original: "console.log(\"mundo\");" }]);
  });
  it("empty diff cuando es igual", () => {
    expect(diff(ORIGINAL, ORIGINAL)).toEqual([]);
  });
});

describe("aceptar", () => {
  it("acepta un candidato cuando la mano confirma", () => {
    const c = { id: "7", capaId: CAPA_ID, lenguajeOrigen: "ts", propuesto: PROPIO, original: ORIGINAL, autor: ana, estado: "propuesto", avisos: [] };
    const ctx = {
      mol: {}, // la molécula ficticia está inyectada
      capaId: CAPA_ID,
      decidir: (c: { accion: "aplicar-codigo"; origen: "mano" }) => decidirAceptar(true, true, "aceptado por la mano"),
    };
    const r = aceptar(c, ctx);
    expect(r.ok).toBe(true);
  });
  it("rechaza cuando la mano no confirma", () => {
    const c = { id: "8", capaId: CAPA_ID, lenguajeOrigen: "ts", propuesto: PROPIO, original: ORIGINAL, autor: ana, estado: "propuesto", avisos: [] };
    const ctx = { mol: {}, capaId: CAPA_ID, decidir: () => decidirRechazar("rechazado por la mano") };
    const r = aceptar(c, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("rechazado por la mano");
  });
  it("rechaza si no está permitido", () => {
    const c = { id: "9", capaId: CAPA_ID, lenguajeOrigen: "ts", propuesto: PROPIO, original: ORIGINAL, autor: ana, estado: "propuesto", avisos: [] };
    const ctx = { mol: {}, capaId: CAPA_ID, decidir: () => ({ permitido: false, confirmar: false, motivo: "no permitido" }) };
    const r = aceptar(c, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("no permitido");
  });
  it("usa la capaId correcta en el contexto", () => {
    const c = { id: "10", capaId: "otros", lenguajeOrigen: "ts", propuesto: PROPIO, original: ORIGINAL, autor: ana, estado: "propuesto", avisos: [] };
    const ctx: any = { mol: {}, capaId: "otros", decidir: () => decidirAceptar() };
    aceptar(c, ctx);
    expect(ctx.capaId).toBe("otros");
  });
});