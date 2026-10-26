import { beforeEach, describe, expect, it } from "vitest";
import { aceptar, diff, esAvisoDeSecreto, limpiarCandidatos, listarCandidatos, obtenerCandidato, proponer, rechazar, revisar, type Candidato } from "../candidatos-codigo";
import type { Ambito, Autor, Capa, Molecula, Origen } from "../tipos";

/** Los ejemplos con forma de clave se montan en EJECUCIÓN: GitHub bloquea empujes con claves de ejemplo. */
const SK = ["sk", "1a2B3c4D5e6F7g8H9i0J"].join("-"), GSK = ["gsk", "1a2B3c4D5e6F7g8H9i"].join("_");
const BEARER = ["Bearer", "1a2b3c4d5e6f7g8h9i"].join(" ");
const capaC = (extra: Partial<Capa> & { texto?: string } = {}): Capa =>
  ({ id: "capa-c", tipo: "codigo", titulo: "Código", formato: "javascript", referencia: null, orden: 1, visible: true, bloqueada: false, ...extra });
const capaD = (extra: { texto?: string } = {}): Capa => capaC({ id: "capa-d", tipo: "datos", formato: "json", ...extra });
const mol = (capas: Capa[], ambito: Ambito = "personal"): Molecula =>
  ({ id: "mol-1", titulo: "Prueba", ambito, capas, atomos: [], valores: {}, version: 0, creadaEn: 0, actualizadaEn: 0 });
type Entrada = Parameters<typeof proponer>[0];
const BASE: Entrada = { capaId: "capa-c", lenguajeOrigen: "javascript", original: "const a = 1;", propuesto: "const a = 2;", autor: { tipo: "agente", id: "astraura" } as Autor };
const crear = (extra: Partial<Entrada> = {}): Candidato => {
  const r = proponer({ ...BASE, ...extra });
  if (!r.ok) throw new Error(r.motivo);
  return r.candidato;
};
interface Como { rol?: Parameters<typeof aceptar>[1]["rol"]; origen?: Origen; m?: Molecula }
const aceptarCon = (c: Candidato, o: Como = {}) =>
  aceptar(c, { rol: o.rol ?? "dueno", origen: o.origen ?? "mano", molecula: o.m ?? mol([capaC({ texto: "const a = 1;" })]) });
beforeEach(() => limpiarCandidatos());

describe("candidatos de código (contrato §8.2)", () => {
  it("proponer guarda el candidato sin ejecutar nada ni tocar la capa", () => {
    const m = mol([capaC({ texto: "const a = 1;" })]), antes = JSON.stringify(m), c = crear();
    expect(c).toMatchObject({ estado: "propuesto", capaId: "capa-c", original: "const a = 1;", propuesto: "const a = 2;" });
    expect(c.avisos).toEqual([]); expect(obtenerCandidato(c.id)).toEqual(c); expect(listarCandidatos()).toHaveLength(1);
    expect((m.capas[0] as { texto?: string }).texto).toBe("const a = 1;"); expect(JSON.stringify(m)).toBe(antes);
  });
  it("revisar marca avisos por FORMA: secreto, ejecución y ruta de disco", () => {
    const c = crear({ propuesto: `const k = "${SK}";\neval(k);\nconst p = "/home/alex/secreto";` });
    expect(c.avisos).toHaveLength(3); expect(c.avisos.some(esAvisoDeSecreto)).toBe(true);
    expect(c.avisos.some((a) => a.startsWith("ejecución:") && a.includes("eval"))).toBe(true);
    expect(c.avisos.some((a) => a.startsWith("ruta:"))).toBe(true);
  });
  it("los secretos sk-, gsk_ y Bearer bloquean la aceptación", () => {
    for (const propuesto of [`const k = "${SK}";`, `const k = "${GSK}";`, `const h = "${BEARER}";`]) {
      const limpio = crear(), r = aceptarCon(crear({ propuesto }));
      expect(r.ok).toBe(false); if (!r.ok) expect(r.motivo).toContain("secreto");
      expect(aceptarCon(limpio).ok).toBe(true);
    }
  });
  it("una IA no acepta, jamás: solo la mano de un editor o dueño", () => {
    for (const origen of ["ia", "agente", "dictado", "midi"] as const) {
      const r = aceptarCon(crear(), { origen });
      expect(r.ok).toBe(false); if (!r.ok) expect(r.motivo).toContain("persona");
    }
    expect(aceptarCon(crear(), { rol: "comentarista" }).ok).toBe(false);
    expect(aceptarCon(crear(), { rol: "observador" }).ok).toBe(false);
    expect(aceptarCon(crear(), { rol: "editor" }).ok).toBe(true);
  });
  it("capa que no es de código: no se acepta", () => {
    const r = aceptarCon(crear({ capaId: "capa-d" }), { m: mol([capaC({ texto: "const a = 1;" }), capaD({ texto: "{}" })]) });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.motivo).toContain("«codigo»");
  });
  it("candidato sobre una capa bloqueada: no se toca nada", () => {
    const r = aceptarCon(crear({ capaId: "capa-b" }), { m: mol([capaC({ id: "capa-b", bloqueada: true, texto: "const a = 1;" })]) });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.motivo).toContain("bloqueada");
  });
  it("la capa cambió desde que se propuso: hay que volver a pedirlo", () => {
    const r = aceptarCon(crear(), { m: mol([capaC({ texto: "const b = 9;" })]) });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.motivo).toContain("cambió");
  });
  it("aceptar con la mano reemplaza SOLO el texto de esa capa", () => {
    const r = aceptarCon(crear(), { m: mol([capaC({ texto: "const a = 1;" }), capaD({ texto: "{\"x\":1}" })]) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.capa.texto).toBe("const a = 2;"); expect(r.molecula.version).toBe(1); expect(r.candidato.estado).toBe("aceptado");
      expect((r.molecula.capas.find((k) => k.id === "capa-d") as { texto?: string }).texto).toBe("{\"x\":1}");
    }
    expect(listarCandidatos()[0].estado).toBe("aceptado");
  });
  it("no se acepta dos veces ni después de rechazarlo", () => {
    const c = crear();
    expect(aceptarCon(c).ok).toBe(true); expect(aceptarCon(c).ok).toBe(false);
    const d = crear(); expect(rechazar(d).estado).toBe("rechazado"); expect(aceptarCon(d).ok).toBe(false);
  });
  it("diff: cambio, adición y borrado línea a línea sin librerías", () => {
    expect(diff("a\nb\nx\nc", "a\nb\nc")).toEqual([{ texto: "a", tipo: "igual" }, { texto: "b", tipo: "igual" }, { texto: "x", tipo: "borrado" }, { texto: "c", tipo: "igual" }]);
    const r = diff("a\nb\nc", "a\nB\nd\ne");
    expect(r).toContainEqual({ texto: "a", tipo: "igual" }); expect(r).toContainEqual({ texto: "b → B", tipo: "cambiado" });
    expect(r).toContainEqual({ texto: "c → d", tipo: "cambiado" }); expect(r).toContainEqual({ texto: "e", tipo: "añadido" });
  });
  it("diff de idénticos y de una línea cambiada", () => {
    expect(diff("justo\nen la mitad", "justo\nen la mitad")).toEqual([{ texto: "justo", tipo: "igual" }, { texto: "en la mitad", tipo: "igual" }]);
    expect(diff("const a = 1;", "const a = 2;")).toEqual([{ texto: "const a = 1; → const a = 2;", tipo: "cambiado" }]);
  });
  it("la cola guarda, lista y filtra por capa, y respeta el tope de 64 KB", () => {
    crear(); crear({ capaId: "capa-d" });
    expect(listarCandidatos()).toHaveLength(2); expect(listarCandidatos("capa-c")).toHaveLength(1);
    expect(listarCandidatos("capa-z")).toHaveLength(0);
    const grande = proponer({ ...BASE, capaId: "capa-e", propuesto: "x".repeat(70_000) });
    expect(grande.ok).toBe(false); if (!grande.ok) expect(grande.motivo).toContain("tope");
    expect(proponer({ ...BASE, capaId: "" }).ok).toBe(false);
  });
  it("conversión de lenguaje propuesta: se guarda y se lista igual, sin ejecutar", () => {
    const c = crear({ lenguajeOrigen: "javascript", lenguajeDestino: "typescript", propuesto: "const a: number = 1;" });
    expect(c.lenguajeDestino).toBe("typescript"); expect(c.estado).toBe("propuesto"); expect(revisar(c).avisos).toEqual([]);
  });
  it("avisos de ejecución: eval, new Function, import( y node:", () => {
    for (const trozo of ["eval(x)", "new Function(\"x\")", "await import(x)", "fs from \"node:fs\""])
      expect(crear({ propuesto: trozo }).avisos.some((a) => a.startsWith("ejecución:"))).toBe(true);
  });
});
