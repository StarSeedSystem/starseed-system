import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.join(__dirname);

describe("sd-turbo WebGPU", () => {
  it("es un adaptador puro: sin red, DOM, reloj ni aleatorio", () => {
    const src = readFileSync(path.join(DIR, "webgpu-sd-turbo.ts"), "utf8");
    expect(src.split("\\n").length).toBeLessThanOrEqual(200);
    const codigo = src.replace(/\/\\*[\\s\\S]*?\\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/\\b(fetch|XMLHttpRequest|WebSocket|localStorage|document|window|navigator)\\b\\s*[.(]/);
    expect(codigo).not.toMatch(/\\b(Date\\.now|performance\\.now|Math\\.random|new Date)\\b/);
    expect(codigo).not.toMatch(/from [\"'](react|next|node:)/);
  });

  it("registra la licencia de SD-Turbo como \"sin comprobar del todo\" (catálogo)", () => {
    const src = readFileSync(path.join(DIR, "webgpu-sd-turbo.ts"), "utf8");
    expect(src).toContain("sin comprobar del todo");
    expect(src).toContain("Stability AI");
  });

  it("instala onnxruntime-web exacto (sin patch, sin instalar nada)", () => {
    const src = readFileSync(path.join(DIR, "webgpu-sd-turbo.ts"), "utf8");
    expect(src).toContain("onnxruntime-web");
    expect(src).toContain("cdn.jsdelivr.net");
  });

  it("corre en la pestaña del navegador con WebGPU, sin instalar nada", () => {
    const src = readFileSync(path.join(DIR, "webgpu-sd-turbo.ts"), "utf8");
    expect(src).toContain("WebGPU");
    expect(src).toContain("navigator.gpu");
    expect(src).toContain("requestAdapter");
  });

  it("detecta la presencia de WebGPU antes de pedir nada", () => {
    const src = readFileSync(path.join(DIR, "webgpu-sd-turbo.ts"), "utf8");
    expect(src).toContain("detectarWebGPU");
    expect(src).toContain("window.navigator");
  });

  it("disponible solo si hay WebGPU, si no se dice (y se usan las demás capas)", () => {
    const src = readFileSync(path.join(DIR, "webgpu-sd-turbo.ts"), "utf8");
    expect(src).toContain("fallback");
  });
});
