import { describe, it, expect } from "vitest";
import { clasesTonoAviso, rolDeTonoAviso, type TonoAviso } from "@/components/ui/error-message";

const TONOS: TonoAviso[] = ["error", "aviso", "exito", "info"];

describe("clasesTonoAviso", () => {
  it("cada tono trae fondo, borde y texto propios: el contraste no depende del azar", () => {
    for (const tono of TONOS) {
      const clases = clasesTonoAviso(tono);
      expect(clases.caja).toMatch(/\bbg-/);
      expect(clases.caja).toMatch(/\bborder-/);
      expect(clases.caja).toMatch(/\btext-/);
      expect(clases.icono).toMatch(/\btext-/);
    }
  });

  it("error y éxito no comparten la misma caja (no se confunden sin leer)", () => {
    expect(clasesTonoAviso("error").caja).not.toBe(clasesTonoAviso("exito").caja);
    expect(clasesTonoAviso("error").caja).not.toBe(clasesTonoAviso("aviso").caja);
  });
});

describe("rolDeTonoAviso", () => {
  it("solo el error interrumpe al lector de pantalla", () => {
    expect(rolDeTonoAviso("error")).toBe("alert");
    expect(rolDeTonoAviso("aviso")).toBe("status");
    expect(rolDeTonoAviso("exito")).toBe("status");
    expect(rolDeTonoAviso("info")).toBe("status");
  });
});
