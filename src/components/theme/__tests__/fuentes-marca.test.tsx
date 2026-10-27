import { describe, it, expect } from "vitest";
import {
  URL_SATOSHI,
  URL_QUICKSAND,
  estadoInicial,
  requiereSatoshi,
  requiereQuicksand,
  variablesCSS,
  respaldos,
  duplicadosInsertados,
  insertarEnlace,
} from "@/lib/theme/fuentes-marca-lib";

describe("URLs de fuentes de marca", () => {
  it("Satoshi viene de Fontshare con pesos 500,700,900", () => {
    expect(URL_SATOSHI).toContain("api.fontshare.com");
    expect(URL_SATOSHI).toContain("satoshi@500,700,900");
  });

  it("Quicksand viene de Google Fonts", () => {
    expect(URL_QUICKSAND).toContain("fonts.googleapis.com");
    expect(URL_QUICKSAND).toContain("Quicksand");
  });
});

describe("Estado inicial", () => {
  it("no requiere ninguna carga al inicio", () => {
    expect(requiereSatoshi(estadoInicial)).toBe(false);
    expect(requiereQuicksand(estadoInicial)).toBe(false);
  });
});

describe("Requisitos por contexto", () => {
  it("Satoshi solo si papelEditorial está activo y no está en enlaces", () => {
    const s = { ...estadoInicial, papelEditorial: true, enlacesInsertados: [] };
    expect(requiereSatoshi(s)).toBe(true);
  });

  it("Satoshi no se duplica si ya está insertado", () => {
    const s = { ...estadoInicial, papelEditorial: true, enlacesInsertados: [URL_SATOSHI] };
    expect(requiereSatoshi(s)).toBe(false);
  });

  it("Quicksand solo con temaNatural activo", () => {
    const s = { ...estadoInicial, temaNatural: true, enlacesInsertados: [] };
    expect(requiereQuicksand(s)).toBe(true);
  });
});

describe("Variables CSS", () => {
  it("expone las tres variables con respaldos", () => {
    const v = variablesCSS();
    expect(v).toHaveProperty("--ss-font-display");
    expect(v).toHaveProperty("--ss-font-titular");
    expect(v).toHaveProperty("--ss-font-organica");
    expect(v["--ss-font-display"]).toContain("Satoshi");
    expect(v["--ss-font-titular"]).toContain("Rajdhani");
    expect(v["--ss-font-organica"]).toContain("Quicksand");
  });

  it("respaldos cubren las tres familias", () => {
    const r = respaldos();
    expect(r["--ss-font-display"][0]).toBe("Rajdhani");
    expect(r["--ss-font-organica"][0]).toBe("Inter");
  });
});

describe("Duplicados", () => {
  it("detecta URLs repetidas", () => {
    expect(duplicadosInsertados([URL_SATOSHI, URL_SATOSHI])).toEqual([URL_SATOSHI]);
  });

  it("no reporta duplicados sin repetición", () => {
    expect(duplicadosInsertados([URL_SATOSHI, URL_QUICKSAND])).toEqual([]);
  });
});

describe("Insertar enlace", () => {
  it("agrega el enlace sin duplicarlo", () => {
    const s = insertarEnlace(estadoInicial, URL_SATOSHI);
    expect(s.enlacesInsertados).toContain(URL_SATOSHI);
    expect(s.enlacesInsertados.length).toBe(1);
  });

  it("no modifica si ya existe", () => {
    const s = insertarEnlace(
      { ...estadoInicial, enlacesInsertados: [URL_SATOSHI] },
      URL_SATOSHI
    );
    expect(s.enlacesInsertados.length).toBe(1);
  });
});
