import { describe, expect, it, vi } from "vitest";
import { manejarCallback } from "../manejar-callback";

describe("manejarCallback", () => {
  const origen = "http://localhost";

  it("redirige al login con error cuando no hay code", async () => {
    const resultado = await manejarCallback({
      code: null,
      next: "/dashboard",
      origin: origen,
      exchangeFn: vi.fn(),
    });
    expect(resultado.redirectTo).toBe(`${origen}/login?error=auth-callback`);
  });

  it("redirige al next cuando el exchange es exitoso", async () => {
    await manejarCallback({
      code: "abc123",
      next: "/llamada/123",
      origin: origen,
      exchangeFn: vi.fn().mockResolvedValue({}),
    }).then((resultado) => {
      expect(resultado.redirectTo).toBe(`${origen}/llamada/123`);
    });
  });

  it("redirige al login con error cuando exchangeCodeForSession falla con error", async () => {
    const resultado = await manejarCallback({
      code: "invalid",
      next: "/dashboard",
      origin: origen,
      exchangeFn: vi.fn().mockResolvedValue({ error: { message: "Invalid code" } }),
    });
    expect(resultado.redirectTo).toBe(`${origen}/login?error=auth-callback`);
  });

  it("redirige al login con error cuando exchangeCodeForSession lanza excepción", async () => {
    const resultado = await manejarCallback({
      code: "xyz",
      next: "/test",
      origin: origen,
      exchangeFn: vi.fn().mockRejectedValue(new Error("Network error")),
    });
    expect(resultado.redirectTo).toBe(`${origen}/login?error=auth-callback`);
  });

  it("usa /escritorios como defecto cuando next no es válido (URL externo)", async () => {
    const resultado = await manejarCallback({
      code: "valid-code",
      next: "https://otra.web",
      origin: origen,
      exchangeFn: vi.fn().mockResolvedValue({}),
    });
    expect(resultado.redirectTo).toBe(`${origen}/escritorios`);
  });

  it("usa /escritorios como defecto cuando next es null", async () => {
    const resultado = await manejarCallback({
      code: "valid-code",
      next: null,
      origin: origen,
      exchangeFn: vi.fn().mockResolvedValue({}),
    });
    expect(resultado.redirectTo).toBe(`${origen}/escritorios`);
  });
});