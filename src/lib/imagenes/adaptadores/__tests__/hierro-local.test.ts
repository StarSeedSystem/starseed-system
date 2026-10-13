/**
 * Pruebas del hierro local y de la sugerencia de instalación (IMG1011E): todo puro, sin red ni disco.
 */
import { describe, expect, it } from "vitest";
import {
  eligeArchivosDescarga, espacioSuficiente, gpuDesdeVendor, hierroDesdeSondasWeb, huellaSugerencias,
  parseaHierroLocal, sistemaDesdePlataforma, textoGated, type ArchivoRepo,
} from "../hierro-local";
import { modeloPorId } from "../../../imagenes/modelos";
import { paqueteBase } from "../../../imagenes/sugerencias";

const GB = 1024 ** 3;
const F = (ruta: string, bytes: number | null): ArchivoRepo => ({ ruta, bytes });

describe("detección de sistema y GPU", () => {
  it("sistemaDesdePlataforma reconoce lo común y devuelve null en lo desconocido", () => {
    expect(sistemaDesdePlataforma("macOS")).toBe("macos");
    expect(sistemaDesdePlataforma("Windows")).toBe("windows");
    expect(sistemaDesdePlataforma("Linux armv8l")).toBe("linux");
    expect(sistemaDesdePlataforma("Android")).toBe("android");
    expect(sistemaDesdePlataforma("iPhone")).toBe("ios");
    expect(sistemaDesdePlataforma("")).toBeNull();
    expect(sistemaDesdePlataforma(null)).toBeNull();
  });
  it("gpuDesdeVendor mapea el vendedor de WebGPU y no inventa", () => {
    expect(gpuDesdeVendor("nvidia")).toBe("nvidia");
    expect(gpuDesdeVendor("Apple")).toBe("apple");
    expect(gpuDesdeVendor("amd")).toBe("amd");
    expect(gpuDesdeVendor("intel")).toBeNull();
    expect(gpuDesdeVendor(undefined)).toBeNull();
  });
});

describe("parseaHierroLocal (respuesta del servicio IMG1011A)", () => {
  const bueno = { so: "linux", gpu: "amd", vramGB: 10, ramGB: 24, webgpu: false, discoLibreBytes: 400 * GB, enLaMalla: ["flux1-schnell"] };
  it("acepta una respuesta completa y honesta", () => {
    const h = parseaHierroLocal(bueno);
    expect(h).not.toBeNull();
    expect(h!.vramGB).toBe(10);
    expect(h!.enLaMalla).toEqual(["flux1-schnell"]);
  });
  it("rechaza respuestas que faltan o mienten: sin hierro no se inventa", () => {
    expect(parseaHierroLocal(null)).toBeNull();
    expect(parseaHierroLocal({ so: "solaris", gpu: "amd", ramGB: 8 })).toBeNull();
    expect(parseaHierroLocal({ so: "linux", gpu: "intel-arc", ramGB: 8 })).toBeNull();
    expect(parseaHierroLocal({ so: "linux", gpu: "amd", ramGB: 0 })).toBeNull();
    expect(parseaHierroLocal({ so: "linux", gpu: "amd", ramGB: "8" })).toBeNull();
  });
  it("rama limpia: sin vram ni malla quedan null y [] y sirve para paqueteBase", () => {
    const h = parseaHierroLocal({ so: "macos", gpu: "apple", ramGB: 6, webgpu: true });
    expect(h).toMatchObject({ vramGB: null, discoLibreBytes: null, enLaMalla: [] });
    const p = paqueteBase({ so: h!.so, gpu: h!.gpu, vramGB: h!.vramGB, ramGB: h!.ramGB, webgpu: h!.webgpu }, { comercial: false });
    expect(p.instalar.length).toBeGreaterThan(0);
  });
});

describe("hierroDesdeSondasWeb (la web solo sabe WebGPU y una estimación)", () => {
  it("con plataforma y memoria da hierro, y GPU desconocida queda en «ninguna»", () => {
    const h = hierroDesdeSondasWeb({ webgpu: true, vendedorGpu: "intel", memoriaGB: 8, plataforma: "Linux x86_64" });
    expect(h).toEqual({ so: "linux", gpu: "ninguna", vramGB: null, ramGB: 8, webgpu: true });
    expect(hierroDesdeSondasWeb({ webgpu: true, vendedorGpu: "nvidia", memoriaGB: 16, plataforma: "Windows" })!.gpu).toBe("nvidia");
  });
  it("sin memoria o sin sistema reconocido se declara no saber: null", () => {
    expect(hierroDesdeSondasWeb({ webgpu: true, memoriaGB: null, plataforma: "Linux" })).toBeNull();
    expect(hierroDesdeSondasWeb({ webgpu: false, memoriaGB: 8, plataforma: "HTML5 OS" })).toBeNull();
  });
});

describe("eligeArchivosDescarga (archivos exactos de Hugging Face)", () => {
  const sdxl = modeloPorId("sdxl")!;
  const repo = [
    F("sd_xl_base_1.0.safetensors", 6.9 * GB), F("sd_xl_base_1.0_0.9vae.safetensors", 6.9 * GB),
    F("model_index.json", 600), F("tokenizer/merges.txt", 1.6e6), F("sd_xl_base_1.0.bin", 6.9 * GB),
  ];
  it("sin listado no promete nada (null)", () => {
    expect(eligeArchivosDescarga(sdxl, "q4", [])).toBeNull();
  });
  it("elige el GGUF según la cuantización y no el más grande siempre", () => {
    const ggufs = [F("model-Q4_K_M.gguf", 4 * GB), F("model-Q8_0.gguf", 8 * GB), F("model-f16.gguf", 13 * GB)];
    expect(eligeArchivosDescarga(sdxl, "q4", ggufs)).toMatchObject({ archivos: ["model-Q4_K_M.gguf"], bytesTotales: 4 * GB, incompleto: false });
    expect(eligeArchivosDescarga(sdxl, "q8", ggufs)!.archivos).toEqual(["model-Q8_0.gguf"]);
    expect(eligeArchivosDescarga(sdxl, "nativa", ggufs)!.archivos).toEqual(["model-f16.gguf"]);
  });
  it("con safetensors toma los pesos y los ligeros, sin duplicar los .bin", () => {
    const s = eligeArchivosDescarga(sdxl, "nativa", repo)!;
    expect(s.archivos).toContain("sd_xl_base_1.0.safetensors");
    expect(s.archivos).toContain("model_index.json");
    expect(s.archivos.some((r) => r.endsWith(".bin"))).toBe(false);
    expect(s.bytesTotales).toBeCloseTo(2 * 6.9 * GB + 600 + 1.6e6);
  });
  it("marca incompleta una selección con tamaño desconocido", () => {
    expect(eligeArchivosDescarga(sdxl, "q4", [F("model-Q4_K_M.gguf", null)])!.incompleto).toBe(true);
  });
});

describe("espacioSuficiente (regla ≥ 3×)", () => {
  it("exige el triple del tamaño de la descarga", () => {
    expect(espacioSuficiente(30 * GB, 10 * GB).ok).toBe(true);
    expect(espacioSuficiente(29 * GB, 10 * GB).ok).toBe(false);
    expect(espacioSuficiente(3e10, 1e10).ok).toBe(true);
  });
  it("con tamaño desconocido no se descarga", () => {
    expect(espacioSuficiente(500 * GB, 0).ok).toBe(false);
  });
});

describe("huellaSugerencias y textoGated", () => {
  const h = { so: "macos" as const, gpu: "apple" as const, vramGB: null, ramGB: 6, webgpu: true };
  it("la huella cambia si cambia el hierro, la malla o el catálogo (sugerencia que vuelve a salir)", () => {
    const a = huellaSugerencias(h, "2026-10-11");
    expect(huellaSugerencias(h, "2026-10-11")).toBe(a);
    expect(huellaSugerencias({ ...h, ramGB: 8 }, "2026-10-11")).not.toBe(a);
    expect(huellaSugerencias(h, "2026-11-01")).not.toBe(a);
    expect(huellaSugerencias(h, "2026-10-11", ["sdxl"])).not.toBe(a);
  });
  it("textoGated explica términos y token con enlaces y sin pedir claves en código", () => {
    const t = textoGated(modeloPorId("flux1-schnell")!);
    expect(t).toContain("https://huggingface.co/black-forest-labs/FLUX.1-schnell");
    expect(t).toContain("settings/tokens");
    expect(t).toContain("HF_TOKEN");
  });
});
