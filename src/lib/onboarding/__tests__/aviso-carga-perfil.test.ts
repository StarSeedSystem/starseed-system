import { describe, it, expect } from "vitest";
import { avisoCargaPerfil } from "@/lib/onboarding/aviso-carga-perfil";

describe("avisoCargaPerfil", () => {
  it("avisa con un error de red (sin status HTTP)", () => {
    const aviso = avisoCargaPerfil(new Error("Failed to fetch"));
    expect(aviso).not.toBeNull();
    expect(aviso?.tipo).toBe("red");
    expect(aviso?.texto).toBe("No se pudo conectar");
    expect(aviso?.detalle).toBe("Failed to fetch");
  });

  it("avisa con un error de indisponibilidad (status 500)", () => {
    const error = new Error("Internal Server Error");
    // @ts-ignore
    error.status = 500;
    const aviso = avisoCargaPerfil(error);
    expect(aviso).not.toBeNull();
    expect(aviso?.tipo).toBe("indisponible");
    expect(aviso?.texto).toBe("El servicio no está disponible ahora");
  });

  it("avisa con un error que no es instancia de Error", () => {
    const aviso = avisoCargaPerfil("boom");
    expect(aviso).not.toBeNull();
    expect(aviso?.detalle).toBe("boom");
  });

  it("no avisa cuando no hay error (catch con valor vacío)", () => {
    expect(avisoCargaPerfil(null)).toBeNull();
    expect(avisoCargaPerfil(undefined)).toBeNull();
    expect(avisoCargaPerfil("")).toBeNull();
  });
});
