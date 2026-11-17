import { describe, expect, it } from "vitest";
import { procesarCallbackOAuth, type ResultadoCallbackOAuth } from "../callback-oauth";

describe("procesarCallbackOAuth", () => {
  it("devuelve éxito con URL de redirección cuando exchangeCodeForSession no da error", async () => {
    const exchangeCodeForSession = async () => ({ error: null });
    const resultado = await procesarCallbackOAuth("codigo-valido", "/escritorios", exchangeCodeForSession);
    expect(resultado).toEqual({ ok: true, redirectTo: "/escritorios" });
  });

  it("devuelve error traducido cuando exchangeCodeForSession devuelve error", async () => {
    const exchangeCodeForSession = async () => ({ error: { message: "invalid code" } });
    const resultado = await procesarCallbackOAuth("codigo-invalido", "/escritorios", exchangeCodeForSession);
    expect(resultado).toEqual({ ok: false, error: "Código de autenticación inválido o expirado." });
  });

  it("devuelve error genérico cuando exchangeCodeForSession lanza excepción", async () => {
    const exchangeCodeForSession = async () => {
      throw new Error("Network error");
    };
    const resultado = await procesarCallbackOAuth("codigo", "/escritorios", exchangeCodeForSession);
    expect(resultado).toEqual({ ok: false, error: "Error de red." });
  });

  it("usa la ruta por defecto cuando next no es seguro", async () => {
    const exchangeCodeForSession = async () => ({ error: null });
    const resultado = await procesarCallbackOAuth("codigo-valido", "http://otro-sitio.com", exchangeCodeForSession);
    expect(resultado).toEqual({ ok: true, redirectTo: "/escritorios" });
  });
});