import { describe, expect, it } from "vitest";
import { destinoCallbackAuth } from "../callback-auth";

describe("destinoCallbackAuth", () => {
  it("vuelve a la ruta segura si el intercambio fue correcto", () => {
    expect(destinoCallbackAuth(true, true, "/escritorios")).toBe("/escritorios");
  });

  it("lleva al login con error si no hay código", () => {
    expect(destinoCallbackAuth(false, false, "/escritorios")).toBe(
      "/login?error=auth-callback",
    );
  });

  it("lleva al login con error si el intercambio falla", () => {
    expect(destinoCallbackAuth(true, false, "/escritorios")).toBe(
      "/login?error=auth-callback",
    );
  });
});
