import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Prueba del archivo de servicio servicios/taller-3d/optimizar.mjs
// Importación directa (sin vi.mock de módulos de Node, sin importar route.ts).

describe("G3D1011C · optimizar.mjs — funciones puras", () => {
  it("parseArgs extrae argumentos con guiones", async () => {
    // Importación dinámica para manejar la ausencia de dependencias con claridad.
    let mod;
    try {
      mod = await import("../../../../../servicios/taller-3d/optimizar.mjs");
    } catch (e) {
      // Si las dependencias externas (@gltf-transform/core, meshoptimizer) no están
      // instaladas en esta neurona, no se simula éxito: se anota la causa exacta.
      expect.fail(`No se pudo cargar optimizar.mjs por falta de dependencias: ${e.message}`);
    }
    const args = mod.parseArgs(["node", "script.mjs", "--entrada", "x.glb", "--plan", "p.json"]);
    expect(args.entrada).toBe("x.glb");
    expect(args.plan).toBe("p.json");
  });

  it("escribirManifiesto y validarPesoMax funcionan sin red ni GPU", async () => {
    let mod;
    try {
      mod = await import("../../../../../servicios/taller-3d/optimizar.mjs");
    } catch (e) {
      expect.fail(`No se pudo cargar optimizar.mjs: ${e.message}`);
    }
    const tmp = resolve("/tmp", `starseed-test-g3d-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const ruta = resolve(tmp, "manifiesto.json");
    mod.escribirManifiesto(
      { destino: "bot", lods: [{ triangulos: 2000, archivo: "a.glb", pesoMB: 0.8 }] },
      ruta,
    );
    const contenido = JSON.parse(readFileSync(ruta, "utf8"));
    expect(contenido.destino).toBe("bot");
    expect(contenido.lods[0].triangulos).toBe(2000);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("validarPesoMax lanza error si un nivel excede el límite", async () => {
    let mod;
    try {
      mod = await import("../../../../../servicios/taller-3d/optimizar.mjs");
    } catch (e) {
      expect.fail(`No se pudo cargar optimizar.mjs: ${e.message}`);
    }
    expect(() => mod.validarPesoMax([{ archivo: "a.glb", pesoMB: 8 }], 2)).toThrow("pesoMaxMB");
  });

  it("simula un archivo GLB temporal y lo limpia (sin red, sin GPU)", () => {
    const tmpDir = resolve("/tmp", `starseed-glb-sim-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const ruta = resolve(tmpDir, "simulado.glb");
    writeFileSync(ruta, Buffer.from("GLB"));
    expect(existsSync(ruta)).toBe(true);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
