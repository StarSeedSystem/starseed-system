import { describe, it, expect } from "vitest";
import { decidirResultado, propuestaMetaGenesis, type ContextoDecision } from "../decision";
import type { Encargo } from "../encargo";

const contexto = (parcial: Partial<ContextoDecision> = {}): ContextoDecision => ({
  ambito: "personal",
  esDueno: false,
  tocaFueraDeLaMolecula: false,
  ...parcial,
});

const encargoBase: Encargo = {
  id: "enc-1",
  moleculaId: "mol-1",
  ambito: "personal",
  intencion: "Retrato privado de mi familia",
  criterios: [{ tipo: "formato", valor: "png", texto: "La salida es un png" }],
  autor: { tipo: "persona", id: "persona-1" },
  origen: "texto",
  creadoEn: 1700000000000,
};

describe("decidirResultado", () => {
  it("manda a MetaGenesis cualquier cambio que toca fuera de la molécula", () => {
    const r = decidirResultado(contexto({ ambito: "personal", esDueno: true, tocaFueraDeLaMolecula: true }));
    expect(r.modo).toBe("proponer-metagenesis");
    expect(r.motivo).toContain("MetaGenesis");
  });

  it("acepta en personal y perfil solo si es la persona dueña", () => {
    expect(decidirResultado(contexto({ ambito: "personal", esDueno: true })).modo).toBe("aceptar");
    expect(decidirResultado(contexto({ ambito: "perfil", esDueno: true })).modo).toBe("aceptar");
    expect(decidirResultado(contexto({ ambito: "personal", esDueno: false })).modo).toBe("sin-permiso");
    expect(decidirResultado(contexto({ ambito: "perfil", esDueno: false })).modo).toBe("sin-permiso");
  });

  it("en grupo jerárquico acepta quien gestiona y rechaza al resto", () => {
    expect(decidirResultado(contexto({ ambito: "grupo", rol: "gestor", democratico: false })).modo).toBe("aceptar");
    expect(decidirResultado(contexto({ ambito: "grupo", rol: "colaborador", democratico: false })).modo).toBe("sin-permiso");
    expect(decidirResultado(contexto({ ambito: "grupo", rol: null, democratico: false })).modo).toBe("sin-permiso");
  });

  it("en grupo democrático el colaborador propone y el observador no puede", () => {
    expect(decidirResultado(contexto({ ambito: "grupo", rol: "colaborador", democratico: true })).modo).toBe("proponer-voto");
    expect(decidirResultado(contexto({ ambito: "grupo", rol: "observador", democratico: true })).modo).toBe("sin-permiso");
  });

  it("en grupo democrático ni la cuenta dueña aplica sin votación", () => {
    const r = decidirResultado(contexto({ ambito: "grupo", rol: "dueño", esDueno: true, democratico: true }));
    expect(r.modo).toBe("proponer-voto");
  });

  it("trata el ámbito público igual que el de grupo", () => {
    expect(decidirResultado(contexto({ ambito: "publica", rol: "gestor", democratico: false })).modo).toBe("aceptar");
    expect(decidirResultado(contexto({ ambito: "publica", rol: "colaborador", democratico: true })).modo).toBe("proponer-voto");
    expect(decidirResultado(contexto({ ambito: "publica", rol: "observador", democratico: true })).modo).toBe("sin-permiso");
  });

  it("siempre devuelve un motivo legible", () => {
    for (const ambito of ["personal", "perfil", "grupo", "publica"] as const) {
      const r = decidirResultado(contexto({ ambito, rol: "gestor", esDueno: true }));
      expect(r.motivo.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("propuestaMetaGenesis", () => {
  const falta = { tipo: "conversor", detalle: "falta un conversor de svg a png" } as const;

  it("genera un id PGM estable con 8 caracteres hexadecimales", () => {
    const a = propuestaMetaGenesis(encargoBase, falta);
    const b = propuestaMetaGenesis({ ...encargoBase }, { ...falta });
    expect(a.id).toMatch(/^PGM[0-9a-f]{8}$/);
    expect(b.id).toBe(a.id);
  });

  it("cambia el id cuando cambia el encargo o lo que falta", () => {
    const base = propuestaMetaGenesis(encargoBase, falta);
    const otraIntencion = propuestaMetaGenesis({ ...encargoBase, intencion: "Otra cosa" }, falta);
    const otraFalta = propuestaMetaGenesis(encargoBase, { ...falta, detalle: "otra carencia" });
    expect(otraIntencion.id).not.toBe(base.id);
    expect(otraFalta.id).not.toBe(base.id);
  });

  it("deja archivos y dependencias vacíos para que los ponga MetaGenesis", () => {
    const r = propuestaMetaGenesis(encargoBase, falta);
    expect(r.archivos).toEqual([]);
    expect(r.depende).toEqual([]);
  });

  it("lleva intención y falta cuando el ámbito no es personal", () => {
    const r = propuestaMetaGenesis({ ...encargoBase, ambito: "grupo" }, falta);
    expect(r.prompt).toContain(encargoBase.intencion);
    expect(r.prompt).toContain(falta.tipo);
    expect(r.prompt).toContain(falta.detalle);
    expect(r.titulo).toContain(encargoBase.intencion);
  });

  it("en ámbito personal no deja salir la intención por ningún campo", () => {
    const r = propuestaMetaGenesis(encargoBase, falta);
    expect(r.prompt).toBe(`Falta: ${falta.tipo}`);
    expect(r.prompt).not.toContain("Retrato");
    expect(r.titulo).not.toContain(encargoBase.intencion);
    expect(JSON.stringify(r)).not.toContain(encargoBase.intencion);
  });
});
