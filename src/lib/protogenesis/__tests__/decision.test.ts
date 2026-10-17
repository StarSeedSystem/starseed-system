import { describe, test, expect } from "vitest";
import { decidirResultado, propuestaMetaGenesis } from "../decision";
import type { Ambito } from "@/lib/protomolecula/tipos";
import type { Encargo } from "../encargo";
import { rangoDeRol } from "@/lib/genesis/operaciones";

describe("decidirResultado", () => {
  let base = { ambito: "personal" as Ambito, esDueno: false, rol: null as string | null, democratico: false, tocaFueraDeLaMolecula: false };
  const t = (o) => ({ ...base, ...o });

  test("tocaFuera -> proposer-metagenesis", () => {
    const r = decidirResultado(t({ tocaFueraDeLaMolecula: true }));
    expect(r.modo).toBe("proponer-metagenesis");
    expect(r.motivo).toBe("un átomo, un conversor o código del OS lo decide MetaGenesis");
  });

  test("personal, esDueno true -> aceptar", () => {
    const r = decidirResultado(t({ ambito: "personal" as Ambito, esDueno: true }));
    expect(r.modo).toBe("aceptar");
    expect(r.motivo).toBe("Eres el dueño de esta molécula");
  });

  test("personal, esDueno false -> sin-permiso", () => {
    const r = decidirResultado(t({ ambito: "personal" as Ambito, esDueno: false }));
    expect(r.modo).toBe("sin-permiso");
    expect(r.motivo).toBe("No eres el dueño de esta molécula");
  });

  test("perfil, esDueno true -> aceptar", () => {
    const r = decidirResultado(t({ ambito: "perfil" as Ambito, esDueno: true }));
    expect(r.modo).toBe("aceptar");
    expect(r.motivo).toBe("Eres el dueño de esta molécula");
  });

  test("perfil, esDueno false -> sin-permiso", () => {
    const r = decidirResultado(t({ ambito: "perfil" as Ambito, esDueno: false }));
    expect(r.modo).toBe("sin-permiso");
    expect(r.motivo).toBe("No eres el dueño de esta molécula");
  });

  test("grupo, owner, !democ -> aplicar -> aceptar", () => {
    const r = decidirResultado(t({ ambito: "grupo" as Ambito, esDueno: false, rol: "owner", democratico: false }));
    expect(r.modo).toBe("aceptar");
    expect(r.motivo).toBe("Tienes rol de gestión en esta entidad.");
  });

  test("grupo, editor, !democ -> sin-permiso", () => {
    const r = decidirResultado(t({ ambito: "grupo" as Ambito, esDueno: false, rol: "editor", democratico: false }));
    expect(r.modo).toBe("sin-permiso");
    expect(r.motivo).toBe("En modo jerárquico solo aplican cambios quienes tienen rol de gestión (o la cuenta dueña).");
  });

  test("grupo, editor, democ -> proponer -> proposer-voto", () => {
    const r = decidirResultado(t({ ambito: "grupo" as Ambito, esDueno: false, rol: "editor", democratico: true }));
    expect(r.modo).toBe("proponer-voto");
    expect(r.motivo).toBe("Esta entidad decide en democracia: cada cambio se convierte en una propuesta que se vota.");
  });

  test("grupo, observer, democ -> sin-permiso", () => {
    const r = decidirResultado(t({ ambito: "grupo" as Ambito, esDueno: false, rol: "observer", democratico: true }));
    expect(r.modo).toBe("sin-permiso");
    expect(r.motivo).toBe("Para proponer cambios necesitas al menos rol de colaboración en esta entidad.");
  });

  test("publica, same as grupo", () => {
    const r = decidirResultado(t({ ambito: "publica" as Ambito, esDueno: false, rol: "owner", democratico: false }));
    expect(r.modo).toBe("aceptar");
    expect(r.motivo).toBe("Tienes rol de gestión en esta entidad.");
  });
});

describe("propuestaMetaGenesis", () => {
  let base = { id: "e", moleculaId: "m", ambito: "personal" as Ambito, intencion: "i", criterios: [], autor: { tipo: "persona", id: "a" }, origen: "t", creadoEn: Date.now() };

  test("id format", () => {
    const r = propuestaMetaGenesis(base, { tipo: "a", detalle: "f" });
    expect(/^PGM[0-9a-f]{8}$/.test(r.id)).toBe(true);
  });

  test("id stable", () => {
    const f = { tipo: "a", detalle: "f" };
    const r1 = propuestaMetaGenesis(base, f);
    const r2 = propuestaMetaGenesis(base, f);
    expect(r1.id).toBe(r2.id);
  });

  test("titulo", () => {
    const r = propuestaMetaGenesis(base, { tipo: "c", detalle: "f" });
    expect(r.titulo).toBe(`Propuesta de MetaGenesis: c`);
  });

  test("archivos y depende vacíos", () => {
    const r = propuestaMetaGenesis(base, { tipo: "o", detalle: "a" });
    expect(r.archivos).toEqual([]);
    expect(r.depende).toEqual([]);
  });

  test("prompt personal no incluye intención", () => {
    const r = propuestaMetaGenesis({ ...base, ambito: "personal" }, { tipo: "a", detalle: "f" });
    expect(r.prompt).toBe(`Tipo de lo que falta: a`);
    expect(r.prompt).not.toContain(base.intencion);
  });

  test("prompt no personal incluye intención y falta", () => {
    const r = propuestaMetaGenesis({ ...base, ambito: "grupo" }, { tipo: "a", detalle: "f" });
    expect(r.prompt).toContain(base.intencion);
    expect(r.prompt).toContain("a");
    expect(r.prompt).toContain("f");
  });
});