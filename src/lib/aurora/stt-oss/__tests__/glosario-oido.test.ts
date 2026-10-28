import { describe, it, expect } from "vitest";
import { corregirConGlosario, glosarioBase } from "../glosario-oido";

describe("glosarioBase", () => {
  it("trae los ocho nombres propios de StarSeed, sin repetir", () => {
    expect(glosarioBase()).toEqual([
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

  it("suma usuario, bots y grupo; recorta, quita vacíos y compara sin mayúsculas", () => {
    const base = glosarioBase();
    const conOtros = glosarioBase(["Jev", "astraura", "Madrina Orbita", "  Jev  ", "   ", ""]);
    expect(conOtros.slice(base.length)).toEqual(["Jev", "Madrina Orbita"]);
    expect(conOtros.filter((nombre) => nombre === "Astraura").length).toBe(1);
  });
});

describe("corregirConGlosario", () => {
  const glosario = glosarioBase();

  it("devuelve el texto y sin cambios cuando la entrada está vacía", () => {
    expect(corregirConGlosario("", glosario, "es")).toEqual({ texto: "", cambios: [] });
  });

  // Salidas REALES medidas el 2026-10-15 en el A1 (contrato voz-fusionada §1):
  // Phonon-2 escribió «Star Sed», «StarSead» (con hotwords) y «Estora»;
  // Parakeet v3 escribió «Star Said» y «Astora».
  it.each([
    ["Star Sed", "es", "StarSeed", "Star Sed → StarSeed"],
    ["StarSead", "es", "StarSeed", "StarSead → StarSeed"],
    ["Estora", "es", "Astraura", "Estora → Astraura"],
    ["Star Said", "es", "StarSeed", "Star Said → StarSeed"],
    ["Astora", "es", "Astraura", "Astora → Astraura"],
  ])("corrige «%s» (%s) a «%s»", (entrada, idioma, texto, cambio) => {
    expect(corregirConGlosario(entrada, glosario, idioma)).toEqual({ texto, cambios: [cambio] });
  });

  it("corrige una frase completa con dos fallos de motor", () => {
    const resultado = corregirConGlosario("Hola Star Sed como estas Estora", glosario, "es");
    expect(resultado.texto).toBe("Hola StarSeed como estas Astraura");
    expect(resultado.cambios).toEqual(["Star Sed → StarSeed", "Estora → Astraura"]);
  });

  it("corrige en inglés las formas medidas de Parakeet", () => {
    const resultado = corregirConGlosario("Hello Star Said how are you Astora", glosario, "en");
    expect(resultado.texto).toBe("Hello StarSeed how are you Astraura");
    expect(resultado.cambios).toEqual(["Star Said → StarSeed", "Astora → Astraura"]);
  });

  it.each([
    ["star said sed", "es"],
    ["una estrella brilla", "es"],
    ["the star was said", "en"],
  ])("no muerde palabras comunes ni reales: «%s» (%s)", (texto, idioma) => {
    expect(corregirConGlosario(texto, glosario, idioma)).toEqual({ texto, cambios: [] });
  });

  it("une hasta dos palabras seguidas cuando la forma unida está a ≤ 0,34", () => {
    expect(corregirConGlosario("Starra Seed", glosario, "es")).toEqual({
      texto: "StarSeed",
      cambios: ["Starra Seed → StarSeed"],
    });
  });

  it("une dos palabras de un nombre del usuario o del grupo", () => {
    const resultado = corregirConGlosario("Madrina Orbit", ["Madrina Orbita", "Astraura"], "es");
    expect(resultado).toEqual({ texto: "Madrina Orbita", cambios: ["Madrina Orbit → Madrina Orbita"] });
  });

  it("no une el par cuando el segundo vocablo ya es el nombre exacto (no se come el artículo)", () => {
    expect(corregirConGlosario("The Astraura said", glosario, "en")).toEqual({
      texto: "The Astraura said",
      cambios: [],
    });
  });

  it("no toca una palabra sola si un vecino con mayúscula sugiere un nombre partido", () => {
    const resultado = corregirConGlosario("Star Sed Seed", glosario, "es");
    expect(resultado.texto).toBe("StarSeed Seed");
    expect(resultado.cambios).toEqual(["Star Sed → StarSeed"]);
  });

  it("recoloca la puntuación alrededor del nombre corregido", () => {
    expect(corregirConGlosario("hola, Estora.", glosario, "es")).toEqual({
      texto: "hola, Astraura.",
      cambios: ["Estora. → Astraura"],
    });
  });

  it("devuelve la forma del glosario aunque la entrada vaya en minúscula", () => {
    expect(corregirConGlosario("astraura", glosario, "es")).toEqual({
      texto: "Astraura",
      cambios: ["astraura → Astraura"],
    });
  });

  it("corrige una minúscula difusa solo si ya casi coincide (≤ 0,15)", () => {
    expect(corregirConGlosario("dime starseed por favor", glosario, "es")).toEqual({
      texto: "dime StarSeed por favor",
      cambios: ["starseed → StarSeed"],
    });
  });

  it("con un glosario vacío no cambia nada", () => {
    expect(corregirConGlosario("hola Star Sed", [], "es")).toEqual({
      texto: "hola Star Sed",
      cambios: [],
    });
  });
});
