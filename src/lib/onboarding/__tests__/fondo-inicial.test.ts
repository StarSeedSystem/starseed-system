/** «Elige tu fondo» (Ola 1018F · FSH1018J): perfil nuevo, una vez para cuentas existentes,
 * novedades cuando sube el catálogo y «Ahora no» aplazado siete días. */import { describe, expect, it } from "vitest";
import { DIAS_APLAZAMIENTO_FONDO, VERSION_CATALOGO_FONDOS, aplazarElegirFondo, catalogoFondoAlDia, debeMostrarElegirFondo } from "../fondo-inicial";
const AHORA = new Date("2026-10-30T12:00:00.000Z");

function estado(parcial: Partial<Parameters<typeof debeMostrarElegirFondo>[0]> = {}) {
  return {
    esPerfilNuevo: false,
    yaEligio: false,
    versionCatalogoVista: null,
    versionCatalogoActual: VERSION_CATALOGO_FONDOS,
    aplazadoHasta: null,
    ahora: AHORA,
    ...parcial,
  };
}
describe("debeMostrarElegirFondo · al crear el perfil y cuentas existentes", () => {
  it("sale al crear el perfil, con o sin fondo elegido antes", () => {
    expect(debeMostrarElegirFondo(estado({ esPerfilNuevo: true }))).toBe(true);
    expect(debeMostrarElegirFondo(estado({ esPerfilNuevo: true, yaEligio: true }))).toBe(true);
  });

  it("a una cuenta existente que nunca lo vio le sale UNA vez", () => {
    expect(debeMostrarElegirFondo(estado())).toBe(true);
    // Ya lo vio (versión guardada) y no eligió: no se le repite.
    expect(debeMostrarElegirFondo(estado({ versionCatalogoVista: VERSION_CATALOGO_FONDOS }))).toBe(false);
  });

  it("a quien ya eligió fondo no se le repite mientras el catálogo no cambie", () => {
    expect(debeMostrarElegirFondo(estado({
      yaEligio: true,
      versionCatalogoVista: VERSION_CATALOGO_FONDOS,
    }))).toBe(false);
    expect(debeMostrarElegirFondo(estado({ yaEligio: true }))).toBe(false);
  });
});

describe("debeMostrarElegirFondo · novedades del catálogo", () => {
  it("vuelve a salir cuando el catálogo sube de versión, aunque ya eligiera", () => {
    expect(debeMostrarElegirFondo(estado({
      yaEligio: true,
      versionCatalogoVista: VERSION_CATALOGO_FONDOS,
      versionCatalogoActual: VERSION_CATALOGO_FONDOS + 1,
    }))).toBe(true);
  });

  it("ni con la misma versión ni con una anterior (una config vieja no molesta)", () => {
    expect(debeMostrarElegirFondo(estado({
      yaEligio: true,
      versionCatalogoVista: 3,
      versionCatalogoActual: 3,
    }))).toBe(false);
    expect(debeMostrarElegirFondo(estado({
      yaEligio: true,
      versionCatalogoVista: 3,
      versionCatalogoActual: 2,
    }))).toBe(false);
    expect(debeMostrarElegirFondo(estado({
      yaEligio: true,
      versionCatalogoVista: Number.NaN,
      versionCatalogoActual: 9,
    }))).toBe(false);
  });
});

describe("debeMostrarElegirFondo · «Ahora no» y reloj", () => {
  it("un aplazamiento vigente lo esconde hasta su fecha exacta", () => {
    const hasta = aplazarElegirFondo(AHORA);
    expect(debeMostrarElegirFondo(estado({
      esPerfilNuevo: true,
      aplazadoHasta: hasta,
    }))).toBe(false);
    const justoAntes = new Date(Date.parse(hasta) - 1);
    expect(debeMostrarElegirFondo(estado({ esPerfilNuevo: true, aplazadoHasta: hasta, ahora: justoAntes }))).toBe(false);
    expect(debeMostrarElegirFondo(estado({ esPerfilNuevo: true, aplazadoHasta: hasta, ahora: new Date(hasta) }))).toBe(true);
  });

  it("el aplazamiento también tapa las novedades hasta que vence", () => {
    expect(debeMostrarElegirFondo(estado({
      yaEligio: true,
      versionCatalogoVista: VERSION_CATALOGO_FONDOS,
      versionCatalogoActual: VERSION_CATALOGO_FONDOS + 1,
      aplazadoHasta: aplazarElegirFondo(AHORA),
    }))).toBe(false);
  });

  it("una fecha de aplazamiento rota se ignora: el paso no se queda escondido para siempre", () => {
    expect(debeMostrarElegirFondo(estado({ aplazadoHasta: "no-es-fecha" }))).toBe(true);
    expect(debeMostrarElegirFondo(estado({ aplazadoHasta: "", ahora: "tampoco" }))).toBe(true);
  });

  it("nunca lanza con datos incompletos o absurdos", () => {
    expect(() => debeMostrarElegirFondo(estado({ versionCatalogoActual: Number.NaN }))).not.toThrow();
    expect(debeMostrarElegirFondo(estado({ versionCatalogoActual: Number.NaN }))).toBe(true);
  });
});

describe("aplazarElegirFondo · siete días justos", () => {
  it("devuelve ISO 8601 a siete días y no muta la fecha recibida", () => {
    const original = new Date("2026-10-30T12:00:00.000Z");
    const copia = new Date(original.getTime());
    const hasta = aplazarElegirFondo(original);
    expect(hasta).toBe("2026-11-06T12:00:00.000Z");
    expect(Date.parse(hasta) - original.getTime()).toBe(DIAS_APLAZAMIENTO_FONDO * 24 * 60 * 60 * 1000);
    expect(original.getTime()).toBe(copia.getTime());
  });
});

describe("catalogoFondoAlDia", () => {
  it("solo está al día si vio una versión igual o posterior", () => {
    expect(catalogoFondoAlDia(null, 1)).toBe(false);
    expect(catalogoFondoAlDia(1, 1)).toBe(true);
    expect(catalogoFondoAlDia(2, 1)).toBe(true);
    expect(catalogoFondoAlDia(1, 2)).toBe(false);
    expect(catalogoFondoAlDia(Number.NaN, 1)).toBe(false);
  });
});
