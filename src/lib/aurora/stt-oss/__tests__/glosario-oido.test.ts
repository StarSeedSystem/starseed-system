import { describe, it, expect } from "vitest";
import { corregirConGlosario, glosarioBase } from "../glosario-oido";

describe("corregirConGlosario", () => {
  const glosario = glosarioBase();

  it("devuelve texto vacío y cambios vacío para entrada vacía", () => {
    const resultado = corregirConGlosario("", glosario, "es");
    expect(resultado.texto).toBe("");
    expect(resultado.cambios).toEqual([]);
  });

  it("corrige 'Star Sed' a 'StarSeed' en español", () => {
    const resultado = corregirConGlosario("Star Sed", glosario, "es");
    expect(resultado.texto).toBe("StarSeed");
    expect(resultado.cambios).toEqual(["Star Sed → StarSeed"]);
  });

  it("corrige 'StarSead' a 'StarSeed' en español", () => {
    const resultado = corregirConGlosario("StarSead", glosario, "es");
    expect(resultado.texto).toBe("StarSeed");
    expect(resultado.cambios).toEqual(["StarSead → StarSeed"]);
  });

  it("corrige 'Estora' a 'Astraura' en español", () => {
    const resultado = corregirConGlosario("Estora", glosario, "es");
    expect(resultado.texto).toBe("Astraura");
    expect(resultado.cambios).toEqual(["Estora → Astraura"]);
  });

  it("corrige 'Star Said' a 'StarSeed' en español", () => {
    const resultado = corregirConGlosario("Star Said", glosario, "es");
    expect(resultado.texto).toBe("StarSeed");
    expect(resultado.cambios).toEqual(["Star Said → StarSeed"]);
  });

  it("corrige 'Astora' a 'Astraura' en español", () => {
    const resultado = corregirConGlosario("Astora", glosario, "es");
    expect(resultado.texto).toBe("Astraura");
    expect(resultado.cambios).toEqual(["Astora → Astraura"]);
  });

  it("no corrige palabras comunes en español", () => {
    const resultado = corregirConGlosario("star said sed", glosario, "es");
    expect(resultado.texto).toBe("star said sed");
    expect(resultado.cambios).toEqual([]);
  });

  it("funciona con frases completas", () => {
    const resultado = corregirConGlosario("Hola Star Sed como estas Estora", glosario, "es");
    expect(resultado.texto).toBe("Hola StarSeed como estas Astraura");
    expect(resultado.cambios).toEqual(["Star Sed → StarSeed", "Estora → Astraura"]);
  });

  it("trabaja en inglés", () => {
    const resultado = corregirConGlosario("Hello Star Said how are you Astora", glosario, "en");
    expect(resultado.texto).toBe("Hello StarSeed how are you Astraura");
    expect(resultado.cambios).toEqual(["Star Said → StarSeed", "Astora → Astraura"]);
  });

  it("no corrige cuando la distancia es demasiado grande", () => {
    const resultado = corregirConGlosario("Starra Seed", glosario, "es");
    expect(resultado.texto).toBe("Starra Seed");
    expect(resultado.cambios).toEqual([]);
  });

  it("acepta glosario personalizado", () => {
    const glosarioPersonalizado = ["StarSeed", "Astraura", "TestName"];
    const resultado = corregirConGlosario("Test Nam", glosarioPersonalizado, "es");
    expect(resultado.texto).toBe("TestName");
    expect(resultado.cambios).toEqual(["Test Nam → TestName"]);
  });

  it("mantiene mayúsculas originales del glosario", () => {
    const resultado = corregirConGlosario("astraura", glosario, "es");
    expect(resultado.texto).toBe("Astraura"); // Debería mantener la forma del glosario
    expect(resultado.cambios).toEqual(["astraura → Astraura"]);
  });

  it("el glosario base acepta los nombres de la persona, sus bots y su grupo", () => {
    const ampliado = glosarioBase(["Alba", "Sombra"]);
    expect(ampliado.slice(0, 8)).toEqual(glosario);
    expect(ampliado).toContain("Alba");
    // «Albа» lleva la «а» cirílica: una sola edición distinta y el nombre se salva igual.
    const resultado = corregirConGlosario("Alb\u0430 dice Sombra", ["Alba", "Sombra"], "es");
    expect(resultado.texto).toBe("Alba dice Sombra");
  });

  it("corrige formas con tilde como «Génesis» a «Genesis»", () => {
    const resultado = corregirConGlosario("el Génesis empieza", glosario, "es");
    expect(resultado.texto).toBe("el Genesis empieza");
    expect(resultado.cambios).toEqual(["Génesis → Genesis"]);
  });

  it("empates de distancia, gana el nombre más largo: «Astora» es «Astraura» y no «Aurora»", () => {
    const invertido = [...glosario].reverse(); // Aurora antes que Astraura
    const resultado = corregirConGlosario("Astora Habla", invertido, "es");
    expect(resultado.texto).toBe("Astraura Habla");
    expect(resultado.cambios).toEqual(["Astora → Astraura"]);
  });

  it("palabras comunes con mayúscula tampoco se reescriben", () => {
    const resultado = corregirConGlosario("El Said y la Sed", glosario, "es");
    expect(resultado.texto).toBe("El Said y la Sed");
    expect(resultado.cambios).toEqual([]);
  });

  it("no rompe una palabra común aunque venga sola y con mayúscula inicial", () => {
    const resultado = corregirConGlosario("Star feats", glosario, "es");
    expect(resultado.texto).toBe("Star feats");
    expect(resultado.cambios).toEqual([]);
  });
});