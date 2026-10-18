import { describe, it, expect } from "vitest";
import { corregirConGlosario, glosarioBase } from "../glosario-oido";

describe("glosarioBase", () => {
  it("contiene Astraura y StarSeed", () => {
    const glosario = glosarioBase();
    expect(glosario).toContain('Astraura');
    expect(glosario).toContain('StarSeed');
  });
});

describe("corregirConGlosario", () => {
  const glosario = glosarioBase();
  
  it("corrige Astraura a Astraura (sin cambios)", () => {
    const resultado = corregirConGlosario("Astraura", glosario, 'es');
    expect(resultado.cambios).toHaveLength(0);
    expect(resultado.texto).toBe("Astraura");
  });
  
  it("corrige Estora a Astraura (distancia pequeña)", () => {
    const resultado = corregirConGlosario("Estora", glosario, 'es');
    expect(resultado.cambios).toHaveLength(1);
    expect(resultado.cambios[0]).toEqual({ original: "Estora", corregido: "Astraura" });
    expect(resultado.texto).toBe("Astraura");
  });
  
  it("corrige Astora a Astraura (distancia pequeña)", () => {
    const resultado = corregirConGlosario("Astora", glosario, 'es');
    expect(resultado.cambios).toHaveLength(1);
    expect(resultado.cambios[0]).toEqual({ original: "Astora", corregido: "Astraura" });
    expect(resultado.texto).toBe("Astraura");
  });
  
  it("corrige Star Sed a StarSeed (medición Phonon-2)", () => {
    const resultado = corregirConGlosario("Star Sed", glosario, 'es');
    expect(resultado.cambios).toHaveLength(1);
    expect(resultado.cambios[0]).toEqual({ original: "Star Sed", corregido: "StarSeed" });
    expect(resultado.texto).toBe("StarSeed");
  });
  
  it("corrige Star Said a StarSeed (medición Parakeet)", () => {
    const resultado = corregirConGlosario("Star Said", glosario, 'es');
    expect(resultado.cambios).toHaveLength(1);
    expect(resultado.cambios[0]).toEqual({ original: "Star Said", corregido: "StarSeed" });
    expect(resultado.texto).toBe("StarSeed");
  });
  
  it("corrige StarSead a StarSeed (ya correcto)", () => {
    const resultado = corregirConGlosario("StarSead", glosario, 'es');
    expect(resultado.cambios).toHaveLength(0);
    expect(resultado.texto).toBe("StarSead");
  });
  
  it("no reemplaza palabras comunes como 'el'", () => {
    const resultado = corregirConGlosario("el Astraura", glosario, 'es');
    expect(resultado.cambios).toHaveLength(0);
    expect(resultado.texto).toBe("el Astraura");
  });
  
  it("no reemplaza palabras comunes como 'the' (en)", () => {
    const resultado = corregirConGlosario("the Astraura", glosario, 'en');
    expect(resultado.cambios).toHaveLength(0);
    expect(resultado.texto).toBe("the Astraura");
  });
  
  it("corrige múltiples palabras en una oración", () => {
    const texto = "Estoy usando Star Sed y Astora";
    const resultado = corregirConGlosario(texto, glosario, 'es');
    expect(resultado.cambios).toHaveLength(2);
    expect(resultado.texto).toBe("Estoy usando StarSeed y Astraura");
  });
  
  it("no modifica texto sin errores", () => {
    const texto = "Hello world";
    const resultado = corregirConGlosario(texto, glosario, 'en');
    expect(resultado.cambios).toHaveLength(0);
    expect(resultado.texto).toBe("Hello world");
  });
  
  it("funciona con puntuación", () => {
    const texto = "Estora, Astora!";
    const resultado = corregirConGlosario(texto, glosario, 'es');
    expect(resultado.cambios).toHaveLength(2);
    expect(resultado.texto).toBe("Astraura, Astraura!");
  });
  
  it("mantén mayúsculas iniciales", () => {
    const resultado = corregirConGlosario("estora", glosario, 'es');
    expect(resultado.cambios).toHaveLength(1);
    expect(resultado.cambios[0].original).toBe("estora");
    expect(resultado.cambios[0].corregido).toBe("Astraura");
    expect(resultado.texto).toBe("Astraura");
  });
});
