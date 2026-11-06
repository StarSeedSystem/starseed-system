import { describe, it, expect } from "vitest";
import { clasificarErrorServicio, textoErrorServicio } from "@/lib/onboarding/onboarding";

describe("classificarErrorServicio", () => {
  it("clasifica error sin status como red", () => {
    const error = new Error("Failed to fetch");
    // @ts-ignore
    error.name = "TypeError";
    const result = clasificarErrorServicio(error);
    expect(result).toBe("red");
  });

  it("clasifica error con status 500 como indisponible", () => {
    const error = new Error("Internal Server Error");
    // @ts-ignore
    error.status = 500;
    const result = clasificarErrorServicio(error);
    expect(result).toBe("indisponible");
  });

  it("clasifica error con status 404 como indisponible", () => {
    const error = new Error("Not Found");
    // @ts-ignore
    error.status = 404;
    const result = clasificarErrorServicio(error);
    expect(result).toBe("indisponible");
  });

  it("clasifica error con status 200 como red", () => {
    const error = new Error("Success");
    // @ts-ignore
    error.status = 200;
    const result = clasificarErrorServicio(error);
    // Status 200 no es error HTTP, se trata como red
    expect(result).toBe("red");
  });

  it("clasifica error null como red", () => {
    const result = clasificarErrorServicio(null);
    expect(result).toBe("red");
  });

  describe("textoErrorServicio", () => {
    it("devuelve texto para error de red", () => {
      const error = new Error("Failed to fetch");
      const texto = textoErrorServicio(error);
      expect(texto).toBe("No se pudo conectar");
    });

    it("devuelve texto para indisponibilidad", () => {
      const error = new Error("Internal Server Error");
      // @ts-ignore
      error.status = 500;
      const texto = textoErrorServicio(error);
      expect(texto).toBe("El servicio no está disponible ahora");
    });
  });
});
