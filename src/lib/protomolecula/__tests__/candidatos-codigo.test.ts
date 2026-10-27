import { beforeEach, describe, expect, it } from "vitest";
import { aceptar, bloqueaAceptacion, candidatosDeCodigo, diff, proponer, rechazarCandidato, reiniciarCandidatos, revisar, tomarCandidato } from "../candidatos-codigo";
import type { Capa, Molecula, Origen, Rol } from "../tipos";
const CLAVE = ["s", "k-", "prueba", "4242"].join("");
const GSK = ["g", "sk_", "prueba", "4242"].join("");
const BEARER = ["Bear", "er ", "abcdef123456"].join("");
const AUTOR = { tipo: "agente" as const, id: "astraura" };
const capa = (extra: Partial<Capa> = {}): Capa => ({ id: "cod", tipo: "codigo", titulo: "Código", formato: "typescript", referencia: null, orden: 0, visible: true, bloqueada: false, ...extra });
const mol = (capas: Capa[]): Molecula => ({ id: "m1", titulo: "Molécula", ambito: "personal", capas, atomos: [], valores: {}, version: 3, creadaEn: 1, actualizadaEn: 1 });
const entrada = (extra: Record<string, unknown> = {}) => ({ capaId: "cod", lenguajeOrigen: "typescript", propuesto: "const a = 1;", original: "const a = 0;", autor: AUTOR, ...extra });
let n = 0;
const propon = (extra: Record<string, unknown> = {}) => {
  const r = proponer(entrada(extra), { nuevoId: () => `cand-${++n}` });
  if (!r.ok) throw new Error(r.motivo);
  return r.candidato;
};
const ctx = (extra: { molecula?: Molecula; rol?: Rol | null; origen?: Origen } = {}) =>
  ({ molecula: mol([capa()]), rol: "dueno" as Rol, origen: "mano" as Origen, ...extra });
const contenido = (m: Molecula, id = "cod") => (m.capas.find((c) => c.id === id) as Capa & { contenido?: string } | undefined)?.contenido;
beforeEach(() => { reiniciarCandidatos(); n = 0; });
describe("proponer · guarda sin ejecutar", () => {
  it("deja el candidato en la cola y no toca la molécula ni la capa", () => {
    const antes = ctx().molecula, c = propon();
    expect(c).toMatchObject({ id: "cand-1", capaId: "cod", estado: "propuesto", autor: AUTOR });
    expect(candidatosDeCodigo()).toHaveLength(1);
    expect(ctx().molecula).toEqual(antes);
  });
  it("exige capa y texto: no inventa un destino", () => {
    expect(proponer(entrada({ capaId: "" }))).toMatchObject({ ok: false, motivo: expect.stringContaining("Falta «capa»") });
    expect(proponer(entrada({ propuesto: "   " }))).toMatchObject({ ok: false, motivo: expect.stringContaining("Falta «propuesto»") });
  });
  it("nunca propone sobre el núcleo ni sobre invariantes", () => {
    for (const id of ["src/lib/nucleo/invariantes.ts", "nucleo/tipos", "invariantes"]) {
      expect(proponer(entrada({ capaId: id }))).toMatchObject({ ok: false, motivo: expect.stringContaining("núcleo es intocable") });
    }
    expect(candidatosDeCodigo()).toHaveLength(0);
  });
});
describe("revisar · secretos y riesgos", () => {
  it("marca una clave «sk-» y bloquea la aceptación sin repetirla entera", () => {
    const c = revisar(propon({ propuesto: `const clave = "${CLAVE}";` }));
    expect(c.avisos.join(" ")).toContain("secreto:");
    expect(c.avisos.join(" ")).not.toContain(CLAVE);
    expect(bloqueaAceptacion(c)).toBe(true);
  });
  it("marca «gsk_» y una cabecera «Bearer»", () => {
    const c = revisar(propon({ original: `Authorization: ${BEARER}`, propuesto: `const k = "${GSK}";` }));
    expect(c.avisos.filter((a) => a.startsWith("secreto:"))).toHaveLength(2);
    expect(bloqueaAceptacion(c)).toBe(true);
  });
  it("marca rutas del disco montadas en tiempo de ejecución", () => {
    const home = ["/ho", "me/ana/codigo.ts"].join("");
    const users = ["/Us", "ers/ana/codigo.ts"].join("");
    const c = revisar(propon({ original: home, propuesto: `const ruta = "${users}";` }));
    expect(c.avisos.filter((a) => a.startsWith("secreto:"))).toHaveLength(2);
  });
  it("marca eval, new Function, import() y node: pero eso solo avisa, no bloquea", () => {
    const c = revisar(propon({ propuesto: "eval('1'); new Function('a'); import('x'); import 'node:fs';" }));
    expect(c.avisos).toEqual(expect.arrayContaining(["riesgo: usa eval", "riesgo: usa new Function", "riesgo: usa import() dinámico", "riesgo: importa node:*"]));
    expect(bloqueaAceptacion(c)).toBe(false);
  });
});
describe("diff · línea a línea", () => {
  it("señala las líneas cambiadas sin tocar las iguales", () => {
    expect(diff("uno\ndos\ntres", "uno\nDOS\ntres")).toEqual([{ tipo: "igual", texto: "uno", linea: 1 }, { tipo: "cambio", texto: "dos", nuevo: "DOS", linea: 2 }, { tipo: "igual", texto: "tres", linea: 3 }]);
  });
  it("señala las líneas añadidas", () => {
    expect(diff("a\nc", "a\nb\nc")).toEqual([{ tipo: "igual", texto: "a", linea: 1 }, { tipo: "añadida", texto: "b", linea: 2 }, { tipo: "igual", texto: "c", linea: 2 }]);
  });
  it("señala las líneas borradas", () => {
    expect(diff("a\nb\nc", "a\nc")).toEqual([{ tipo: "igual", texto: "a", linea: 1 }, { tipo: "borrada", texto: "b", linea: 2 }, { tipo: "igual", texto: "c", linea: 3 }]);
  });
});
describe("aceptar · solo la mano, solo una capa de código", () => {
  it("una IA o un agente no aceptan aunque sean dueños", () => {
    for (const origen of ["ia", "agente"] as const) {
      expect(aceptar(propon(), ctx({ origen }))).toMatchObject({ ok: false, motivo: expect.stringContaining("Solo una persona") });
    }
  });
  it("la mano reemplaza solo el contenido de la capa de código", () => {
    const antes = mol([capa(), capa({ id: "datos", tipo: "datos", formato: "json" })]);
    const r = aceptar(propon(), ctx({ molecula: antes }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(contenido(r.molecula)).toBe("const a = 1;");
    expect(r.molecula.version).toBe(4);
    expect(contenido(antes)).toBeUndefined();
    expect(r.molecula.capas.find((c) => c.id === "datos")).toEqual(antes.capas[1]);
    expect(r.candidato.estado).toBe("aceptado");
  });
  it("un secreto no se puede aceptar ni con la mano", () => {
    const r = aceptar(propon({ propuesto: `const k = "${CLAVE}";` }), ctx());
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining("secreto") });
  });
  it("una capa que no es de código se rechaza", () => {
    const r = aceptar(propon(), ctx({ molecula: mol([capa({ tipo: "datos", formato: "json" })]) }));
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining("no de código") });
  });
  it("una capa bloqueada espera a que la persona la desbloquee", () => {
    const r = aceptar(propon(), ctx({ molecula: mol([capa({ bloqueada: true })]) }));
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining("bloqueada") });
  });
  it("sin capa en la molécula no crea archivos ni capas", () => {
    const r = aceptar(propon({ capaId: "otra" }), ctx());
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining("no crea archivos") });
  });
  it("un rol que solo mira no acepta; la cola permite tomar y rechazar", () => {
    expect(aceptar(propon(), ctx({ rol: "observador" }))).toMatchObject({ ok: false, motivo: expect.stringContaining("observador") });
    const c = propon();
    expect(rechazarCandidato(c.id)).toBe(true);
    expect(candidatosDeCodigo().find((x) => x.id === c.id)?.estado).toBe("rechazado");
    expect(tomarCandidato(c.id)?.id).toBe(c.id);
    expect(candidatosDeCodigo().find((x) => x.id === c.id)).toBeUndefined();
  });
});
