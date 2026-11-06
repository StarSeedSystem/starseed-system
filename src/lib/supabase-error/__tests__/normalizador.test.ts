import { describe, expect, it } from "vitest";
import { normalizarErrorSupabase, clasificarErrorSupabase } from "../normalizador";

describe("normalizarErrorSupabase", () => {
  it("clasifica error de autenticación", () => {
    const error = {
      name: "AuthError",
      message: "Invalid login credentials",
      status: 400,
    };
    const resultado = normalizarErrorSupabase(error);
    expect(resultado.categoria).toBe("autenticación");
    expect(resultado.codigoUsuario).toBe("auth_error");
    expect(resultado.mensajeUsuario).toBe("Correo o contraseña incorrectos.");
  });

  it("clasifica error de permisos", () => {
    const error = {
      code: "42501",
      message: "permission denied for table usuarios",
      details: "",
      hint: "",
      status: 403,
    };
    const resultado = normalizarErrorSupabase(error);
    expect(resultado.categoria).toBe("permisos");
    expect(resultado.codigoUsuario).toBe("permission_denied");
    expect(resultado.mensajeUsuario).toBe("No tienes permiso para realizar esta acción.");
  });

  it("clasifica error de validación", () => {
    const error = {
      code: "23502",
      message: "null value in column \"email\" violates not-null constraint",
      details: "",
      hint: "",
      status: 400,
    };
    const resultado = normalizarErrorSupabase(error);
    expect(resultado.categoria).toBe("validación");
    expect(resultado.codigoUsuario).toBe("validation_error");
    expect(resultado.mensajeUsuario).toBe("Los datos no son válidos. Revisa la información.");
  });

  it("clasifica error de no encontrado", () => {
    const error = {
      code: "PGRST116",
      message: "The result contains 0 rows",
      details: "",
      hint: "",
      status: 406,
    };
    const resultado = normalizarErrorSupabase(error);
    expect(resultado.categoria).toBe("no encontrado");
    expect(resultado.codigoUsuario).toBe("not_found");
    expect(resultado.mensajeUsuario).toBe("No se encontró lo que buscas.");
  });

  it("clasifica error de rate limit", () => {
    const error = {
      message: "Too Many Requests",
      status: 429,
    };
    const resultado = normalizarErrorSupabase(error);
    expect(resultado.categoria).toBe("rate limit");
    expect(resultado.codigoUsuario).toBe("rate_limit");
    expect(resultado.mensajeUsuario).toBe("Demasiadas solicitudes. Intenta de nuevo en un momento.");
  });

  it("clasifica error de red", () => {
    const error = new Error("Network error");
    const resultado = normalizarErrorSupabase(error);
    expect(resultado.categoria).toBe("servicio");
    expect(resultado.codigoUsuario).toBe("network_error");
  });
});

describe("clasificarErrorSupabase", () => {
  it("devuelve categoría para PostgrestError", () => {
    const error = { code: "42501", message: "permission denied" };
    expect(clasificarErrorSupabase(error)).toBe("permisos");
  });

  it("devuelve categoría para AuthError", () => {
    const error = { name: "AuthError", message: "invalid credentials" };
    expect(clasificarErrorSupabase(error)).toBe("autenticación");
  });

  it("clasifica error de conflicto", () => {
    const error = { code: "23505", message: "duplicate key" };
    expect(clasificarErrorSupabase(error)).toBe("conflicto");
  });

  it("clasifica error de validación por código", () => {
    const error = { code: "23502", message: "null value" };
    expect(clasificarErrorSupabase(error)).toBe("validación");
  });

  it("clasifica error de no encontrado por status", () => {
    const error = { status: 404, message: "not found" };
    expect(clasificarErrorSupabase(error)).toBe("no encontrado");
  });

  it("maneja error desconocido", () => {
    expect(clasificarErrorSupabase(null)).toBe("servicio");
    expect(clasificarErrorSupabase(undefined)).toBe("servicio");
    expect(clasificarErrorSupabase("string")).toBe("servicio");
  });
});
