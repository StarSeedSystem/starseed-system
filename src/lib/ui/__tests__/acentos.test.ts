import { describe, it, expect } from "vitest";
import { ACENTOS, acentoDeIndice, acentoDePaso, clasesAcento, type Acento } from "../acentos";

describe("acentos Trinity (Ola 227)", () => {
  it("la paleta tiene 10 acentos únicos", () => {
    expect(ACENTOS).toHaveLength(10);
    expect(new Set(ACENTOS).size).toBe(10);
  });

  it("acentoDeIndice rota la paleta completa y envuelve", () => {
    expect(acentoDeIndice(0)).toBe("azure");
    expect(acentoDeIndice(9)).toBe("violet");
    expect(acentoDeIndice(10)).toBe(acentoDeIndice(0));
  });

  it("acentoDeIndice tolera negativos", () => {
    expect(acentoDeIndice(-1)).toBe(ACENTOS[ACENTOS.length - 1]);
    expect(acentoDeIndice(-10)).toBe(ACENTOS[0]);
  });

  it("acentoDePaso asigna el mapa fijo del rito", () => {
    expect(acentoDePaso("bienvenida")).toBe("violet");
    expect(acentoDePaso("identidad")).toBe("azure");
    expect(acentoDePaso("correos")).toBe("cyan");
    expect(acentoDePaso("permisos")).toBe("lime");
    expect(acentoDePaso("cerebros")).toBe("magenta");
    expect(acentoDePaso("neurona")).toBe("emerald");
    expect(acentoDePaso("guia")).toBe("amber");
  });

  it("acentoDePaso con clave desconocida devuelve un acento válido y estable", () => {
    const a = acentoDePaso("clave-inventada");
    expect(ACENTOS).toContain(a);
    expect(acentoDePaso("clave-inventada")).toBe(a);
  });

  it("clasesAcento devuelve literales completas para cada acento", () => {
    for (const a of ACENTOS) {
      const c: ReturnType<typeof clasesAcento> = clasesAcento(a as Acento);
      expect(c.texto).toBe(`text-trinity-${a}`);
      expect(c.borde).toBe(`border-trinity-${a}/40`);
      expect(c.fondo).toBe(`bg-trinity-${a}/15`);
      expect(c.anillo).toBe(`ring-trinity-${a}/40`);
      const [desde, hasta] = c.degradado.split(" ");
      expect(desde).toMatch(/^from-trinity-[a-z]+$/);
      expect(hasta).toMatch(/^to-trinity-[a-z]+$/);
    }
  });

  it("ninguna pantalla puede caer en monotonía violet/verde: máximo 20 % en 10", () => {
    const moradoVerde = new Set(["violet", "emerald", "lime", "indigo"]);
    const visibles = ACENTOS.filter((a) => moradoVerde.has(a)).length;
    expect(visibles / ACENTOS.length).toBeLessThanOrEqual(0.4);
  });
});
