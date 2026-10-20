// Pruebas del módulo puro de paquetes de fondos con Shaders (VST1018F · Ola 1018F).

import { describe, it, expect } from "vitest";
import { FONDO_SHADER_REPO } from "../packages";

describe("El repo fondos-shaders (builtin) se valida correctamente", () => {
  it("valida la forma del repo y los ids únicos de los paquetes", () => {
    const repo = FONDO_SHADER_REPO;
    expect(repo).not.toBeNull();
    expect(repo.id).toBe("fondos-shaders");
    expect(repo.name).toBe("Fondos con Shaders");
    expect(repo.builtin).toBe(true);

    // El primer paquete del repo es el wrapper repositorio (fondos-shaders)
    expect(repo.packages[0].id).toBe("fondos-shaders");
    expect(repo.packages[0].kind).toBe("repo");
    expect((repo.packages[0].payload as any).categoria).toBe("fondos");
    expect((repo.packages[0].payload as any).claseLicencia).toBe("libre");
    expect((repo.packages[0].payload as any).githubRepo).toBe("shader-effects-inc/shaders");

    // Los 4 siguientes son los sets oficiales StarSeed (kind design)
    const disenoSets = repo.packages.slice(1);
    expect(disenoSets).toHaveLength(4);

    // Todos los paquetes del repo tienen ids únicos
    const ids = repo.packages.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    // Todos los sets de diseño tienen types de componentes válidos
    const validComponentTypes = new Set(["MeshGradient", "Aurora", "Nebula", "Glass", "FilmGrain", "SolidColor", "LinearGradient"]);
    for (const set of disenoSets) {
      expect(set.kind).toBe("design");
      expect(set.payload.materialClass).toBeDefined();

      const setsFondo = set.payload.setFondo as any;
      expect(setsFondo).toBeDefined();
      expect(setsFondo.structureVersion).toBe(1);
      expect(Array.isArray(setsFondo.components)).toBe(true);
      expect(setsFondo.components).toHaveLength(4);

      for (const comp of setsFondo.components) {
        expect(comp.type).toBeDefined();
        expect(validComponentTypes.has(comp.type)).toBe(true);
        expect(comp.id).toBeDefined();
        expect(comp.props).toBeDefined();
      }
    }
  });
});
