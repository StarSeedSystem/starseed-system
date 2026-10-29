import { describe, it, expect } from "vitest";
import { aceptar, diff, proponer, rechazar, revisar, type Candidato, type ContextoAceptar } from "../candidatos-codigo";
import type { Capa, Molecula } from "../tipos";

const junto = (...p: string[]) => p.join("");
const SK = junto("sk-", "live", "1234567890"), GSK = junto("gsk_", "abcdefghij");
const BEARER = junto("Bear", "er ", "abcdefghij"), RUTA = junto("/", "home", "/alex/proyecto.ts");
const autor = { tipo: "persona" as const, id: "u1" };
const capa = (id: string, tipo: Capa["tipo"] = "codigo", bloqueada = false): Capa =>
  ({ id, tipo, titulo: id, formato: tipo === "codigo" ? "ts" : "json", referencia: null, orden: 0, visible: true, bloqueada });
const mol = (capas: Capa[] = [capa("c1")]): Molecula =>
  ({ id: "m1", titulo: "Molécula", ambito: "personal", capas, atomos: [], valores: {}, version: 3, creadaEn: 1, actualizadaEn: 2 });
const prop = (m: Molecula = mol(), extra: Partial<Parameters<typeof proponer>[0]> = {}) =>
  proponer({ molecula: m, capaId: "c1", original: "uno\ndos", propuesto: "uno\ntres", lenguajeOrigen: "ts", autor, ...extra });
const cand = (propuesto: string, m: Molecula = mol()): Candidato => {
  const r = prop(m, { propuesto }); if (!r.ok) throw new Error(r.motivo); return r.candidato;
};
const ctx = (extra: Partial<ContextoAceptar> = {}): ContextoAceptar =>
  ({ molecula: mol(), contenidos: { c1: "uno\ndos" }, rol: "dueno", origen: "mano", ambito: "personal", ahora: 10, ...extra });

describe("proponer: candidato sin ejecutar ni tocar la capa", () => {
  it("guarda original, propuesto y autor sin modificar la molécula", () => {
    const m = mol(), antes = JSON.parse(JSON.stringify(m)), r = prop(m);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.candidato).toMatchObject({ capaId: "c1", estado: "propuesto", original: "uno\ndos", propuesto: "uno\ntres", autor });
    expect(r.candidato.avisos).toEqual([]); expect(m).toEqual(antes);
  });
  it("rechaza una capa que no es de código", () => {
    const r = prop(mol([capa("c1", "datos")]));
    expect(r).toMatchObject({ ok: false }); if (!r.ok) expect(r.motivo).toContain("no de código");
  });
  it("rechaza una capa bloqueada", () => {
    const r = prop(mol([capa("c1", "codigo", true)]));
    expect(r).toMatchObject({ ok: false }); if (!r.ok) expect(r.motivo).toContain("bloqueada");
  });
  it("nunca propone sobre el núcleo y exige que la capa exista", () => {
    const nucleo = prop(mol(), { capaId: "nucleo/invariantes" }), falta = prop(mol(), { capaId: "otra" });
    expect(nucleo).toMatchObject({ ok: false }); if (!nucleo.ok) expect(nucleo.motivo).toContain("núcleo");
    expect(falta).toMatchObject({ ok: false }); if (!falta.ok) expect(falta.motivo).toContain("No hay ninguna capa");
  });
});

describe("revisar: avisos de riesgo", () => {
  it("señala eval, new Function, import( y node:*", () => {
    const c = revisar(cand("eval(x)\nnew Function('x')\nimport('./m')\nconst fs = require('node:fs')"));
    expect(c.avisos.join(" ")).toContain("eval("); expect(c.avisos.join(" ")).toContain("new Function(");
    expect(c.avisos.join(" ")).toContain("import("); expect(c.avisos.join(" ")).toContain("node:*");
  });
  it("detecta secretos con forma real y rutas del disco (montados en tiempo de ejecución)", () => {
    const c = revisar(cand([SK, GSK, BEARER, RUTA].join("\n")));
    expect(c.avisos.join(" ")).toContain("sk-"); expect(c.avisos.join(" ")).toContain("gsk_");
    expect(c.avisos.join(" ")).toContain("Bearer"); expect(c.avisos.join(" ")).toContain("ruta absoluta");
    expect(c.avisos.join(" ")).not.toContain(SK);
  });
});

describe("aceptar: solo la mano, solo una capa de código de la molécula", () => {
  it("una IA no puede aceptar", () => {
    const r = aceptar(cand("uno\ntres"), ctx({ origen: "ia" }));
    expect(r).toMatchObject({ ok: false }); if (!r.ok) expect(r.motivo).toContain("mano");
  });
  it("un agente tampoco puede aceptar", () => {
    expect(aceptar(cand("uno\ntres"), ctx({ origen: "agente" }))).toMatchObject({ ok: false });
  });
  it("la mano acepta y reemplaza SOLO esa capa, sin mutar la entrada", () => {
    const base = ctx({ contenidos: { c1: "uno\ndos", c2: "otro" } }), r = aceptar(cand("uno\ntres"), base);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.candidato.estado).toBe("aceptado"); expect(r.contenidos).toEqual({ c1: "uno\ntres", c2: "otro" });
    expect(r.molecula.version).toBe(4); expect(r.molecula.actualizadaEn).toBe(10);
    expect(base.contenidos).toEqual({ c1: "uno\ndos", c2: "otro" });
  });
  it("un secreto bloquea la aceptación aunque sea la mano", () => {
    const r = aceptar(cand(`const k = "${SK}"`), ctx());
    expect(r).toMatchObject({ ok: false }); if (!r.ok) expect(r.motivo).toContain("secretos");
  });
  it("no acepta sobre una capa que no es de código", () => {
    expect(aceptar(cand("x"), ctx({ molecula: mol([capa("c1", "datos")]) }))).toMatchObject({ ok: false });
  });
  it("no acepta sobre una capa bloqueada ni sobre el núcleo", () => {
    expect(aceptar(cand("x"), ctx({ molecula: mol([capa("c1", "codigo", true)]) }))).toMatchObject({ ok: false });
    expect(aceptar(cand("x"), ctx({ molecula: mol([capa("nucleo/invariantes")]) }))).toMatchObject({ ok: false });
  });
  it("no acepta dos veces el mismo candidato", () => {
    const c = cand("x"), r = aceptar(c, ctx());
    expect(r.ok).toBe(true); expect(aceptar(rechazar(c), ctx())).toMatchObject({ ok: false });
  });
});

describe("diff línea a línea", () => {
  it("distingue cambios, adiciones y borrados con sus números", () => {
    expect(diff("a\nb\nc", "a\nB\nc\nd").map((l) => l.tipo)).toEqual(["igual", "cambio", "igual", "añadida"]);
    const e = diff("a\nb", "a"); expect(e.map((l) => l.tipo)).toEqual(["igual", "borrada"]);
    expect(e[1]).toMatchObject({ tipo: "borrada", original: "b", numeroOriginal: 2 });
    expect(diff("", "x")[0]).toMatchObject({ tipo: "añadida", propuesto: "x", numeroPropuesto: 1 });
  });
});
