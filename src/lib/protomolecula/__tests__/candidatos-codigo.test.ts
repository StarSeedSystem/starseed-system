import { describe, it, expect } from "vitest";
import { proponer, revisar, diff, aceptar } from "../candidatos-codigo";
import type { Autor, Molecula } from "../tipos";

const autorAgente: Autor = { tipo: "agente", id: "astraura" };
const autorPersona: Autor = { tipo: "persona", id: "u1" };

function moleculaConCapa(capa: { id: string; tipo: "codigo"; bloqueada?: boolean }) {
  const m: Molecula = {
    id: "m1",
    titulo: "t",
    ambito: "personal",
    capas: [{
      id: capa.id,
      tipo: capa.tipo,
      titulo: "c",
      formato: "ts",
      referencia: null,
      orden: 0,
      visible: true,
      bloqueada: !!capa.bloqueada,
    }],
    atomos: [],
    valores: {},
    version: 1,
    creadaEn: 0,
    actualizadaEn: 0,
  };
  return m;
}

describe("candidatos-codigo", () => {
  it("propone candidato", () => {
    const c = proponer({ capaId: "c1", lenguajeOrigen: "ts", propuesto: "a", original: "b", autor: autorAgente });
    expect(c.estado).toBe("propuesto");
    expect(c.capaId).toBe("c1");
  });

  it("revisar detecta secretos", () => {
    const secreto = "const k = " + ["sk-", "AbC123xyz01"].join("");
    const c = proponer({ capaId: "c1", lenguajeOrigen: "ts", propuesto: secreto, original: "", autor: autorAgente });
    const r = revisar(c);
    expect(r.avisos).toContain("secreto detectado");
  });

  it("revisar detecta eval", () => {
    const c = proponer({ capaId: "c1", lenguajeOrigen: "js", propuesto: "eval('1')", original: "", autor: autorAgente });
    const r = revisar(c);
    expect(r.avisos).toContain("uso de eval");
  });

  it("diff muestra cambios", () => {
    const d = diff("a\nb", "a\nc");
    expect(d).toContain("- b");
    expect(d).toContain("+ c");
  });

  it("diff adiciones", () => {
    const d = diff("a", "a\nb");
    expect(d).toContain("+ b");
  });

  it("diff borrados", () => {
    const d = diff("a\nb", "a");
    expect(d).toContain("- b");
  });

  it("aceptar requiere mano", () => {
    const c = proponer({ capaId: "c1", lenguajeOrigen: "ts", propuesto: "x", original: "y", autor: autorAgente });
    const m = moleculaConCapa({ id: "c1", tipo: "codigo" });
    const res = aceptar(c, { molecula: m, decidir: () => false });
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain("decisión denegada");
  });

  it("secretos bloquean aceptación", () => {
    const secreto = ["sk-", "AbC123xyz01"].join("");
    const c = proponer({ capaId: "c1", lenguajeOrigen: "ts", propuesto: secreto, original: "", autor: autorAgente });
    const m = moleculaConCapa({ id: "c1", tipo: "codigo" });
    const res = aceptar(c, { molecula: m, decidir: () => true });
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain("secretos");
  });

  it("capa no código rechaza", () => {
    const c = proponer({ capaId: "c1", lenguajeOrigen: "ts", propuesto: "x", original: "y", autor: autorAgente });
    const m: Molecula = {
      id: "m1", titulo: "t", ambito: "personal",
      capas: [{ id: "c1", tipo: "datos", titulo: "c", formato: "json", referencia: null, orden: 0, visible: true, bloqueada: false }],
      atomos: [], valores: {}, version: 1, creadaEn: 0, actualizadaEn: 0,
    };
    const res = aceptar(c, { molecula: m, decidir: () => true });
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain("no es de código");
  });

  it("capa bloqueada rechaza", () => {
    const c = proponer({ capaId: "c1", lenguajeOrigen: "ts", propuesto: "x", original: "y", autor: autorAgente });
    const m = moleculaConCapa({ id: "c1", tipo: "codigo", bloqueada: true });
    const res = aceptar(c, { molecula: m, decidir: () => true });
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain("bloqueada");
  });

  it("acepta con mano y sin avisos", () => {
    const c = proponer({ capaId: "c1", lenguajeOrigen: "ts", propuesto: "const x=1", original: "const x=0", autor: autorAgente });
    const m = moleculaConCapa({ id: "c1", tipo: "codigo" });
    const res = aceptar(c, { molecula: m, decidir: () => true });
    expect(res.ok).toBe(true);
    expect(res.candidato?.estado).toBe("aceptado");
    expect(res.molecula?.version).toBe(2);
  });
});
