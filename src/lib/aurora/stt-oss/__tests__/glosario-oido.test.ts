import { describe, it, expect } from "vitest";
import { corregirConGlosario, glosarioBase } from "../glosario-oido";

describe("corregirConGlosario", () => {
  const glosario = glosarioBase();

<<<<<<< HEAD
  it("devuelve texto vacío para entrada vacía", () => {
=======
  it("devuelve texto vacío y cambios vacío para entrada vacía", () => {
>>>>>>> bf157cba3 (salvavidas · VZF1015Vc: trabajo del agente antes de las puertas (tsc / vitest))
    const resultado = corregirConGlosario("", glosario, "es");
    expect(resultado.texto).toBe("");
    expect(resultado.cambios).toEqual([]);
  });

<<<<<<< HEAD
  it("corrige Star Sed a StarSeed en español", () => {
=======
  it("corrige 'Star Sed' a 'StarSeed' en español", () => {
>>>>>>> bf157cba3 (salvavidas · VZF1015Vc: trabajo del agente antes de las puertas (tsc / vitest))
    const resultado = corregirConGlosario("Star Sed", glosario, "es");
    expect(resultado.texto).toBe("StarSeed");
    expect(resultado.cambios).toEqual(["Star Sed → StarSeed"]);
  });

<<<<<<< HEAD
  it("corrige StarSead a StarSeed en español", () => {
=======
  it("corrige 'StarSead' a 'StarSeed' en español", () => {
>>>>>>> bf157cba3 (salvavidas · VZF1015Vc: trabajo del agente antes de las puertas (tsc / vitest))
    const resultado = corregirConGlosario("StarSead", glosario, "es");
    expect(resultado.texto).toBe("StarSeed");
    expect(resultado.cambios).toEqual(["StarSead → StarSeed"]);
  });

<<<<<<< HEAD
  it("corrige Estora a Astraura en español", () => {
=======
  it("corrige 'Estora' a 'Astraura' en español", () => {
>>>>>>> bf157cba3 (salvavidas · VZF1015Vc: trabajo del agente antes de las puertas (tsc / vitest))
    const resultado = corregirConGlosario("Estora", glosario, "es");
    expect(resultado.texto).toBe("Astraura");
    expect(resultado.cambios).toEqual(["Estora → Astraura"]);
  });

<<<<<<< HEAD
  it("corrige Star Said a StarSeed en español", () => {
=======
  it("corrige 'Star Said' a 'StarSeed' en español", () => {
>>>>>>> bf157cba3 (salvavidas · VZF1015Vc: trabajo del agente antes de las puertas (tsc / vitest))
    const resultado = corregirConGlosario("Star Said", glosario, "es");
    expect(resultado.texto).toBe("StarSeed");
    expect(resultado.cambios).toEqual(["Star Said → StarSeed"]);
  });

<<<<<<< HEAD
  it("corrige Astora a Astraura en español", () => {
=======
  it("corrige 'Astora' a 'Astraura' en español", () => {
>>>>>>> bf157cba3 (salvavidas · VZF1015Vc: trabajo del agente antes de las puertas (tsc / vitest))
    const resultado = corregirConGlosario("Astora", glosario, "es");
    expect(resultado.texto).toBe("Astraura");
    expect(resultado.cambios).toEqual(["Astora → Astraura"]);
  });

<<<<<<< HEAD
  it("no corrige palabras comunes", () => {
=======
  it("no corrige palabras comunes en español", () => {
>>>>>>> bf157cba3 (salvavidas · VZF1015Vc: trabajo del agente antes de las puertas (tsc / vitest))
    const resultado = corregirConGlosario("star said sed", glosario, "es");
    expect(resultado.texto).toBe("star said sed");
    expect(resultado.cambios).toEqual([]);
  });

  it("funciona con frases completas", () => {
    const resultado = corregirConGlosario("Hola Star Sed como estas Estora", glosario, "es");
    expect(resultado.texto).toBe("Hola StarSeed como estas Astraura");
    expect(resultado.cambios).toEqual(["Star Sed → StarSeed", "Estora → Astraura"]);
  });

<<<<<<< HEAD
  it("funciona en inglés", () => {
=======
  it("trabaja en inglés", () => {
>>>>>>> bf157cba3 (salvavidas · VZF1015Vc: trabajo del agente antes de las puertas (tsc / vitest))
    const resultado = corregirConGlosario("Hello Star Said how are you Astora", glosario, "en");
    expect(resultado.texto).toBe("Hello StarSeed how are you Astraura");
    expect(resultado.cambios).toEqual(["Star Said → StarSeed", "Astora → Astraura"]);
  });

<<<<<<< HEAD
  it("no corrige cuando distancia es muy grande", () => {
=======
  it("no corrige cuando la distancia es demasiado grande", () => {
>>>>>>> bf157cba3 (salvavidas · VZF1015Vc: trabajo del agente antes de las puertas (tsc / vitest))
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

<<<<<<< HEAD
  it("mantiene forma del glosario", () => {
    const resultado = corregirConGlosario("astraura", glosario, "es");
    expect(resultado.texto).toBe("Astraura");
    expect(resultado.cambios).toEqual(["astraura → Astraura"]);
  });
});
=======
  it("mantiene mayúsculas originales del glosario", () => {
    const resultado = corregirConGlosario("astraura", glosario, "es");
    expect(resultado.texto).toBe("Astraura"); // Debería mantener la forma del glosario
    expect(resultado.cambios).toEqual(["astraura → Astraura"]);
  });
});
>>>>>>> bf157cba3 (salvavidas · VZF1015Vc: trabajo del agente antes de las puertas (tsc / vitest))
