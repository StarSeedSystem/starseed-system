import { describe, it, expect } from "vitest";
import { decidirResultado, propuestaMetaGenesis } from "../decision";
import type { Ambito } from "@/lib/protomolecula/tipos";
import type { Encargo } from "../encargo";

describe("decidirResultado", () => {
  const baseEncargo: Encargo = {
    id: "enc1",
    moleculaId: "mol1",
    ambito: "personal",
    intencion: "test",
    criterios: [{ tipo: "formato", valor: "png", texto: "formato png" }],
    autor: { tipo: "persona", id: "user1" },
    origen: "texto",
    creadoEn: Date.now(),
  };

  it("debe retornar proponer-metagenesis cuando toca fuera de la molécula", () => {
    const result = decidirResultado({
      ...baseEncargo,
      ambito: "personal",
      esDueno: true,
      tocaFueraDeLaMolecula: true,
    });
    expect(result.modo).toBe("proponer-metagenesis");
    expect(result.motivo).toContain("MetaGenesis");
  });

  it("debe retornar aceptar para personal cuando es dueño", () => {
    const result = decidirResultado({
      ...baseEncargo,
      ambito: "personal",
      esDueno: true,
      tocaFueraDeLaMolecula: false,
    });
    expect(result.modo).toBe("aceptar");
    expect(result.motivo).toContain("dueño");
  });

  it("debe retornar sin-permiso para personal cuando no es dueño", () => {
    const result = decidirResultado({
      ...baseEncargo,
      ambito: "personal",
      esDueno: false,
      tocaFueraDeLaMolecula: false,
    });
    expect(result.modo).toBe("sin-permiso");
    expect(result.motivo).toContain("No es el dueño");
  });

  it("debe retornar aceptar para perfil cuando es dueño", () => {
    const result = decidirResultado({
      ...baseEncargo,
      ambito: "perfil",
      esDueno: true,
      tocaFueraDeLaMolecula: false,
    });
    expect(result.modo).toBe("aceptar");
  });

  it("debe retornar sin-permiso para perfil cuando no es dueño", () => {
    const result = decidirResultado({
      ...baseEncargo,
      ambito: "perfil",
      esDueno: false,
      tocaFueraDeLaMolecula: false,
    });
    expect(result.modo).toBe("sin-permiso");
  });

  it("debe retornar aceptar para grupo con rol de gestión y modo jerárquico", () => {
    const result = decidirResultado({
      ...baseEncargo,
      ambito: "grupo",
      esDueno: false,
      rol: "gestor",
      democratico: false,
      tocaFueraDeLaMolecula: false,
    });
    expect(result.modo).toBe("aceptar");
  });

  it("debe retornar proponer-voto para grupo con rol de colaboración y modo democrático", () => {
    const result = decidirResultado({
      ...baseEncargo,
      ambito: "grupo",
      esDueno: false,
      rol: "colaborador",
      democratico: true,
      tocaFueraDeLaMolecula: false,
    });
    expect(result.modo).toBe("proponer-voto");
  });

  it("debe retornar sin-permiso para grupo con rol de observador y modo democrático", () => {
    const result = decidirResultado({
      ...baseEncargo,
      ambito: "grupo",
      esDueno: false,
      rol: "observador",
      democratico: true,
      tocaFueraDeLaMolecula: false,
    });
    expect(result.modo).toBe("sin-permiso");
  });

  it("debe tratar ámbito pública como grupo", () => {
    const resultAceptar = decidirResultado({
      ...baseEncargo,
      ambito: "publica",
      esDueno: false,
      rol: "gestor",
      democratico: false,
      tocaFueraDeLaMolecula: false,
    });
    expect(resultAceptar.modo).toBe("aceptar");

    const resultProponer = decidirResultado({
      ...baseEncargo,
      ambito: "publica",
      esDueno: false,
      rol: "colaborador",
      democratico: true,
      tocaFueraDeLaMolecula: false,
    });
    expect(resultProponer.modo).toBe("proponer-voto");
  });
});

describe("propuestaMetaGenesis", () => {
  const encargo: Encargo = {
    id: "enc1",
    moleculaId: "mol1",
    ambito: "personal",
    intencion: "Crear una imagen",
    criterios: [{ tipo: "formato", valor: "png", texto: "formato png" }],
    autor: { tipo: "persona", id: "user1" },
    origen: "texto",
    creadoEn: Date.now(),
  };

  it("debe generar un id con PGM seguido de 8 caracteres hexadecimales", () => {
    const falta = { tipo: "atomo", detalle: "no hay conversor de svg a png" } as const;
    const result = propuestaMetaGenesis(encargo, falta);
    expect(result.id).toMatch(/^PGM[0-9a-f]{8}$/);
  });

  it("debe incluir la intención en el prompt cuando el ámbito no es personal", () => {
    const encargoPublico: Encargo = { ...encargo, ambito: "publica" };
    const falta = { tipo: "conversor", detalle: "falta conversor de wav a mp3" } as const;
    const result = propuestaMetaGenesis(encargoPublico, falta);
    expect(result.prompt).toContain("Intención: Crear una imagen");
    expect(result.prompt).toContain("Falta: conversor - falta conversor de wav a mp3");
  });

  it("no debe incluir la intención en el prompt cuando el ámbito es personal", () => {
    const falta = { tipo: "otro", detalle: "falta un átomo de modelo 3d" } as const;
    const result = propuestaMetaGenesis(encargo, falta);
    expect(result.prompt).not.toContain("Intención:");
    expect(result.prompt).toContain("Falta: otro - falta un átomo de modelo 3d");
  });

  it("debe generar el mismo id para el mismo encargo y la misma falta (hash estable)", () => {
    const falta = { tipo: "atomo", detalle: "detalle" } as const;
    const a = propuestaMetaGenesis(encargo, falta);
    const b = propuestaMetaGenesis(encargo, falta);
    expect(a.id).toBe(b.id);
  });

  it("debe generar ids distintos cuando cambia lo que falta", () => {
    const a = propuestaMetaGenesis(encargo, { tipo: "atomo", detalle: "detalle" } as const);
    const b = propuestaMetaGenesis(encargo, { tipo: "atomo", detalle: "otro detalle" } as const);
    expect(a.id).not.toBe(b.id);
  });

  it("debe retornar archivos y depende como arrays vacíos", () => {
    const falta = { tipo: "atomo", detalle: "detalle" } as const;
    const result = propuestaMetaGenesis(encargo, falta);
    expect(result.archivos).toEqual([]);
    expect(result.depende).toEqual([]);
  });
});