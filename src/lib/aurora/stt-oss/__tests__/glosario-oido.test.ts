import { describe, it, expect } from "vitest";
import { corregirConGlosario, glosarioBase } from "../glosario-oido";

describe("corregirConGlosario", () => {
  const glosario = glosarioBase();

  it("devuelve texto vacío y cambios vacíos para entrada vacía", () => {
    const resultado = corregirConGlosario("", glosario, "es");
    expect(resultado.texto).toBe("");
    expect(resultado.cambios).toEqual([]);
  });

  // Salidas REALES medidas el 2026-10-15 en el A1 (contrato voz-fusionada §1):
  // Phonon-2 escribió «Star Sed», «StarSead» (con hotwords) y «Estora»;
  // Parakeet v3 escribió «Star Said» y «Astora».
  it("corrige 'Star Sed' a 'StarSeed' en español (Phonon-2)", () => {
    const resultado = corregirConGlosario("Star Sed", glosario, "es");
    expect(resultado.texto).toBe("StarSeed");
    expect(resultado.cambios).toEqual(["Star Sed → StarSeed"]);
  });

  it("corrige 'StarSead' a 'StarSeed' en español (Phonon-2 con hotwords)", () => {
    const resultado = corregirConGlosario("StarSead", glosario, "es");
    expect(resultado.texto).toBe("StarSeed");
    expect(resultado.cambios).toEqual(["StarSead → StarSeed"]);
  });

  it("corrige 'Estora' a 'Astraura' en español (Phonon-2)", () => {
    const resultado = corregirConGlosario("Estora", glosario, "es");
    expect(resultado.texto).toBe("Astraura");
    expect(resultado.cambios).toEqual(["Estora → Astraura"]);
  });

  it("corrige 'Star Said' a 'StarSeed' en español (Parakeet v3)", () => {
    const resultado = corregirConGlosario("Star Said", glosario, "es");
    expect(resultado.texto).toBe("StarSeed");
    expect(resultado.cambios).toEqual(["Star Said → StarSeed"]);
  });

  it("corrige 'Astora' a 'Astraura' en español (Parakeet v3)", () => {
    const resultado = corregirConGlosario("Astora", glosario, "es");
    expect(resultado.texto).toBe("Astraura");
    expect(resultado.cambios).toEqual(["Astora → Astraura"]);
  });

  it("con un glosario vacío no cambia nada", () => {
    // Rescate rama nube/40695130948: sin nombres no hay corrección posible.
    const resultado = corregirConGlosario("hola Estora", [], "es");
    expect(resultado.texto).toBe("hola Estora");
    expect(resultado.cambios).toEqual([]);
  });

  it("no muerde palabras comunes en inglés que ya existen", () => {
    // Rescate rama nube/40695130948: en la lista corta «en» van «the», «star»,
    // «said» y «store»: en solitario (con o sin mayúscula) siguen siendo
    // palabras del idioma, no nombres propios.
    const resultado = corregirConGlosario("the Star shines and the Store shines too", glosario, "en");
    expect(resultado.texto).toBe("the Star shines and the Store shines too");
    expect(resultado.cambios).toEqual([]);
  });

  it("corrige Genesis, Hermes, Aurora, MetaGenesis, PoliGenesis y ProtoGenesis", () => {
    expect(corregirConGlosario("dime Genasis", glosario, "es").texto).toBe("dime Genesis");
    expect(corregirConGlosario("dime Ermes", glosario, "es").texto).toBe("dime Hermes");
    expect(corregirConGlosario("dime Auro ra", glosario, "es").texto).toBe("dime Aurora");
    expect(corregirConGlosario("dime Metagenesi", glosario, "es").texto).toBe(
      "dime MetaGenesis"
    );
    expect(corregirConGlosario("hola Poli Genesi", glosario, "es").texto).toBe(
      "hola PoliGenesis"
    );
    expect(corregirConGlosario("hola Proto Genesi", glosario, "es").texto).toBe(
      "hola ProtoGenesis"
    );
  });

  it("no corrige palabras comunes del idioma en minúscula", () => {
    const resultado = corregirConGlosario("star said sed", glosario, "es");
    expect(resultado.texto).toBe("star said sed");
    expect(resultado.cambios).toEqual([]);
  });

  it("no corrige una palabra común capitalizada dentro de una frase en minúscula", () => {
    // «star» y «said» están en la lista corta es/en: con mayúscula suelta
    // tampoco se convierten en nombre propio («el Star brilla»).
    const resultado = corregirConGlosario("el Star brilla y dijo Said", glosario, "es");
    expect(resultado.texto).toBe("el Star brilla y dijo Said");
    expect(resultado.cambios).toEqual([]);
  });

  it("corrige en una frase completa con dos fallos de motor", () => {
    const resultado = corregirConGlosario("Hola Star Sed como estas Estora", glosario, "es");
    expect(resultado.texto).toBe("Hola StarSeed como estas Astraura");
    expect(resultado.cambios).toEqual(["Star Sed → StarSeed", "Estora → Astraura"]);
  });

  it("corrige en inglés las formas medidas de Parakeet", () => {
    const resultado = corregirConGlosario("Hello Star Said how are you Astora", glosario, "en");
    expect(resultado.texto).toBe("Hello StarSeed how are you Astraura");
    expect(resultado.cambios).toEqual(["Star Said → StarSeed", "Astora → Astraura"]);
  });

  it("une hasta dos palabras seguidas cuando la forma unida está a ≤ 0,34 (Starra Seed 0,20)", () => {
    const resultado = corregirConGlosario("Starra Seed", glosario, "es");
    expect(resultado.texto).toBe("StarSeed");
    expect(resultado.cambios).toEqual(["Starra Seed → StarSeed"]);
  });

  it("no une el par cuando el segundo vocablo ya es el nombre exacto (no se come el artículo)", () => {
    const resultado = corregirConGlosario("The Astraura said", glosario, "en");
    expect(resultado.texto).toBe("The Astraura said");
    expect(resultado.cambios).toEqual([]);
  });

  it("recoloca la puntuación alrededor del nombre corregido", () => {
    const resultado = corregirConGlosario("hola, Estora.", glosario, "es");
    expect(resultado.texto).toBe("hola, Astraura.");
    expect(resultado.cambios).toEqual(["Estora. → Astraura"]);
  });

  it("no muerde una palabra real en minúscula que dista 0,375–0,5 (estrella)", () => {
    const resultado = corregirConGlosario("una estrella brilla", glosario, "es");
    expect(resultado.texto).toBe("una estrella brilla");
    expect(resultado.cambios).toEqual([]);
  });

  it("corrige una minúscula solo si ya casi coincide (≤ 0,15): starseed → StarSeed", () => {
    const resultado = corregirConGlosario("dime starseed por favor", glosario, "es");
    expect(resultado.texto).toBe("dime StarSeed por favor");
    expect(resultado.cambios).toEqual(["starseed → StarSeed"]);
  });

  it("acepta un glosario personalizado", () => {
    const glosarioPersonalizado = ["StarSeed", "Astraura", "TestName"];
    const resultado = corregirConGlosario("Test Nam", glosarioPersonalizado, "es");
    expect(resultado.texto).toBe("TestName");
    expect(resultado.cambios).toEqual(["Test Nam → TestName"]);
  });

  it("corrige los nombres propios del usuario, sus bots y su grupo vía glosarioBase", () => {
    const propio = glosarioBase(["Jev", "Madrina Orbita"]);
    expect(corregirConGlosario("hola jev", propio, "es").texto).toBe("hola Jev");
    expect(corregirConGlosario("Madrina Orbit", propio, "es").texto).toBe("Madrina Orbita");
  });

  it("devuelve la forma del glosario aunque la entrada vaya en minúscula", () => {
    const resultado = corregirConGlosario("astraura", glosario, "es");
    expect(resultado.texto).toBe("Astraura");
    expect(resultado.cambios).toEqual(["astraura → Astraura"]);
  });

  it("la palabra sola no se corrige si un vecino con mayúscula sugiere un nombre partido", () => {
    // «Star Sed Seed»: el par «Star Sed» ya se corrigió; «Seed» sola no se toca
    // (ni se convierte en «StarSeed» por su vecino capitalizado).
    const resultado = corregirConGlosario("Star Sed Seed", glosario, "es");
    expect(resultado.texto).toBe("StarSeed Seed");
    expect(resultado.cambios).toEqual(["Star Sed → StarSeed"]);
  });
});

describe("glosarioBase", () => {
  it("trae los ocho nombres propios de la base", () => {
    const base = glosarioBase();
    expect(base).toEqual([
      "Astraura",
      "StarSeed",
      "Genesis",
      "MetaGenesis",
      "PoliGenesis",
      "ProtoGenesis",
      "Aurora",
      "Hermes",
    ]);
  });

  it("suma los nombres que se le pasen (usuario, bots, grupo) y quita repeticiones y vacíos", () => {
    const base = glosarioBase();
    const conOtros = glosarioBase(["Jev", "Astraura", "Madrina Orbita", "  Jev  ", "   ", ""]);
    expect(conOtros.slice(base.length)).toEqual(["Jev", "Madrina Orbita"]);
    expect(conOtros.filter((nombre) => nombre === "Astraura").length).toBe(1);
  });

  it("quita repeticiones de la base sin importar mayúsculas ni espacios", () => {
    const base = glosarioBase();
    const conOtros = glosarioBase(["ASTRAURA", "  starseed  ", "astrura"]);
    expect(conOtros).toEqual([...base, "astrura"]);
  });
});
