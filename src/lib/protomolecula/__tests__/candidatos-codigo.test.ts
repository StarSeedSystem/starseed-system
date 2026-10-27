import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  aceptar, candidatosPendientes, diff, proponer, reiniciarCandidatos, revisar, tomarCandidato,
  type Candidato, type EntradaCandidato,
} from "../candidatos-codigo";
import type { Ambito, Autor, Capa, Molecula, Origen, Rol } from "../tipos";

const autor: Autor = { tipo: "agente", id: "astraura" };
const capa = (id = "capa-codigo", extra: Partial<Capa> = {}): Capa => ({
  id, tipo: "codigo", titulo: "Código", formato: "ts", referencia: null, orden: 0, visible: true, bloqueada: false, ...extra,
});
const molecula = (capas: Capa[], ambito: Ambito = "personal"): Molecula => ({
  id: "mol-1", titulo: "Prueba", ambito, capas, atomos: [], valores: {}, version: 0, creadaEn: 0, actualizadaEn: 0,
});
const entrada = (propuesto: string, original = "", capaId = "capa-codigo"): EntradaCandidato =>
  ({ capaId, lenguajeOrigen: "ts", propuesto, original, autor });
const nueva = (propuesto: string, original = "", capaId = "capa-codigo", id = "c-1"): Candidato =>
  proponer(entrada(propuesto, original, capaId), { ahora: () => 1, nuevoId: () => id });
const contexto = (capas: Capa[], rol: Rol | null = "dueno", origen?: Origen) => ({ molecula: molecula(capas), rol, origen });
/** Los ejemplos se montan en tiempo de ejecución: GitHub bloquea empujes con claves de ejemplo literales. */
const clave = (prefijo: string[]): string => prefijo.join("") + "claveDeEjemplo123456";

beforeEach(() => reiniciarCandidatos());

describe("proponer: guarda el candidato, no ejecuta ni toca la capa", () => {
  it("guarda el candidato y deja la molécula exactamente igual", () => {
    const m = molecula([capa()]), antes = JSON.stringify(m);
    const c = nueva("const x = 2;", "const x = 1;");
    expect(c).toMatchObject({ id: "c-1", capaId: "capa-codigo", lenguajeOrigen: "ts", estado: "propuesto", avisos: [] });
    expect(JSON.stringify(m)).toBe(antes);
    expect(candidatosPendientes().map((x) => x.id)).toEqual(["c-1"]);
    expect(tomarCandidato("c-1")?.id).toBe("c-1");
    expect(candidatosPendientes()).toHaveLength(0);
  });
});

describe("revisar: secretos y ejecución", () => {
  it("una clave con forma sk- se marca y bloquea la aceptación", () => {
    const c = nueva(`const k = "${clave(["s", "k", "-"])}";`, "", "capa-codigo", "c-sk");
    expect(c.avisos.join(" ")).toContain("secreto");
    const r = aceptar(c, contexto([capa()]));
    expect(r.ok).toBe(false); expect(r.motivo).toContain("secreto");
  });
  it("una clave con forma gsk_ se marca y bloquea la aceptación", () => {
    const c = nueva(`const k = "${clave(["g", "s", "k", "_"])}";`, "", "capa-codigo", "c-gsk");
    expect(revisar(c).avisos.join(" ")).toContain("gsk_");
    expect(aceptar(c, contexto([capa()])).ok).toBe(false);
  });
  it("una cabecera Bearer con token se marca y bloquea", () => {
    const bearer = ["B", "e", "a", "r", "e", "r"].join("") + " " + "tokenDeEjemplo123";
    const c = nueva(`headers = { Authorization: "${bearer}" };`, "", "capa-codigo", "c-bearer");
    expect(c.avisos.join(" ")).toContain("Bearer");
    expect(aceptar(c, contexto([capa()])).ok).toBe(false);
  });
  it("las rutas del disco se marcan y bloquean", () => {
    const usuarios = ["", "Users", "persona", "proyecto.ts"].join("/");
    const casa = ["", "home", "persona", "proyecto.ts"].join("/");
    expect(nueva("", usuarios, "capa-codigo", "c-u").avisos.join(" ")).toContain("/Users/");
    const c = nueva("", casa, "capa-codigo", "c-h");
    expect(c.avisos.join(" ")).toContain("/home/");
    expect(aceptar(c, contexto([capa()])).ok).toBe(false);
  });
  it("eval, new Function, import() y node: quedan como avisos de ejecución", () => {
    const c = nueva('eval("1");\nconst f = new Function("return 1");\nimport("./x");\nimport fs from "node:fs";', "", "capa-codigo", "c-ej");
    expect(c.avisos.filter((a) => a.startsWith("ejecución:"))).toHaveLength(4);
  });
});

describe("diff línea a línea", () => {
  it("señala un cambio y conserva las líneas iguales", () => {
    expect(diff("a\nb\nc", "a\nB\nc").map((x) => x.tipo)).toEqual(["igual", "cambio", "igual"]);
    expect(diff("a\nb", "a\nB")[1]).toMatchObject({ original: "b", propuesto: "B" });
  });
  it("señala adiciones", () => expect(diff("a\nc", "a\nb\nc").map((x) => x.tipo)).toEqual(["igual", "adicion", "igual"]));
  it("señala borrados", () => expect(diff("a\nb\nc", "a\nc").map((x) => x.tipo)).toEqual(["igual", "borrado", "igual"]));
});

describe("aceptar: solo la mano, solo la capa de código de la molécula", () => {
  it.each(["ia", "agente"] as const)("un origen %s no acepta, ni siendo dueño", (origen) => {
    const r = aceptar(nueva("const x = 2;", "", "capa-codigo", `c-${origen}`), contexto([capa()], "dueno", origen));
    expect(r.ok).toBe(false); expect(r.motivo).toContain("solo lo acepta una persona");
  });
  it("la mano con rol dueño acepta y entrega solo el contenido de la capa", () => {
    const escribir = vi.fn();
    const c = nueva("const x = 2;", "const x = 1;"), r = aceptar(c, { ...contexto([capa()]), escribir });
    expect(r).toMatchObject({ ok: true, contenido: "const x = 2;" }); expect(r.candidato?.estado).toBe("aceptado");
    expect(escribir).toHaveBeenCalledWith("capa-codigo", "const x = 2;");
  });
  it("rechaza una capa que no es de código", () => {
    const r = aceptar(nueva("x"), contexto([capa("capa-codigo", { tipo: "datos" })]));
    expect(r.ok).toBe(false); expect(r.motivo).toContain("no es de código");
  });
  it("rechaza una capa bloqueada", () => {
    const r = aceptar(nueva("x"), contexto([capa("capa-codigo", { bloqueada: true })]));
    expect(r.ok).toBe(false); expect(r.motivo).toContain("bloqueada");
  });
  it.each(["nucleo/invariantes", "invariantes"])("nunca toca el núcleo (%s)", (id) => {
    const r = aceptar(nueva("x", "", id), contexto([capa(id)]));
    expect(r.ok).toBe(false); expect(r.motivo).toContain("núcleo");
  });
  it("nunca reemplaza un archivo", () => {
    const r = aceptar(nueva("x"), contexto([capa("capa-codigo", { referencia: { tipo: "archivo", id: "src/x.ts" } })]));
    expect(r.ok).toBe(false); expect(r.motivo).toContain("archivo");
  });
  it("no acepta dos veces el mismo candidato", () => {
    const c = nueva("const x = 2;"), primera = aceptar(c, contexto([capa()]));
    const segunda = aceptar(primera.candidato as Candidato, contexto([capa()]));
    expect(segunda.ok).toBe(false); expect(segunda.motivo).toContain("ya está");
  });
  it("un observador no acepta aunque sea su propia mano", () => {
    expect(aceptar(nueva("x"), contexto([capa()], "observador")).ok).toBe(false);
  });
});
