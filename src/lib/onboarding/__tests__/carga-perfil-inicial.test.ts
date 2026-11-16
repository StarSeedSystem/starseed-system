/**
 * Carga del perfil en la ventana de perfil inicial — PURO.
 *
 * El `catch` de la carga se tragaba el fallo: el formulario salía vacío y
 * nadie sabía si era que no había perfil previo o que la lectura falló. Aquí
 * se decide, sin red, qué se le dice a la persona y qué se deja en el log.
 */
import { describe, expect, it } from "vitest";

import { evaluarCargaPerfil, rastroCargaPerfil } from "../carga-perfil-inicial";

const FILA = {
  handle: "alex",
  display_name: "Alex",
  bio: "hola",
  avatar_url: "https://cdn.invalid/a.png",
  cover_url: null,
};

describe("evaluarCargaPerfil", () => {
  it("con sesión y fila, el perfil se da por cargado y no hay nada que avisar", () => {
    const r = evaluarCargaPerfil({ sesion: true, fila: FILA, error: null });
    expect(r.estado).toBe("cargado");
    expect(r.fila).toEqual(FILA);
    expect(r.aviso).toBeNull();
    expect(r.rastro).toBeNull();
  });

  it("sin sesión, se avisa: el perfil no se ha podido leer", () => {
    const r = evaluarCargaPerfil({ sesion: false, fila: null, error: null });
    expect(r.estado).toBe("sin-sesion");
    expect(r.aviso).toBeTruthy();
    expect(r.rastro).toContain("perfil-inicial");
  });

  it("cuenta la falta de sesión como fallo: no es un estado normal", () => {
    const r = evaluarCargaPerfil({ sesion: false, fila: null, error: null });
    expect(r.rastro).toContain("sesión");
  });

  it("una cuenta sin perfil previo es el caso NORMAL: ni aviso ni rastro", () => {
    const r = evaluarCargaPerfil({ sesion: true, fila: null, error: null });
    expect(r.estado).toBe("sin-perfil");
    expect(r.aviso).toBeNull();
    expect(r.rastro).toBeNull();
  });

  it("si la consulta falla, se dice en la ventana y se deja rastro", () => {
    const r = evaluarCargaPerfil({
      sesion: true,
      fila: null,
      error: { message: "failed to fetch" },
    });
    expect(r.estado).toBe("error");
    expect(r.aviso).toBeTruthy();
    expect(r.rastro).toContain("failed to fetch");
  });

  it("el fallo nunca bloquea: la persona puede escribirlo igualmente", () => {
    const r = evaluarCargaPerfil({ sesion: true, fila: null, error: new Error("red caída") });
    expect(r.estado).toBe("error");
    expect(r.aviso).toContain("escribirlo");
  });

  it("una excepción suelta se trata como fallo de carga, no como perfil vacío", () => {
    const r = evaluarCargaPerfil({ sesion: true, fila: null, error: new Error("boom") });
    expect(r.estado).toBe("error");
    expect(r.rastro).toContain("boom");
  });

  it("el rastro dice DÓNDE falló, no solo qué", () => {
    const r = evaluarCargaPerfil({ sesion: true, fila: null, error: new Error("boom") });
    expect(r.rastro).toContain("perfil");
  });

  it("una fila a medias (sin handle) no es un fallo: el perfil se cargó", () => {
    const r = evaluarCargaPerfil({ sesion: true, fila: { display_name: "Alex" }, error: null });
    expect(r.estado).toBe("cargado");
    expect(r.aviso).toBeNull();
  });

  it("un error vacío tampoco se pierde: se cuenta igual", () => {
    const r = evaluarCargaPerfil({ sesion: true, fila: null, error: "" });
    expect(r.estado).toBe("error");
    expect(r.rastro).toContain("error desconocido");
  });

  it("un error sin mensaje (null) se cuenta como desconocido", () => {
    const r = evaluarCargaPerfil({ sesion: true, fila: null, error: null });
    expect(r.estado).toBe("sin-perfil");
    expect(r.rastro).toBeNull();
  });
});

describe("rastroCargaPerfil", () => {
  it("dice dónde falló y qué falló", () => {
    expect(rastroCargaPerfil("cargar tu perfil", "red caída")).toBe(
      "[perfil-inicial] no se pudo cargar tu perfil: red caída",
    );
  });
});
