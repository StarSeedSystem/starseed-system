/**
 * Pruebas del adaptador SD-Turbo con WebGPU (IMG1011H).
 * Todo puro, sin red ni disco.
 */
import { describe, expect, it } from "vitest";
import { crearWebGPUSDTurboAdapter } from "../webgpu-sd-turbo.ts";

describe("crearWebGPUSDTurboAdapter", () => {
  it("debería existir", () => {
    const adapter = crearWebGPUSDTurboAdapter();
    expect(adapter).toBeDefined();
  });
});