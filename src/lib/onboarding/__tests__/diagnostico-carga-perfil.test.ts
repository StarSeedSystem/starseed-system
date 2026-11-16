import { describe, it, expect } from "vitest";
import { diagnosticoCargaPerfil } from "@/lib/onboarding/onboarding";

describe("diagnosticoCargaPerfil", () => {
  it("error de red deja rastro con contexto de carga de perfil", () => {
    const error = new Error("Failed to fetch");
    expect(diagnosticoCargaPerfil(error)).toBe(
      "[onboarding] no se pudo conectar al cargar el perfil (red): se edita igual desde cero",
    );
  });

  it("indisponibilidad (status HTTP) deja rastro distinto al de red", () => {
    const error = new Error("Internal Server Error");
    // @ts-ignore
    error.status = 500;
    expect(diagnosticoCargaPerfil(error)).toBe(
      "[onboarding] indisponibilidad al cargar el perfil: se edita igual desde cero",
    );
  });

  it("un error sin forma reconocida se trata como red", () => {
    expect(diagnosticoCargaPerfil(null)).toBe(
      "[onboarding] no se pudo conectar al cargar el perfil (red): se edita igual desde cero",
    );
  });

  it("un objeto error de consulta sin status también avisa como red", () => {
    const error = { message: "permission denied", code: "42501" };
    expect(diagnosticoCargaPerfil(error)).toBe(
      "[onboarding] no se pudo conectar al cargar el perfil (red): se edita igual desde cero",
    );
  });
});
