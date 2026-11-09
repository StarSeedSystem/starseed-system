import { describe, it, expect } from "vitest";
import { resultadoASentido } from "../senses";

/**
 * PRM1108C · paso 2: `resultadoASentido` delega en `estadoDeResultado` del
 * contrato único de permisos. Mensajes puros del navegador (sin red, sin DOM,
 * sin aparato real). El caso de Firefox estaba en rojo con el regex viejo:
 * un NotAllowedError sin la palabra «denied» caía como «prompt».
 */

const CHROME_MSG =
  "The request is not allowed by the user agent or the platform in the current context, possibly due to user permissions.";
const FIREFOX_MSG =
  "The request is not allowed by the user agent or the platform in the current context.";

describe("resultadoASentido", () => {
  it("concede cuando el result del motor pasa concedido", () => {
    expect(resultadoASentido({ soportado: true, concedido: true })).toEqual({
      ok: true,
      state: "granted",
    });
  });

  it("devuelve unsupported cuando no hay soporte, con su motivo", () => {
    expect(
      resultadoASentido({ soportado: false, concedido: false, motivo: "Este navegador no expone la cámara/micrófono." }),
    ).toEqual({
      ok: false,
      state: "unsupported",
      error: "Este navegador no expone la cámara/micrófono.",
    });
  });

  it("traduce a denied el mensaje de Chrome sin la palabra «denied»", () => {
    // En rojo con el regex viejo: «possibly due to user permissions» no casaba.
    expect(
      resultadoASentido({ soportado: true, concedido: false, motivo: CHROME_MSG }),
    ).toEqual({ ok: false, state: "denied", error: CHROME_MSG });
  });

  it("traduce a denied el NotAllowedError de Firefox (sin la palabra «denied»)", () => {
    // El nombre de error manda sobre el mensaje: en rojo contra main, que
    // devolvía «prompt» porque el texto no contiene «denied».
    expect(
      resultadoASentido({
        soportado: true,
        concedido: false,
        motivo: FIREFOX_MSG,
        nombreError: "NotAllowedError",
      }),
    ).toEqual({ ok: false, state: "denied", error: FIREFOX_MSG });
  });

  it("denegado por nombreError NotAllowedError aunque el motivo diga poco", () => {
    expect(
      resultadoASentido({ soportado: true, concedido: false, nombreError: "NotAllowedError" }),
    ).toEqual({ ok: false, state: "denied", error: undefined });
  });

  it("conserva «prompt» para el motivo «default» del navegador", () => {
    expect(
      resultadoASentido({ soportado: true, concedido: false, motivo: "default" }),
    ).toEqual({ ok: false, state: "prompt", error: "default" });
  });

  it("conserva «prompt» con motivo vacío o sin motivo", () => {
    expect(resultadoASentido({ soportado: true, concedido: false, motivo: "" })).toEqual({
      ok: false,
      state: "prompt",
      error: "",
    });
    expect(resultadoASentido({ soportado: true, concedido: false })).toEqual({
      ok: false,
      state: "prompt",
      error: undefined,
    });
  });
});