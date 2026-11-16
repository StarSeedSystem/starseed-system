import { describe, it, expect } from "vitest";
import {
  CODIGOS_ISO,
  MAS_HABLADOS,
  ESCRITURAS_RTL,
  ALIAS,
  esRtl,
} from "../tabla-iso";
import { IDIOMAS } from "../idiomas";

const PATRON = /^[a-z]{2,3}(-[a-z]+)?$/;

describe("tabla ISO de idiomas", () => {
  it("no tiene códigos duplicados", () => {
    const unicos = new Set(CODIGOS_ISO);
    expect(unicos.size).toBe(CODIGOS_ISO.length);
  });

  it("todos los códigos cumplen el patrón de dos o tres letras", () => {
    const invalidos = CODIGOS_ISO.filter((c) => !PATRON.test(c));
    expect(invalidos).toEqual([]);
  });

  it("todo idioma más hablado está en la tabla", () => {
    const faltan = MAS_HABLADOS.filter((c) => !CODIGOS_ISO.includes(c));
    expect(faltan).toEqual([]);
  });

  it("los 36 idiomas elegibles están cubiertos", () => {
    const faltan = IDIOMAS.filter((i) => {
      const codigo = i.codigo === "zh-hant" ? "zh" : i.codigo;
      return !CODIGOS_ISO.includes(codigo) && !CODIGOS_ISO.includes(i.codigo);
    });
    expect(faltan).toEqual([]);
  });

  it("conoce las escrituras de derecha a izquierda", () => {
    expect(esRtl("ar")).toBe(true);
    expect(esRtl("es")).toBe(false);
    for (const c of ESCRITURAS_RTL) expect(esRtl(c)).toBe(true);
  });

  it("cada escritura RTL es un código de la tabla", () => {
    const faltan = ESCRITURAS_RTL.filter((c) => !CODIGOS_ISO.includes(c));
    expect(faltan).toEqual([]);
  });
});

describe("alias de búsqueda", () => {
  it("apunta siempre a códigos que existen en la tabla", () => {
    const rotos = Object.entries(ALIAS).flatMap(([alias, codigos]) =>
      codigos
        .filter((c) => !CODIGOS_ISO.includes(c))
        .map((c) => `${alias} → ${c}`),
    );
    expect(rotos).toEqual([]);
  });

  it("resuelve los alias pedidos por el contrato", () => {
    expect(ALIAS["chino"]).toContain("zh");
    expect(ALIAS["mandarín"]).toContain("zh");
    expect(ALIAS["castellano"]).toContain("es");
    expect(ALIAS["inglés"]).toContain("en");
    expect(ALIAS["farsi"]).toContain("fa");
    expect(ALIAS["hebreo"]).toContain("he");
    expect(ALIAS["griego"]).toContain("el");
    expect(ALIAS["tagalo"]).toContain("fil");
  });
});
