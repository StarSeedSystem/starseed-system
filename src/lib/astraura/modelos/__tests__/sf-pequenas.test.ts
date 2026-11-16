// Tallas pequeñas de la familia sin filtros (MQC1 · 2026-11-16): 2B añadida, 0.8B solo si su base existe.
import { describe, expect, it } from "vitest";
import { catalogoSemilla, MODELOS_SIN_FILTROS_SEMILLA } from "../catalogo-datos";
import { catalogoCompleto, leerCatalogoModelos, modeloValido } from "../catalogo";
import { leerCatalogo } from "@/lib/astraura/capas/catalogo";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { construirPerfilNeurona, type PerfilNeurona } from "../perfil-neurona";
import { recomendar, candidatosPara } from "../recomendar";
import { type CasoUso } from "../tipos";

const capas = leerCatalogo(JSON.parse(readFileSync(join(process.cwd(), "config/capas-astraura.json"), "utf8")));
const semilla = catalogoSemilla();
const CAT = catalogoCompleto(semilla, capas);

const basePerfil = { plataforma: "tauri" as const, ramReal: true, discoLibreGb: 300, enchufada: true, ollama: true, backend158: true, webgpu: true };
const mac32 = construirPerfilNeurona({ ...basePerfil, id: "mac32", nombre: "MaggaBook", gpuRenderer: "Apple M2 Max", ramGb: 32, iaMalla: true });

describe("tallas pequeñas Qwen3.5 sin filtros (MQC1)", () => {
  it("huihui_ai/qwen3.5-abliterated:2B existe en la semilla con baseId qwen3.5:2b y 1,9 GB", () => {
    const m = MODELOS_SIN_FILTROS_SEMILLA.find((x) => x.id === "huihui_ai/qwen3.5-abliterated:2B");
    expect(m).toBeTruthy();
    expect(m?.baseId).toBe("qwen3.5:2b");
    expect(m?.descargaGb).toBe(1.9);
    expect(m?.comprobado).toBe("2026-11-16");
    expect(m?.clase).toBe("abliterated");
    expect(m?.publicador).toMatch(/huihui_ai/);
    expect(modeloValido(m!)).toBe(true);
  });

  it("huihui_ai/qwen3.5-abliterated:0.8B NO se añade porque qwen3.5:0.8b no existe en la semilla", () => {
    const m = MODELOS_SIN_FILTROS_SEMILLA.find((x) => x.id === "huihui_ai/qwen3.5-abliterated:0.8B");
    expect(m).toBeUndefined();
    const baseExiste = semilla.modelos.some((x) => x.id === "qwen3.5:0.8b" && x.clase === "normal");
    expect(baseExiste).toBe(false);
  });

  it("la variante 9b actualiza licencia a Apache 2.0 (ficha Ollama) y nota sobre base RESTRINGIDA", () => {
    const m = MODELOS_SIN_FILTROS_SEMILLA.find((x) => x.id === "huihui_ai/qwen3.5-abliterated:9b");
    expect(m).toBeTruthy();
    expect(m?.licencia).toBe("Apache 2.0 (ficha de Ollama, 2026-11-16)");
    expect(m?.nota).toMatch(/RESTRINGIDA/);
    expect(m?.nota).toMatch(/Hugging Face/);
    expect(m?.nota).toMatch(/Apache-2\.0/);
    expect(m?.comprobado).toBe("2026-11-16");
  });

  it("modeloValido acepta las nuevas variantes 2B y 9b actualizada", () => {
    const m2b = CAT.find((x) => x.id === "huihui_ai/qwen3.5-abliterated:2B")!;
    const m9b = CAT.find((x) => x.id === "huihui_ai/qwen3.5-abliterated:9b")!;
    expect(modeloValido(m2b)).toBe(true);
    expect(modeloValido(m9b)).toBe(true);
  });

  it("«Automático» sigue sin elegir ninguna variante sin filtros (reutiliza candidatosPara)", () => {
    for (const caso of ["conversacion", "codigo-agentes", "archivos-privados", "vision"] as CasoUso[]) {
      const cands = candidatosPara(CAT, mac32, caso);
      expect(cands.every((c) => c.m.clase === "normal")).toBe(true);
    }
    const rec = recomendar({ catalogo: CAT, perfil: mac32, caso: "conversacion" });
    expect(rec.modelo?.clase ?? "normal").toBe("normal");
  });
});