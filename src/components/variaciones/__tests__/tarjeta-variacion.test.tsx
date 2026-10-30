import { describe, expect, it } from "vitest";
import {
  deshacerAlCerrar,
  enlaceOrigenSeguro,
  esVariacionDeCodigo,
  motivoNoValida,
  siguientePaso,
  textoValoracion,
  vistaPreviaTexto,
  type DatosTarjetaVariacion,
  type FaseTarjeta,
} from "../tarjeta-variacion";

// Pruebas puras de la tarjeta (contrato §4): transiciones de «Probar»/«Aplicar», deshacer al
// cerrar, origen solo https, valoración acotada, aislamiento del código y validación previa.

const VARIACION: DatosTarjetaVariacion = {
  id: "v1", titulo: "Cristal suave", descripcion: "Efecto cristal", version: "1.0.0",
  familia: "widget", licencia: "MIT", etiquetas: ["cristal"],
};

describe("siguientePaso", () => {
  it("probar en reposo aplica una vista previa; repetir la deshace", () => {
    expect(siguientePaso("reposo", "probar")).toEqual({ fase: "probando", accion: "previsualizar" });
    expect(siguientePaso("probando", "probar")).toEqual({ fase: "reposo", accion: "deshacer" });
  });

  it("aplicar deja la variación aplicada con deshacer visible", () => {
    expect(siguientePaso("reposo", "aplicar")).toEqual({ fase: "aplicada", accion: "aplicar" });
    expect(siguientePaso("probando", "aplicar")).toEqual({ fase: "aplicada", accion: "aplicar-tras-previa" });
    expect(siguientePaso("aplicada", "aplicar")).toEqual({ fase: "reposo", accion: "deshacer" });
    expect(siguientePaso("aplicada", "probar")).toEqual({ fase: "reposo", accion: "deshacer" });
  });

  it("las variaciones de código nunca se aplican en línea: se abren aisladas", () => {
    expect(siguientePaso("reposo", "probar", true)).toEqual({ fase: "reposo", accion: "abrir-aislada" });
    expect(siguientePaso("reposo", "aplicar", true)).toEqual({ fase: "reposo", accion: "abrir-aislada" });
  });
});

describe("deshacerAlCerrar", () => {
  it("solo la prueba en vivo se deshace al cerrar; lo aplicado permanece", () => {
    const casos: Array<[FaseTarjeta, boolean]> = [["reposo", false], ["probando", true], ["aplicada", false]];
    for (const [fase, esperado] of casos) expect(deshacerAlCerrar(fase)).toBe(esperado);
  });
});

describe("enlaceOrigenSeguro", () => {
  it("solo acepta https y rechaza el resto de esquemas", () => {
    expect(enlaceOrigenSeguro("https://github.com/a/b")).toBe("https://github.com/a/b");
    expect(enlaceOrigenSeguro("http://inseguro.test/x")).toBeNull();
    expect(enlaceOrigenSeguro("javascript:alert(1)")).toBeNull();
    expect(enlaceOrigenSeguro("")).toBeNull();
    expect(enlaceOrigenSeguro()).toBeNull();
  });
});

describe("textoValoracion", () => {
  it("muestra un decimal y acota media y recuento", () => {
    expect(textoValoracion(4.5, 3)).toBe("4.5 (3)");
    expect(textoValoracion(9, -2)).toBe("5.0 (0)");
    expect(textoValoracion(Number.NaN, 1.9)).toBe("0.0 (1)");
    expect(textoValoracion()).toBe("0.0 (0)");
  });
});

describe("esVariacionDeCodigo", () => {
  it("marca átomos y herramientas como código; un widget no lo es", () => {
    expect(esVariacionDeCodigo({ familia: "atomo" })).toBe(true);
    expect(esVariacionDeCodigo({ familia: "herramienta" })).toBe(true);
    expect(esVariacionDeCodigo(VARIACION)).toBe(false);
    expect(esVariacionDeCodigo({})).toBe(false);
  });
});

describe("motivoNoValida", () => {
  it("deja pasar una variación sin payload o con payload limpio", () => {
    expect(motivoNoValida(VARIACION, false)).toBeNull();
    expect(motivoNoValida({ ...VARIACION, payload: { radio: 24 } }, false)).toBeNull();
  });

  it("rechaza secretos y datos privados antes de ejecutar nada", () => {
    expect(motivoNoValida({ ...VARIACION, payload: { apiKey: "abcdef123456abcdef" } }, false)).toMatch(/Privacidad/);
    expect(motivoNoValida({ ...VARIACION, payload: { url: "http://inseguro.test" } }, false)).toMatch(/https/);
  });
});

describe("vistaPreviaTexto", () => {
  it("serializa y acota; avisa si el payload es circular", () => {
    expect(vistaPreviaTexto(undefined)).toBe("");
    expect(vistaPreviaTexto({ radio: 24 })).toContain("\"radio\": 24");
    expect(vistaPreviaTexto("x".repeat(20), 5)).toBe('"xxxx…');
    const circular: Record<string, unknown> = {};
    circular.yo = circular;
    expect(vistaPreviaTexto(circular)).toMatch(/no se puede serializar/);
  });
});
