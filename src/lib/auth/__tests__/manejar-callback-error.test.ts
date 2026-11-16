import { describe, expect, it } from "vitest";
import { manejarCallbackError } from "../manejar-callback-error";

describe("manejarCallbackError", () => {
  it("retorna ok:true cuando no hay error", () => {
    expect(manejarCallbackError(null)).toEqual({ ok: true });
    expect(manejarCallbackError(undefined)).toEqual({ ok: true });
  });

  it("retorna ok:false con el mensaje del error cuando hay un Error", () => {
    const error = new Error("Invalid code");
    const resultado = manejarCallbackError(error);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBe("Invalid code");
    expect(resultado.errorParams).toEqual({ error: "auth-callback" });
  });

  it("usa mensaje por defecto cuando el error no es una instancia de Error", () => {
    const error = { custom: "error" };
    const resultado = manejarCallbackError(error);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBe("Error de autenticación");
  });
});