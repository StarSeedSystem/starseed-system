import { describe, it, expect, beforeEach } from "vitest";
import {
  bloqueaAceptacion, aceptar, diff, proponer, revisar, tomarCandidato, descartarCandidato,
  candidatosPendientes, reiniciarCandidatos, CLASE_AVISO,
  type Candidato, type EntradaCandidato,
} from "../candidatos-codigo";
import type { Capa } from "../tipos";

/* Claves de ejemplo montadas en tiempo de ejecución (GitHub bloquea empujes con claves escritas). */
const claveSk = ["sk", "-abcdef0123", "x", "y"].join("");
const claveGem = ["g", "sk", "_bcdefghij0123"].join("");
const claveBearer = ["Bearer", " ", "xJ9k2mN4pQ7rT1vW"].join("");
const entrada = (propuesto = "const tono = 440;\n", extra: Partial<EntradaCandidato> = {}): EntradaCandidato =>
  ({ capaId: "capa-cod", lenguajeOrigen: "carbon", propuesto, original: "const tono = 432;\n", autor: { tipo: "agente", id: "astraura" }, ...extra });
const cand = (propuesto?: string, extra?: Partial<Candidato>): Candidato =>
  ({ ...entrada(propuesto), id: "cand-x", estado: "propuesto", avisos: [], ...extra });
const capa = (o: Partial<Capa> = {}): Capa => ({
  id: "capa-cod", tipo: "codigo", titulo: "Código", formato: "carbon", referencia: null, orden: 1, visible: true, bloqueada: false, ...o,
});
const mano = (capa_: Capa | null, contenido = "const tono = 432;\n") =>
  ({ rol: "dueno" as const, ambito: "personal" as const, origen: "mano" as const, capa: capa_, contenidoActual: contenido });
const igual = (t: string) => ({ tipo: "igual" as const, despues: t });
const rejet = (r: ReturnType<typeof aceptar>, dentro: string) => { expect(r.ok).toBe(false); if (!r.ok) expect(r.motivo).toContain(dentro); };

beforeEach(() => reiniciarCandidatos());

describe("candidatos de código (PM1010F7A, §8.2)", () => {
  it("proponer guarda el candidato en la cola (sin ejecutar nada ni tocar capas), ya revisado y con tope de ids únicos", () => {
    const c = proponer(entrada(), { nuevoId: () => "cand-1" });
    expect(c.id).toBe("cand-1");
    expect(c.estado).toBe("propuesto");
    expect(c.capaId).toBe("capa-cod");
    expect(c.propuesto).toContain("440");
    expect(proponer(entrada(`const fa = "${claveSk}";\n`)).avisos).toHaveLength(1);
    for (let i = 0; i < 6; i++) proponer(entrada());
    const cola = candidatosPendientes();
    expect(cola).toHaveLength(5);
    expect(new Set(cola.map((x) => x.id)).size).toBe(5);
  });
  it("revisar marca un aviso bloqueante por cada forma real de secreto", () => {
    for (const secreto of [claveSk, claveGem, claveBearer]) {
      const c = revisar(cand(`const clave = "${secreto}";\n`));
      expect(c.avisos).toHaveLength(1);
      expect(c.avisos[0].startsWith(`${CLASE_AVISO.secreto}:`)).toBe(true);
      expect(bloqueaAceptacion(c)).toBe(true);
    }
  });
  it("revisar marca avisos (no bloqueantes) de rutas del disco y de formas de ejecución", () => {
    for (const [visto, clase] of [["/Users/alex/Documents/tablas", CLASE_AVISO.ruta], ["/home/usuario/proyecto", CLASE_AVISO.ruta],
      ["C:\\Users\\alguien\\claves", CLASE_AVISO.ruta], ["eval(pedido)", CLASE_AVISO.ejecuta], ["new Function(pedido)", CLASE_AVISO.ejecuta],
      ["import(sam)", CLASE_AVISO.ejecuta], ["node:fs", CLASE_AVISO.ejecuta]] as const) {
      const c = revisar(cand(`mirar(${JSON.stringify(visto)});\n`));
      expect(c.avisos.some((a) => a.startsWith(`${clase}:`)), visto).toBe(true);
      expect(bloqueaAceptacion(c), visto).toBe(false);
    }
  });
  it("revisar no avisa por código normal; sí acota su propio diff (igual a igual = sin cambios)", () => {
    expect(revisar(cand()).avisos).toEqual([]);
    expect(diff("x\ny", "x\ny")).toEqual([igual("x"), igual("y")]);
  });
  it("diff: cambio, adición y borrado, línea a línea y sin librerías", () => {
    expect(diff("const a = 432;", "const a = 440;")).toEqual([{ tipo: "cambio", antes: "const a = 432;", despues: "const a = 440;" }]);
    expect(diff("a", "a\nb\nc")).toEqual([igual("a"), { tipo: "adiccion", despues: "b" }, { tipo: "adiccion", despues: "c" }]);
    expect(diff("a\nb\nc", "a")).toEqual([igual("a"), { tipo: "borrado", antes: "b" }, { tipo: "borrado", antes: "c" }]);
  });
  it("diff: combina cambio en medio con adición al final", () => {
    const d = diff("uno\n2\ntres\n4", "uno\ndos\ntres\nCUATRO\n5");
    expect(d.map((l) => l.tipo)).toEqual(["igual", "cambio", "igual", "cambio", "adiccion"]);
  });
  it("aceptar: una IA nunca acepta, solo la mano (decidir da el motivo)", () => {
    for (const origen of ["ia", "agente", "dictado", "midi", "osc"] as const) {
      const r = aceptar(cand(), { rol: "dueno", ambito: "personal", origen, capa: capa(), contenidoActual: "const tono = 432;\n" });
      expect(r.ok, origen).toBe(false);
      if (!r.ok) expect(r.motivo).toContain("código");
    }
  });
  it("aceptar: comentarista y observador miran; dueño o editor con la mano sí pasan el permiso", () => {
    for (const rol of ["comentarista", "observador"] as const) {
      const r = aceptar(cand(), { rol, ambito: "personal", origen: "mano", capa: capa(), contenidoActual: "const tono = 432;\n" });
      expect(r.ok, rol).toBe(false);
    }
    expect(aceptar(cand(), mano(capa())).ok).toBe(true);
    expect(aceptar(cand(), { rol: "editor", ambito: "personal", origen: "mano", capa: capa(), contenidoActual: "const tono = 432;\n" }).ok).toBe(true);
  });
  it("aceptar: solo capa código DE LA MOLÉCULA (nunca el núcleo), y las claves bloquean aunque quien toca sea la mano", () => {
    const c = cand();
    rejet(aceptar(c, mano({ ...capa(), tipo: "datos", titulo: "Tabla" })), "no de código");
    rejet(aceptar(c, mano({ ...capa(), titulo: "Fija", bloqueada: true })), "bloqueada");
    rejet(aceptar(c, mano(null)), "Falta");
    rejet(aceptar({ ...c, capaId: "src/lib/nucleo/invariantes" }, mano(capa())), "núcleo");
    rejet(aceptar({ ...c, propuesto: "importar lo de src/lib/nucleo\n" }, mano(capa())), "núcleo");
    rejet(aceptar(cand(`const va = "${claveGem}";\n`), mano(capa())), "clave");
  });
  it("aceptar: si la capa cambió desde la propuesta lo dice; si no, marca aceptado con el anterior", () => {
    rejet(aceptar(cand(), mano(capa(), "const tono = 432; lo otro;")), "cambió");
    const base = cand(`const donde = "/Users/ejemplo/piezas";\n`), r = aceptar(base, mano(capa()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.candidato.estado).toBe("aceptado");
      expect(r.candidato.avisos.some((a) => a.startsWith(`${CLASE_AVISO.ruta}:`))).toBe(true);
      expect(r.anterior).toBe("const tono = 432;\n");
      expect(r.candidato.propuesto).toBe(base.propuesto);
    }
  });
  it("la cola hermana: tomar y descartar sacan el candidato de la cola", () => {
    const c = proponer(entrada()), misma = tomarCandidato(c.id);
    expect(candidatosPendientes()).toHaveLength(0);
    expect(descartarCandidato(c.id)).toBe(false);
    expect(misma?.id).toBe(c.id);
    expect(descartarCandidato(proponer(entrada()).id)).toBe(true);
    expect(candidatosPendientes()).toHaveLength(0);
  });
});
