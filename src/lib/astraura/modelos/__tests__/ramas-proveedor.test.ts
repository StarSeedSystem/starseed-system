// Ramas por proveedor de la Biblioteca (MQC3 · MOD1116): seis perfiles, orden estable y sin mutar.
import { describe, expect, it } from "vitest";
import type { CatalogoCapas } from "@/lib/astraura/capas/catalogo";
import { catalogoCompleto } from "../catalogo";
import { catalogoSemilla } from "../catalogo-datos";
import { MODELOS_API } from "../modelos-api";
import { construirPerfilNeurona, type EntradaPerfilNeurona, type PerfilNeurona } from "../perfil-neurona";
import { AVISO_CPU, ramasPorProveedor, type Rama } from "../ramas-proveedor";

const SHA = "a".repeat(64);
const capas: CatalogoCapas = {
  esquema: 1,
  actualizado: "2026-11-10",
  capas: [{
    id: "needle3-reflejo", familia: "Cactus-Compute/needle3", capa: "reflejo", modelo: "Cactus Needle 3",
    version: "3", formato: "cact", runtime: "needle-wasm", parametros: "121 M", disco_mb: 29,
    ram_min_mb: 256, sha256: SHA, fuente_oficial: "https://huggingface.co/Cactus-Compute/needle3",
    espejos: [], estado: "recomendado", medios: ["web"],
  }],
};
const CAT = catalogoCompleto(catalogoSemilla(), capas);
const base: EntradaPerfilNeurona = { plataforma: "tauri", ramReal: true, discoLibreGb: 200, enchufada: true, ollama: true, backend158: true, webgpu: true };
const movil = construirPerfilNeurona({ id: "movil", plataforma: "android", ramGb: 4, discoLibreGb: 40, wasm: true });
const portatil = construirPerfilNeurona({ ...base, id: "portatil", gpuRenderer: "Intel(R) UHD Graphics", ramGb: 16 });
const mac8 = construirPerfilNeurona({ ...base, id: "mac8", gpuRenderer: "Apple M1", ramGb: 8 });
const mac32 = construirPerfilNeurona({ ...base, id: "mac32", gpuRenderer: "Apple M2 Max", ramGb: 32 });
const mac64 = construirPerfilNeurona({ ...base, id: "mac64", gpuRenderer: "Apple M2 Ultra", ramGb: 64 });
const arm12 = construirPerfilNeurona({ ...base, id: "arm12", ramGb: 12 });

const rama = (ramas: Rama[], proveedor: string): Rama | undefined => ramas.find((r) => r.proveedor === proveedor);
const ollama = (p: PerfilNeurona): Rama | undefined => rama(ramasPorProveedor(CAT, [], p), "ollama");

describe("ramas por proveedor", () => {
  it("una rama por proveedor, de más a menos capaz, orden estable y sin mutar las entradas", () => {
    const antes = CAT.map((m) => m.id);
    const a = ramasPorProveedor(CAT, MODELOS_API, mac32, true);
    const b = ramasPorProveedor([...CAT].reverse(), [...MODELOS_API].reverse(), mac32, true);
    expect(a.map((r) => r.proveedor)).toEqual(b.map((r) => r.proveedor));
    expect(a.map((r) => r.modelos.map((f) => f.id))).toEqual(b.map((r) => r.modelos.map((f) => f.id)));
    expect(new Set(a.map((r) => r.proveedor)).size).toBe(a.length);
    expect(a.map((r) => r.proveedor)).toEqual(["astraura", "huihui_ai", "ollama", "abliteration.ai"]);
    expect(a[0].tipo).toBe("local");
    expect(a[a.length - 1].tipo).toBe("api");
    expect(a.find((r) => r.proveedor === "ollama")?.modelos[0].id).toBe("gemma4:31b");
    expect(CAT.map((m) => m.id)).toEqual(antes);
  });

  it("los seis perfiles producen ramas coherentes (encaje local, API sin encaje)", () => {
    for (const p of [movil, portatil, mac8, mac32, mac64, arm12]) {
      const ramas = ramasPorProveedor(CAT, MODELOS_API, p, true);
      expect(ramas.length).toBeGreaterThan(0);
      for (const r of ramas) {
        expect(r.modelos.length).toBeGreaterThan(0);
        expect(r.modelos.every((f) => (r.tipo === "local" ? f.encaje !== null : f.encaje === null))).toBe(true);
      }
    }
  });

  it("Mac de 8, 32 y 64 GB: el mejor local sube con la memoria", () => {
    expect(ollama(mac8)?.mejorQueCabe?.id).toBe("qwen3.5:4b");
    expect(ollama(mac32)?.mejorQueCabe?.id).toBe("gemma4:31b");
    expect(ollama(mac32)?.mejorQueCabe?.encaje?.veredicto).toBe("justo");
    expect(ollama(mac64)?.mejorQueCabe?.id).toBe("gemma4:31b");
    expect(ollama(mac64)?.mejorQueCabe?.encaje?.veredicto).toBe("recomendado");
  });

  it("portátil sin GPU de 16 GB: no sube al 9B (justo); usa el 4B holgado y avisa", () => {
    const r = ollama(portatil);
    expect(r?.mejorQueCabe?.id).toBe("qwen3.5:4b");
    expect(r?.masLigero?.id).toBe("qwen3.5:2b");
    expect(r?.aviso).toBe(AVISO_CPU);
  });

  it("servidor ARM de 12 GB sin GPU: la 4B, no la 9b, como mejor que cabe", () => {
    const r = ollama(arm12);
    expect(r?.mejorQueCabe?.id).toBe("qwen3.5:4b");
    expect(r?.mejorQueCabe?.id).not.toBe("qwen3.5:9b");
    expect(r?.aviso).toBe(AVISO_CPU);
  });

  it("móvil de 4 GB: solo las capas de Astraura caben; los modelos de Ollama no", () => {
    const r = ramasPorProveedor(CAT, [], movil);
    expect(rama(r, "astraura")?.mejorQueCabe).not.toBeNull();
    expect(rama(r, "ollama")?.mejorQueCabe).toBeNull();
  });
});

describe("ramas de API", () => {
  it("solo se ofrecen con permiso de lo sin filtros, y solo lo vigente", () => {
    expect(ramasPorProveedor(CAT, MODELOS_API, mac64).some((r) => r.tipo === "api")).toBe(false);
    const api = rama(ramasPorProveedor(CAT, MODELOS_API, mac64, true), "abliteration.ai");
    expect(api?.modelos.map((f) => f.id)).toEqual([
      "abliterated-model-large-flash",
      "abliterated-model-large-v2",
      "abliterated-model",
    ]);
    expect(api?.mejorQueCabe?.id).toBe("abliterated-model-large-flash");
  });

  it("memoria por debajo del mínimo de todos: solo queda la rama de API", () => {
    const nano = construirPerfilNeurona({ id: "nano", plataforma: "web", ramGb: 0.1, discoLibreGb: 1, wasm: true });
    const r = ramasPorProveedor(CAT, MODELOS_API, nano, true);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.tipo === "api")).toBe(true);
  });
});
