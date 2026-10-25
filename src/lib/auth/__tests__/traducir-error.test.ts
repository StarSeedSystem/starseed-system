/** ACC1025A · los errores de acceso, en español (salieron de AuthGate sin cambiar una palabra). */
import { describe, expect, it } from "vitest";
import { traducirErrorAuth } from "../traducir-error";

describe("traducirErrorAuth", () => {
  it.each([
    ["Invalid login credentials", "Correo o contraseña incorrectos."],
    ["User already registered", "Ese correo ya tiene cuenta. Inicia sesión."],
    ["Password should be at least 6 characters", "La contraseña debe tener al menos 6 caracteres."],
    ["Unable to validate email address: invalid format", "Escribe un correo válido."],
    ["Anonymous sign-ins are disabled", "El modo invitado no está disponible ahora mismo."],
    ["Signups not allowed for this instance", "El registro está deshabilitado por ahora."],
    ["email rate limit exceeded", "Demasiados intentos. Espera un momento."],
  ])("%s", (entrada, esperado) => {
    expect(traducirErrorAuth(entrada)).toBe(esperado);
  });

  it("lo desconocido se muestra tal cual y lo vacío cae a un mensaje honesto", () => {
    expect(traducirErrorAuth("Algo raro del servidor")).toBe("Algo raro del servidor");
    expect(traducirErrorAuth("")).toBe("No se pudo completar. Intenta de nuevo.");
    expect(traducirErrorAuth(null)).toBe("No se pudo completar. Intenta de nuevo.");
  });
});
