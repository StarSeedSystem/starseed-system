import { describe, it, expect } from "vitest";
import { glosarioBase, corregirConGlosario } from "../glosario-oido";

describe("glosarioBase", () => {
  it("incluye los nombres del sistema", () => {
    const base = glosarioBase();
    expect(base).toContain("StarSeed");
    expect(base).toContain("Astraura");
    expect(base).toContain("Genesis");
    expect(base).toContain("MetaGenesis");
    expect(base).toContain("PoliGenesis");
    expect(base).toContain("ProtoGenesis");
    expect(base).toContain("Aurora");
    expect(base).toContain("Hermes");
  });
});

describe("corregirConGlosario", () => {
  it("corrige formas cercanas del glosario", () => {
    const res = corregirConGlosario("Star Sed", ["StarSeed"], "es");
    expect(res.texto).toBe("StarSeed");
    expect(res.cambios.length).toBeGreaterThan(0);
    expect(res.cambios[0].corregido).toBe("StarSeed");
  });

  it("corrige StarSead", () => {
    const res = corregirConGlosario("StarSead", ["StarSeed"], "es");
    expect(res.texto).toBe("StarSeed");
  });

  it("corrige Estora → Astraura", () => {
    const res = corregirConGlosario("Estora", ["Astraura"], "es");
    expect(res.texto).toBe("Astraura");
  });

  it("corrige Astora → Astraura", () => {
    const res = corregirConGlosario("Astora", ["Astraura"], "es");
    expect(res.texto).toBe("Astraura");
  });

  it("corrige Star Said → StarSeed", () => {
    const res = corregirConGlosario("Star Said", ["StarSeed"], "es");
    expect(res.texto).toBe("StarSeed");
  });

  it("no modifica palabras comunes solas", () => {
    const res = corregirConGlosario("star", ["StarSeed"], "es");
    expect(res.texto).toBe("star");
    expect(res.cambios.length).toBe(0);
  });

  it("no modifica said solo", () => {
    const res = corregirConGlosario("said", ["StarSeed"], "en");
    expect(res.texto).toBe("said");
    expect(res.cambios.length).toBe(0);
  });

  it("devuelve cambios con el glosario extendido", () => {
    const res = corregirConGlosario("MetaGenesis y ProtoGenesis", ["MetaGenesis", "ProtoGenesis"], "es");
    expect(res.cambios.length).toBe(2);
  });
});
