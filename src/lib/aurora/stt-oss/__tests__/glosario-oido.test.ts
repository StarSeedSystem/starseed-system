import { describe, it, expect } from "vitest";
import { corregirConGlosario, glosarioBase } from "../glosario-oido";

/** Casos medidos el 2026-10-15 en el Oracle A1 (contrato voz-fusionada-astraura.md §1). */
const base = glosarioBase();

describe("corregirConGlosario", () => {
  it("devuelve el texto tal cual ante entrada vacía", () => {
    const r = corregirConGlosario("", base, "es");
    expect(r.texto).toBe("");
    expect(r.cambios).toEqual([]);
  });

  it("corrige las salidas reales de Phonon-2 en español", () => {
    const r = corregirConGlosario("Star Sed StarSead Estora", base, "es");
    expect(r.texto).toBe("StarSeed StarSeed Astraura");
    expect(r.cambios).toEqual(["Star Sed → StarSeed", "StarSead → StarSeed", "Estora → Astraura"]);
  });

  it("corrige las salidas reales de Parakeet v3", () => {
    const r = corregirConGlosario("Star Said Astora", base, "es");
    expect(r.texto).toBe("StarSeed Astraura");
    expect(r.cambios).toEqual(["Star Said → StarSeed", "Astora → Astraura"]);
  });

  it("corrige en inglés la misma frase medida", () => {
    const r = corregirConGlosario("Hello Star Said how are you Astora", base, "en");
    expect(r.texto).toBe("Hello StarSeed how are you Astraura");
    expect(r.cambios).toEqual(["Star Said → StarSeed", "Astora → Astraura"]);
  });

  it("corrige dentro de una frase completa en español", () => {
    const r = corregirConGlosario("Hola Star Sed como estas Estora", base, "es");
    expect(r.texto).toBe("Hola StarSeed como estas Astraura");
    expect(r.cambios).toEqual(["Star Sed → StarSeed", "Estora → Astraura"]);
  });

  it("no toca las palabras comunes del idioma", () => {
    expect(corregirConGlosario("star said sed", base, "es").cambios).toEqual([]);
    expect(corregirConGlosario("star said sed", base, "en").cambios).toEqual([]);
  });

  it("no rompe palabras de es/en cercanas a los nombres", () => {
    expect(corregirConGlosario("estar descansando estaba bien auras aurea", base, "es").texto)
      .toBe("estar descansando estaba bien auras aurea");
    expect(corregirConGlosario("our seeds here were farther tones starts", base, "en").cambios)
      .toEqual([]);
  });

  it("no funde dos palabras reales cuando solo una lleva mayúscula", () => {
    const r = corregirConGlosario("you Astora", base, "en");
    expect(r.texto).toBe("you Astraura");
    expect(r.cambios).toEqual(["Astora → Astraura"]);
  });

  it("no corrige formas demasiado lejos del glosario", () => {
    expect(corregirConGlosario("Candado", base, "es").cambios).toEqual([]);
  });

  it("corrige también el nombre en minúsculas", () => {
    const r = corregirConGlosario("astraura", base, "es");
    expect(r.texto).toBe("Astraura");
    expect(r.cambios).toEqual(["astraura → Astraura"]);
  });

  it("deja estable la familia Genesis cuando el texto es exacto", () => {
    expect(corregirConGlosario("poligenesis", base, "es").texto).toBe("PoliGenesis");
    expect(corregirConGlosario("metagenesis", base, "es").texto).toBe("MetaGenesis");
  });

  it("el oído no escribe acentos: Génesis vuelve a Genesis", () => {
    expect(corregirConGlosario("el Génesis", base, "es").texto).toBe("el Genesis");
  });

  it("con glosario personalizado corrige con sus nombres", () => {
    const r = corregirConGlosario("Test Nam", ["StarSeed", "Astraura", "TestName"], "es");
    expect(r.texto).toBe("TestName");
    expect(r.cambios).toEqual(["Test Nam → TestName"]);
  });

  it("nunca lanza: glosario vacío o con entradas vacías", () => {
    expect(corregirConGlosario("Hola Estora", [], "es")).toEqual({ texto: "Hola Estora", cambios: [] });
    expect(corregirConGlosario("Hola Estora", ["", "   "], "es")).toEqual({ texto: "Hola Estora", cambios: [] });
  });

  it("corre con espejo de idioma desconocido usando es", () => {
    const r = corregirConGlosario("estadounidense misterioso", base, "xx");
    expect(r.texto).toBe("estadounidense misterioso");
    expect(r.cambios).toEqual([]);
  });
});

describe("glosarioBase", () => {
  it("trae los ocho nombres del sistema", () => {
    expect(base).toEqual([
      "Astraura", "StarSeed", "Genesis", "MetaGenesis",
      "PoliGenesis", "ProtoGenesis", "Aurora", "Hermes",
    ]);
  });

  it("añade los nombres del usuario, bots y grupo sin repetir", () => {
    const conExtra = glosarioBase(["Tesla", "asTRAURA"]);
    expect(conExtra).toContain("Tesla");
    expect(conExtra.filter((n) => n === "Astraura")).toHaveLength(1);
    expect(conExtra).toHaveLength(9);
  });
});
