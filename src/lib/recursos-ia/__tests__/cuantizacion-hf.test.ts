import { describe, expect, it } from "vitest";
import {
  cuantizacionesPara,
  METODOS_HF,
  NOTA_BITNET,
  type DispositivoHF,
  type MetodoCuantizacion,
} from "../cuantizacion-hf";

const ids = (lista: MetodoCuantizacion[]): string[] => lista.map((m) => m.id);

describe("matriz de cuantización de transformers", () => {
  it("tiene ids únicos", () => {
    const vistos = ids(METODOS_HF);
    expect(new Set(vistos).size).toBe(vistos.length);
    expect(vistos).toHaveLength(9);
  });

  it("en metal salen GGUF, GPT-QModel, optimum-quanto y Metal, con ok antes que bitsandbytes (parcial)", () => {
    const enMetal = cuantizacionesPara("metal");
    const encontrados = ids(enMetal);

    expect(encontrados).toContain("gguf");
    expect(encontrados).toContain("gptqmodel");
    expect(encontrados).toContain("optimum-quanto");
    expect(encontrados).toContain("metal");

    const metal = encontrados.indexOf("metal");
    const bnb = encontrados.indexOf("bitsandbytes");
    expect(metal).toBeGreaterThanOrEqual(0);
    expect(bnb).toBeGreaterThan(metal);
    expect(enMetal[bnb].soporte.metal).toBe("parcial");
  });

  it("en rocm salen AWQ y GPT-QModel", () => {
    const encontrados = ids(cuantizacionesPara("rocm"));
    expect(encontrados).toContain("awq");
    expect(encontrados).toContain("gptqmodel");
  });

  it("con alaVuelta y peft en cuda incluye bitsandbytes y HQQ pero no GGUF", () => {
    const encontrados = ids(cuantizacionesPara("cuda", { alaVuelta: true, peft: true }));
    expect(encontrados).toContain("bitsandbytes");
    expect(encontrados).toContain("hqq");
    expect(encontrados).not.toContain("gguf");
  });

  it("con bitsMax 2 deja fuera AWQ y bitsandbytes", () => {
    const encontrados = ids(cuantizacionesPara("cuda", { bitsMax: 2 }));
    expect(encontrados).not.toContain("awq");
    expect(encontrados).not.toContain("bitsandbytes");
  });

  it("en intel no sale ningún método sin soporte", () => {
    const enIntel = cuantizacionesPara("intel");
    expect(enIntel.length).toBeGreaterThan(0);
    for (const metodo of enIntel) {
      expect(metodo.soporte.intel).not.toBe("no");
    }
  });

  it("ordena ok antes que parcial en todos los dispositivos", () => {
    const dispositivos: DispositivoHF[] = ["cpu", "cuda", "rocm", "metal", "intel"];
    for (const dispositivo of dispositivos) {
      const lista = cuantizacionesPara(dispositivo);
      const primerParcial = lista.findIndex((m) => m.soporte[dispositivo] === "parcial");
      if (primerParcial === -1) continue;
      const despues = lista.slice(primerParcial);
      expect(despues.every((m) => m.soporte[dispositivo] === "parcial")).toBe(true);
    }
  });

  it("NOTA_BITNET menciona BitNet", () => {
    expect(NOTA_BITNET).toMatch(/BitNet/);
  });
});
