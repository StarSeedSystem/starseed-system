// Tallas pequeñas de la familia sin filtros (MOD1116 · 2026-11-16): 2B añadida, 0.8B NO (base no existe), 9B con licencia/nota actualizadas.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leerCatalogo } from "@/lib/astraura/capas/catalogo";
import { catalogoCompleto, modeloValido } from "../catalogo";
import { candidatosPara } from "../recomendar";
import { catalogoSemilla, MODELOS_SIN_FILTROS_SEMILLA, MODELOS_SEMILLA } from "../catalogo-datos";
import { construirPerfilNeurona, type PerfilNeurona } from "../perfil-neurona";
import { CASOS, type CasoUso, type ModeloLocal } from "../tipos";

const capas = leerCatalogo(JSON.parse(readFileSync(join(process.cwd(), "config/capas-astraura.json"), "utf8")));
const semilla = catalogoSemilla();
const CAT: ModeloLocal[] = catalogoCompleto(semilla, capas);
const SF = CAT.filter((m) => m.clase === "abliterated");

const base = { plataforma: "tauri" as const, ramReal: true, discoLibreGb: 300, enchufada: true, ollama: true, backend158: true, webgpu: true };
const mac8 = construirPerfilNeurona({ ...base, id: "mac8", nombre: "MacBook 8", gpuRenderer: "Apple M1", ramGb: 8 });
const pc16 = construirPerfilNeurona({ ...base, id: "pc16", nombre: "PC 16", gpuRenderer: "NVIDIA GeForce RTX 4070", ramGb: 16, vramGb: 12 });
const mac32 = construirPerfilNeurona({ ...base, id: "mac32", nombre: "MaggaBook", gpuRenderer: "Apple M2 Max", ramGb: 32, iaMalla: true });
const MUESTRA: PerfilNeurona[] = [mac8, pc16, mac32];

describe("variantes pequeñas qwen3.5-abliterated: 2B y 9B actualizadas; 0.8B no entra (base ausente)", () => {
  it("la semilla SOLO incluye huihui_ai/qwen3.5-abliterated:2B (base qwen3.5:2b existe) y NO 0.8B (qwen3.5:0.8b no existe en MODELOS_SEMILLA)", () => {
    const ids = MODELOS_SIN_FILTROS_SEMILLA.filter((m) => m.familia === "Qwen3.5 sin filtros").map((m) => m.id).sort();
    expect(ids).toEqual([
      "huihui_ai/qwen3.5-abliterated:27b",
      "huihui_ai/qwen3.5-abliterated:2B",
      "huihui_ai/qwen3.5-abliterated:4B",
      "huihui_ai/qwen3.5-abliterated:9b",
    ]);
    // Comprobación explícita: la base 0.8b no existe en MODELOS_SEMILLA
    const bases = MODELOS_SEMILLA.map((m) => m.id);
    expect(bases).not.toContain("qwen3.5:0.8b");
    // Por eso 0.8B NO se añadió (comentario en catalogo-datos.ts línea 156)
  });

  it("modeloValido ACEPTA la nueva 2B (comprobado 2026-11-16, baseId correcto, fuente viva, sin puntuación propia)", () => {
    const m2 = SF.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:2B")!;
    expect(modeloValido(m2)).toBe(true);
    expect(m2.comprobado).toBe("2026-11-16");
    expect(m2.baseId).toBe("qwen3.5:2b");
    expect(m2.descargaGb).toBe(1.9);
    expect(m2.contextoK).toBe(256);
    expect(m2.herramientas).toBe(true);
    expect(m2.vision).toBe(true);
    expect(m2.puntuacion).toBeNull();
    expect(m2.fuentes.every((f) => f.startsWith("https://ollama.com/huihui_ai/"))).toBe(true);
  });

  it("la 9B actualiza licencia y nota (Apache 2.0 ficha Ollama 2026-11-16; base RESTRINGIDA requiere revisión)", () => {
    const m9 = SF.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:9b")!;
    expect(m9.comprobado).toBe("2026-11-16");
    expect(m9.licencia).toBe("Apache 2.0 (ficha de Ollama, 2026-11-16)");
    expect(m9.nota).toContain("RESTRINGIDA");
    expect(m9.nota).toContain("Hugging Face dice Apache-2.0");
    expect(m9.descargaGb).toBe(6.6);
  });

  it("las cifras de 4B y 27B NO cambian (solo 2B nueva y 9B licencia/nota)", () => {
    const m4 = SF.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:4B")!;
    const m27 = SF.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:27b")!;
    expect(m4.descargaGb).toBe(3.3);
    expect(m4.comprobado).toBe("2026-11-10"); // fecha original
    expect(m27.descargaGb).toBe(17);
    expect(m27.comprobado).toBe("2026-11-10");
  });
});

describe("«Automático» sigue sin elegir NINGUNA variante sin filtros (incluidas las nuevas 2B y 9B)", () => {
  it("candidatosPara filtra clase === 'normal': la 2B y la 9B NO aparecen en candidatos de ninguna neurona × caso", () => {
    for (const perfil of MUESTRA) {
      for (const caso of CASOS) {
        const cands = candidatosPara(CAT, perfil, caso);
        const ids = cands.map((c) => c.m.id);
        expect(ids).not.toContain("huihui_ai/qwen3.5-abliterated:2B");
        expect(ids).not.toContain("huihui_ai/qwen3.5-abliterated:9b");
        expect(cands.every((c) => c.m.clase === "normal")).toBe(true);
      }
    }
  });

  it("añadir las variantes al catálogo no cambia NI UNA recomendación automática (tabla completa neurona × caso)", () => {
    const sin = CAT.filter((m) => m.clase === "normal");
    for (const perfil of MUESTRA) {
      for (const caso of CASOS) {
        const a = { modelo: null as ModeloLocal | null, ruta: { tipo: "local" as const }, razon: "" };
        // Usamos recomendar del módulo recomendar (importado indirectamente vía candidatosPara)
        // Aquí comparamos que el mejor candidato (primero de candidatosPara) es el mismo
        const conVar = candidatosPara(CAT, perfil, caso);
        const sinVar = candidatosPara(sin, perfil, caso);
        if (conVar.length > 0 && sinVar.length > 0) {
          expect(conVar[0].m.id).toBe(sinVar[0].m.id);
        } else {
          expect(conVar.length).toBe(sinVar.length);
        }
      }
    }
  });
});