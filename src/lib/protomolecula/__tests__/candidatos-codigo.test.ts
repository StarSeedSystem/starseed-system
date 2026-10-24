import { describe, it, expect } from "vitest";
import { proponer, revisar, avisosDe, haySecretos, diff, aceptar, rechazar, AVISO_SECRETO, type Candidato } from "../candidatos-codigo";
import type { Molecula, Capa } from "../tipos";

/** Las cadenas de ejemplo se montan EN TIEMPO DE EJECUCIÓN: ninguna clave ni ruta literal en el repo. */
const clave = (forma: string) => forma + "a".repeat(24), DINERO = clave("sk-"), GSI = clave("gsk_"), PORTADOR = "Bearer " + "x".repeat(24);
const rutaDisco = [["/", "Users", "alex", "claves", "secreto"].join("/"), ["C:", "Users", "alex", "claves"].join("\\")];
const capa = (por: Partial<Capa> = {}): Capa => ({ id: "c-1", tipo: "codigo", titulo: "Script", formato: "ts", referencia: null, orden: 1, visible: true, bloqueada: false, ...por });
const mol = (capas: Capa[] = [capa()], por: Partial<Molecula> = {}): Molecula => ({ id: "mol-1", titulo: "Prueba", ambito: "personal", capas, atomos: [], valores: {}, version: 0, creadaEn: 0, actualizadaEn: 0, ...por });
const base = (): Candidato => ({ id: "k1", capaId: "c-1", lenguajeOrigen: "ts", propuesto: "dibujar(1)", original: "dibujar(0)", autor: { tipo: "agente", id: "astraura" }, estado: "propuesto", avisos: [] });
const mano = (o: Partial<Parameters<typeof aceptar>[1]> = {}): Parameters<typeof aceptar>[1] => ({ molecula: mol(), rol: "dueno", confirmado: true, ...o });

describe("proponer · candidato guardado SIN ejecutar ni tocar la capa", () => {
  it("guarda el candidato en estado «propuesto» y la capa no cambia", () => {
    const c = capa(), m = mol([c]);
    const k = proponer({ capaId: "c-1", original: "dibujar(0)", propuesto: "dibujar(1)", lenguajeOrigen: "ts", autor: { tipo: "agente", id: "astraura" } }, { nuevoId: () => "k-1" });
    expect(k).toMatchObject({ id: "k-1", estado: "propuesto", avisos: [], capaId: "c-1" });
    expect(m.capas[0]).toBe(c);
  });
  it("revisar marca avisos sin cambiar estado, texto ni capa", () => {
    const k = revisar(base());
    expect(k.estado).toBe("propuesto"); expect(k.propuesto).toBe("dibujar(1)"); expect(k.avisos).toEqual([]);
  });
  it("los avisos dicen la FORMA del problema y jamás ecoan el texto marcado", () => {
    const a = avisosDe(`const k = "${DINERO}";\n${rutaDisco[0]}\nnew Function("boom")\nimport("x")\nnode:fs`);
    expect(a.length).toBeGreaterThanOrEqual(4); expect(a.join("\n")).not.toContain(DINERO); expect(a.join("\n")).not.toContain(rutaDisco[0]);
  });
});

describe("diff · línea a línea, sin librerías", () => {
  it("detecta cambios, adiciones y borrados; sin cambio sale vacío", () => {
    const d = diff("A\nB\nC", "A\nB\nC");
    expect(d).toEqual([]);
    const e = diff("A\nB\nC", "A\nX\nZ");
    expect(e).toEqual([{ tipo: "igual", texto: "A" }, { tipo: "cambio", de: "B", a: "X" }, { tipo: "cambio", de: "C", a: "Z" }]);
    const consA = diff("A", "A\nB\nC");
    expect(consA).toEqual([{ tipo: "igual", texto: "A" }, { tipo: "anadido", texto: "B" }, { tipo: "anadido", texto: "C" }]);
    const sinB = diff("A\nB\nC", "A\nC");
    expect(sinB).toEqual([{ tipo: "igual", texto: "A" }, { tipo: "borrado", texto: "B" }, { tipo: "igual", texto: "C" }]);
  });
});

describe("aceptar · SOLO una persona con la mano, sobre una capa de código de la molécula", () => {
  const fallo = (r: ReturnType<typeof aceptar>): string => (r.ok ? `no debía aceptar: ${JSON.stringify(r)}` : r.motivo);
  it("una IA o un agente NO puede aceptar: el código solo lo acepta una persona, con la mano", () => {
    const r = aceptar(base(), mano({ origen: "ia" }));
    expect(r.ok).toBe(false); expect(fallo(r)).toContain("solo lo acepta una persona");
    expect(aceptar(base(), mano({ origen: "agente" })).ok).toBe(false);
  });
  it("con la mano sin confirmar queda pendiente; confirmada, llega el contenido a la capa", () => {
    const pend = aceptar(base(), mano({ confirmado: undefined }));
    expect(fallo(pend)).toBe("Pendiente de que la persona confirme en el panel.");
    let recibido: { capaId: string; contenido: string } | null = null;
    const r = aceptar(base(), { molecula: mol([capa()]), rol: "dueno", confirmado: true, aplicar: (m, id, contenido) => { recibido = { capaId: id, contenido }; return m; } });
    if (!r.ok) throw new Error(r.motivo);
    expect(recibido).toEqual({ capaId: "c-1", contenido: "dibujar(1)" });
    expect(r.candidato.estado).toBe("aceptado"); expect(r.capa.tipo).toBe("codigo");
  });
  it("un rol de solo mirar tampoco acepta", () => {
    expect(aceptar(base(), mano({ rol: "comentarista" })).ok).toBe(false);
  });
  it("un secreto en propuesto o en original BLOQUEA, aunque alguien pida la mano", () => {
    expect(fallo(aceptar({ ...base(), propuesto: DINERO }, mano()))).toContain(`secretos (${AVISO_SECRETO})`);
    expect(aceptar({ ...base(), original: PORTADOR }, mano()).ok).toBe(false);
    expect(aceptar({ ...base(), avisos: [AVISO_SECRETO] }, mano()).ok).toBe(false);
  });
  it("capa que no es de código o con entidad cita: no pasa", () => {
    expect(fallo(aceptar(base(), mano({ molecula: mol([capa({ tipo: "datos" })]) })))).toContain("capa de código");
    expect(fallo(aceptar(base(), mano({ molecula: mol([capa({ referencia: { tipo: "codigo", id: "e-9" } })]) })))).toContain("rama");
  });
  it("candidato sobre una capa bloqueada o una capa que no existe: no pasa", () => {
    expect(fallo(aceptar(base(), mano({ molecula: mol([capa({ bloqueada: true })]) })))).toContain("bloqueada");
    expect(fallo(aceptar({ ...base(), capaId: "fantasma" }, mano()))).toContain("No hay capa");
  });
  it("solo se acepta una vez: un candidato ya aceptado no se repite", () => {
    expect(fallo(aceptar({ ...base(), estado: "aceptado" }, mano()))).toContain("ya está");
  });
});

describe("revisar · secretos con la forma real BLOQUEAN; sospechosos avisan", () => {
  it("sk- y gsk_ y Bearer se marcan y bloquean", () => {
    for (const forma of [DINERO, GSI, PORTADOR]) {
      const k = revisar({ ...base(), propuesto: forma });
      expect(haySecretos(k.avisos)).toBe(true); expect(k.avisos).toContain(AVISO_SECRETO);
      expect(avisosDe("lo que no avisa (texto común)")).toEqual([]);
    }
  });
  it("eval, new Function, import() y node: avisan; el núcleo también se marca", () => {
    const a = avisosDe('(x) => eval("boom") + new Function("f") + import("m") + node:fs + nucleo/invariantes');
    const junta = a.join(" · ");
    expect(junta).toContain("ejecutar código"); expect(junta).toContain("node:*"); expect(junta).toContain("núcleo"); expect(haySecretos(a)).toBe(false);
  });
  it("rechazar deja el candidato en «rechazado» con el motivo en avisos", () => {
    const r = rechazar(base(), "no me gusta");
    expect(r.estado).toBe("rechazado"); expect(r.avisos).toContain("no me gusta"); expect(r.propuesto).toBe("dibujar(1)");
  });
});
