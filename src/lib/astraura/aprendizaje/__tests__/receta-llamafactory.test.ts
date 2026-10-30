// Pruebas del generador de recetas YAML de LlamaFactory (módulo puro).
import { describe, it, expect } from "vitest";
import {
  elegirAfinado,
  recetaEntrenamiento,
  recetaFusion,
  sanearAmbito,
} from "../receta-llamafactory";
import type { OpcionesEntrenamiento } from "../receta-llamafactory";

function entrenamiento(p: Partial<OpcionesEntrenamiento> = {}): OpcionesEntrenamiento {
  return {
    ambito: "salas", destino: "ambito", baseHf: "meta-llama/Llama-3.1-8B-Instruct",
    parametrosB: 7, vramGb: 16, etapa: "sft", dataset: "salas-1025_sft",
    plantilla: "llama3", ...p,
  };
}

describe("elegirAfinado", () => {
  it("7B con 16 GB cabe en LoRA 16 bits", () => {
    const r = elegirAfinado(7, 16);
    expect(r.modo).toBe("lora16");
    expect(r.vramNecesariaGb).toBe(16);
    expect(r.fuente).toBe("README de LlamaFactory (estimación del autor)");
  });
  it("7B con 8 GB baja a QLoRA 4 bits (6 GB)", () => {
    const r = elegirAfinado(7, 8);
    expect(r.modo).toBe("qlora4");
    expect(r.vramNecesariaGb).toBe(6);
  });
  it("7B con 4 GB no cabe", () => {
    expect(elegirAfinado(7, 4).modo).toBe("no-cabe");
  });
  it("14B con 16 GB baja a QLoRA (12 GB) y más de 30 B no cabe", () => {
    const r = elegirAfinado(14, 16);
    expect(r.modo).toBe("qlora4");
    expect(r.vramNecesariaGb).toBe(12);
    expect(elegirAfinado(70, 80).modo).toBe("no-cabe");
  });
});

describe("recetaEntrenamiento", () => {
  it("rechaza BitNet, Bonsai y Needle con el motivo de QVAC/onebitllms", () => {
    for (const baseHf of [
      "microsoft/BitNet-b1.58-2B-4T", "prism-ml/Bonsai-1.7B", "cartesia/Needle-3",
    ]) {
      const r = recetaEntrenamiento(entrenamiento({ baseHf }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toContain("QVAC");
    }
  });
  it("el YAML lleva trust_remote_code en false y report_to en none, nunca en true", () => {
    const r = recetaEntrenamiento(entrenamiento());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.yaml).toContain("trust_remote_code: false");
    expect(r.yaml).toContain("report_to: none");
    expect(r.yaml).not.toContain("trust_remote_code: true");
    expect(r.yaml).not.toContain("quantization_bit");
  });
  it("KTO añade pref_beta y SFT no", () => {
    const kto = recetaEntrenamiento(entrenamiento({ etapa: "kto" }));
    const sft = recetaEntrenamiento(entrenamiento({ etapa: "sft" }));
    expect(kto.ok && sft.ok).toBe(true);
    if (!kto.ok || !sft.ok) return;
    expect(kto.yaml).toContain("pref_beta: 0.1");
    expect(kto.yaml).toContain("stage: kto");
    expect(sft.yaml).not.toContain("pref_beta");
  });
  it("QLoRA añade quantization_bit: 4 y escribe output_dir por ámbito y etapa", () => {
    const r = recetaEntrenamiento(entrenamiento({ vramGb: 8, ambito: "Salas Norte" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.yaml).toContain("quantization_bit: 4");
    expect(r.yaml).toContain("saves/salas-norte/sft-lora");
  });
  it("privado se entrena en el dispositivo propio; ámbito o público permite GPU gratuita", () => {
    const privado = recetaEntrenamiento(entrenamiento({ destino: "privado" }));
    const publico = recetaEntrenamiento(entrenamiento({ destino: "publico" }));
    expect(privado.ok && publico.ok).toBe(true);
    if (!privado.ok || !publico.ok) return;
    expect(privado.dondeEjecutar).toBe("dispositivo-propio");
    expect(publico.dondeEjecutar).toBe("gpu-gratuita-permitida");
  });
  it("sin plantilla o sin VRAM suficiente no hay receta", () => {
    expect(recetaEntrenamiento(entrenamiento({ plantilla: "  " })).ok).toBe(false);
    expect(recetaEntrenamiento(entrenamiento({ vramGb: 4 })).ok).toBe(false);
  });
});

describe("recetaFusion", () => {
  it("rechaza un modelo base terminado en -gptq", () => {
    const r = recetaFusion({
      ambito: "salas", baseHf: "TheBloke/Llama-3-8B-GPTQ",
      adaptadorDir: "saves/salas/sft-lora", plantilla: "llama3",
    });
    expect(r.ok).toBe(false);
  });
  it("fusiona sobre el base sin cuantizar con export_dir por ámbito", () => {
    const r = recetaFusion({
      ambito: "Salas Norte", baseHf: "meta-llama/Llama-3.1-8B-Instruct",
      adaptadorDir: "saves/salas-norte/sft-lora", plantilla: "llama3",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.yaml).toContain("export_dir: exports/salas-norte");
    expect(r.yaml).toContain("trust_remote_code: false");
    expect(r.yaml).toContain("export_legacy_format: false");
    expect(r.yaml).not.toContain("quantization_bit");
  });
});

describe("sanearAmbito", () => {
  it("deja solo [a-z0-9-] y cae a general si queda vacío", () => {
    expect(sanearAmbito("Salas Norte_2025")).toBe("salas-norte-2025");
    expect(sanearAmbito("¿?")).toBe("general");
  });
});
