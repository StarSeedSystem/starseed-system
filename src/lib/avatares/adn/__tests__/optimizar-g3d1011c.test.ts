import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, readFileSync, rmSync } from "node:fs";

describe("optimizar.mjs (rescatado de la rama nube)", () => {
  it("parseArgs extrae argumentos con guiones", async () => {
    // Importación dinámica para manejar la ausencia de dependencias con claridad.
    let mod: any;
    try {
      mod = await import("../../../../../servicios/taller-3d/optimizar.mjs");
    } catch (e: any) {
      // Si las dependencias externas (@gltf-transform/core, meshoptimizer) no están
      // instaladas en esta neurona, no se simula éxito: se anota la causa exacta.
      expect.fail(`No se pudo cargar optimizar.mjs por falta de dependencias: ${e.message ?? String(e)}`);
    }
    const args = mod.parseArgs(["node", "script.mjs", "--entrada", "x.glb", "--plan", "p.json"]);
      expect(args.entrada).toBe("x.glb");
      expect(args.plan).toBe("p.json");
  });

  it("escribirManifiesto y validarPesoMax funcionan sin red ni GPU", async () => {
    let mod: any;
    try {
      mod = await import("../../../../../servicios/taller-3d/optimizar.mjs");
    } catch (e: any) {
      expect.fail(`No se pudo cargar optimizar.mjs: ${e.message ?? String(e)}`);
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
    let mod: any;
    try {
      mod = await import("../../../../../servicios/taller-3d/optimizar.mjs");
    } catch (e: any) {
      expect.fail(`No se pudo cargar optimizar.mjs: ${e.message ?? String(e)}`);
    }
    expect(() => mod.validarPesoMax([{ archivo: "a.glb", pesoMB: 8 }], 2)).toThrow("pesoMaxMB");
  });

  // Otros casos (solo el título; mismo criterio):
  // optimizar-g3d1011c.test.ts :: simula un archivo GLB temporal y lo limpia (sin red, sin GPU)
});