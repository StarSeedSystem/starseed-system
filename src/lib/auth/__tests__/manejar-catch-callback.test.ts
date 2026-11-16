import { describe, expect, it } from "vitest";
import { manejarCatchCallback } from "../manejar-catch-callback";

describe("manejarCatchCallback", () => {
  it("redirige con mensaje del error", () => {
    const error = new Error("Token expirado");
    const respuesta = manejarCatchCallback(error, "https://app.com", "/escritorios");
    expect(respuesta.status).toBe(307);
    expect(respuesta.headers.get("Location")).toBe(
      "https://app.com/login?error=callback-error&msg=Token%20expirado"
    );
  });

  it("maneja error no Error", () => {
    const error = "Algo falló";
    const respuesta = manejarCatchCallback(error, "https://app.com", "/escritorios");
    expect(respuesta.status).toBe(307);
    expect(respuesta.headers.get("Location")).toBe(
      "https://app.com/login?error=callback-error&msg=Error%20en%20el%20proceso%20de%20autenticaci%C3%B3n"
    );
  });
});