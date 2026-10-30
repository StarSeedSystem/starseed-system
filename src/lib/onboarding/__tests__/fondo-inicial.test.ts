/**
 * FSH1018J · fondo-inicial.ts — la decisión pura del paso «Elige tu fondo»
 * (architecture/fondos-shaders.md §3): sale al crear el perfil; a los ya
 * registrados una vez; otra cuando sube la versión del catálogo (novedades);
 * «Ahora no» aplaza 7 días; y nunca se insiste tras elegir ni bloquea.
 */
import { describe, expect, it } from "vitest";
import {
  aplazamientoElegirFondo, debeMostrarElegirFondo, versionDelCatalogo,
  type EntradaFondoInicial,
} from "../fondo-inicial";

const HORA = "2026-10-18T10:00:00.000Z";
const base: EntradaFondoInicial = {
  esPerfilNuevo: false, yaEligio: false, versionCatalogoVista: null,
  versionCatalogoActual: 750, aplazadoHasta: null, ahora: new Date(HORA),
};

describe("fondo-inicial · debeMostrarElegirFondo", () => {
  it("sale al crear el perfil, aunque ya hubiera estado", () => {
    expect(debeMostrarElegirFondo({ ...base, esPerfilNuevo: true, versionCatalogoVista: 750 })).toBe(true);
  });

  it("a los ya registrados les sale una vez (sin versión vista)", () => {
    expect(debeMostrarElegirFondo(base)).toBe(true);
  });

  it("ya eligió: se acaba, incluso para un perfil nuevo", () => {
    expect(debeMostrarElegirFondo({ ...base, yaEligio: true, esPerfilNuevo: true })).toBe(false);
    expect(debeMostrarElegirFondo({ ...base, yaEligio: true, versionCatalogoVista: 750 })).toBe(false);
  });

  it("la misma versión vista no vuelve a sacarlo", () => {
    expect(debeMostrarElegirFondo({ ...base, versionCatalogoVista: 750 })).toBe(false);
    expect(debeMostrarElegirFondo({ ...base, versionCatalogoVista: 900 })).toBe(false); // versión retro no vuelve
  });

  it("el catálogo que sube lo trae de nuevo («novedades»)", () => {
    expect(debeMostrarElegirFondo({ ...base, versionCatalogoVista: 749, versionCatalogoActual: 751 })).toBe(true);
  });

  it("«Ahora no» aplaza 7 días y desaparece durante el aplazamiento", () => {
    const hasta = aplazamientoElegirFondo(new Date(HORA)); // 2026-10-25 en ISO
    expect(debeMostrarElegirFondo({ ...base, esPerfilNuevo: true, aplazadoHasta: hasta })).toBe(false);
    expect(new Date(hasta).toISOString()).toBe("2026-10-25T10:00:00.000Z");
  });

  it("vencido el aplazamiento vuelve a salir un segundo después", () => {
    const hasta = new Date(HORA).toISOString();
    expect(debeMostrarElegirFondo({ ...base, aplazadoHasta: hasta })).toBe(true);
    expect(debeMostrarElegirFondo({ ...base, aplazadoHasta: hasta, ahora: new Date("2026-10-18T10:00:01.000Z") })).toBe(true);
  });

  it("el aplazamiento no se adueña del paso si el catálogo trae novedades al vencer", () => {
    const hasta = aplazamientoElegirFondo(new Date(HORA));
    expect(debeMostrarElegirFondo({ ...base, versionCatalogoVista: 749, versionCatalogoActual: 751, aplazadoHasta: hasta, ahora: new Date("2026-10-26T10:00:00.000Z") })).toBe(true);
  });

  it("dato corrupto: el aplazamiento inválido se ignora (no silencia el paso)", () => {
    expect(debeMostrarElegirFondo({ ...base, aplazadoHasta: "no es una fecha" })).toBe(true);
    expect(debeMostrarElegirFondo({ ...base, esPerfilNuevo: true, aplazadoHasta: "" })).toBe(true);
  });

  it("dato corrupto: versión vista no finita cuenta como «nunca eligió»", () => {
    expect(debeMostrarElegirFondo({ ...base, versionCatalogoVista: Number.NaN })).toBe(true);
  });

  it("dato corrupto: versión actual no finita no molesta (ante la duda, silencio)", () => {
    expect(debeMostrarElegirFondo({ ...base, versionCatalogoVista: 750, versionCatalogoActual: Number.NaN })).toBe(false);
  });
});

describe("fondo-inicial · aplazamientoElegirFondo", () => {
  it("el valor del aplazamiento son 7 días por defecto (también la fecha límite)", () => {
    expect(new Date(aplazamientoElegirFondo(new Date("2026-10-18T23:59:59.000Z"))).toISOString()).toBe("2026-10-25T23:59:59.000Z");
    expect(aplazamientoElegirFondo(new Date(HORA), 1)).toBe("2026-10-19T10:00:00.000Z");
  });
});

describe("fondo-inicial · versionDelCatalogo", () => {
  it("sube con cada efecto y categoría nuevo del catálogo", () => {
    const yo: Record<string, readonly unknown[]> = { Ruido: [{}] };
    const conUnEfecto = versionDelCatalogo(yo);
    const conDos = versionDelCatalogo({ ...yo, Ruido: [{}, {}] });
    const conCategoria = versionDelCatalogo({ ...yo, Nitidez: [{}] });
    expect(conDos).toBeGreaterThan(conUnEfecto);
    expect(conCategoria).toBeGreaterThan(conDos);
  });

  it("no cuenta listas rotas (no array) como efectos", () => {
    expect(versionDelCatalogo({ Ruido: "roto" as unknown as readonly unknown[], Luz: [{}] })).toBe(versionDelCatalogo({ Ruido: [], Luz: [{}] }));
  });
});
