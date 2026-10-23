/**
 * TESTS PG1013D · decidirResultado y propuestaMetaGenesis. Solo funciones puras.
 */
import { describe, it, expect } from "vitest";
import { decidirResultado, propuestaMetaGenesis } from "../decision";
import type { EntradaDecision } from "../decision";
import type { Encargo } from "../encargo";

const entradaBase: EntradaDecision = {
  ambito: "personal",
  esDueno: true,
  tocaFueraDeLaMolecula: false,
};

const encargo: Encargo = {
  id: "enc1",
  moleculaId: "mol1",
  ambito: "publica",
  intencion: "Crear una imagen con la escena",
  criterios: [{ tipo: "formato", valor: "png", texto: "que salga en png" }],
  autor: { tipo: "persona", id: "user1" },
  origen: "texto",
  creadoEn: 1730000000000,
};

describe("decidirResultado", () => {
  it("tocar fuera de la molécula → proponer-metagenesis", () => {
    const r = decidirResultado({ ...entradaBase, tocaFueraDeLaMolecula: true });
    expect(r.modo).toBe("proponer-metagenesis");
    expect(r.motivo).toContain("MetaGenesis");
  });

  it("personal y perfil → aceptar solo si es dueño", () => {
    expect(decidirResultado({ ...entradaBase, ambito: "personal" }).modo).toBe("aceptar");
    expect(decidirResultado({ ...entradaBase, ambito: "perfil" }).modo).toBe("aceptar");
    expect(decidirResultado({ ...entradaBase, ambito: "personal", esDueno: false }).modo).toBe("sin-permiso");
    expect(decidirResultado({ ...entradaBase, ambito: "perfil", esDueno: false }).modo).toBe("sin-permiso");
  });

  it("grupo jerárquico → acepta quien gestiona; los demás sin permiso", () => {
    const gestor: EntradaDecision = { ...entradaBase, ambito: "grupo", rol: "gestor", democratico: false };
    const editor: EntradaDecision = { ...gestor, rol: "colaborador" };
    expect(decidirResultado(gestor).modo).toBe("aceptar");
    expect(decidirResultado(editor).modo).toBe("sin-permiso");
  });

  it("grupo democrático → colaborador propone y vota; observador sin permiso", () => {
    const proponente: EntradaDecision = { ...entradaBase, ambito: "grupo", rol: "colaborador", democratico: true };
    const observador: EntradaDecision = { ...proponente, rol: "observador" };
    expect(decidirResultado(proponente).modo).toBe("proponer-voto");
    expect(decidirResultado(observador).modo).toBe("sin-permiso");
  });

  it("pública usa la misma regla que grupo", () => {
    const jerarquica: EntradaDecision = { ...entradaBase, ambito: "publica", rol: "gestor", democratico: false };
    const democratica: EntradaDecision = { ...jerarquica, rol: "colaborador", democratico: true };
    expect(decidirResultado(jerarquica).modo).toBe("aceptar");
    expect(decidirResultado(democratica).modo).toBe("proponer-voto");
  });
});

describe("propuestaMetaGenesis", () => {
  it("id PGM + 8 caracteres de un hash estable; cambia si falta algo distinto", () => {
    const a = propuestaMetaGenesis(encargo, { tipo: "atomo", detalle: "un átomo de refresco" });
    expect(a.id).toMatch(/^PGM[0-9a-f]{8}$/);
    expect(propuestaMetaGenesis(encargo, { tipo: "atomo", detalle: "un átomo de refresco" }).id).toBe(a.id);
    expect(propuestaMetaGenesis(encargo, { tipo: "conversor", detalle: "otro" }).id).not.toBe(a.id);
  });

  it("fuera de lo personal el prompt lleva intención y detalle; archivos y depende vacíos", () => {
    const p = propuestaMetaGenesis(encargo, { tipo: "conversor", detalle: "falta conversor de wav a mp3" });
    expect(p.prompt).toContain("Intención: Crear una imagen con la escena");
    expect(p.prompt).toContain("conversor");
    expect(p.titulo).toContain("Crear una imagen con la escena");
    expect(p.archivos).toEqual([]);
    expect(p.depende).toEqual([]);
  });

  it("personal: ni la intención ni el detalle salen, solo el tipo de lo que falta", () => {
    const personal: Encargo = { ...encargo, ambito: "personal", intencion: "querido secreto" };
    const p = propuestaMetaGenesis(personal, { tipo: "atomo", detalle: "detalle privado" });
    expect(p.prompt).not.toContain("querido secreto");
    expect(p.prompt).not.toContain("detalle privado");
    expect(p.prompt).toContain("atomo");
    expect(p.titulo).not.toContain("querido secreto");
  });
});
